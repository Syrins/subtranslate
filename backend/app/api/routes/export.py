from fastapi import APIRouter, Depends, HTTPException
import shutil
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
import structlog

from app.core.security import get_current_user
from app.core.supabase import get_supabase_admin
from app.core.config import get_settings
from app.models.schemas import ExportJobCreate
from app.utils.ffmpeg import burn_subtitles, mux_subtitles, CODEC_MAP
from app.services.storage import get_r2_storage
from app.services.cleanup import mark_uploaded_to_user_storage, recalculate_user_storage

logger = structlog.get_logger()
router = APIRouter(prefix="/export", tags=["Export"])


@router.post("")
def create_export_job(
    body: ExportJobCreate,
    user: dict = Depends(get_current_user),
):
    """Create an export job (burn-in or soft-sub)."""
    sb = get_supabase_admin()

    # Verify project
    project = sb.table("projects").select("*").eq("id", body.project_id).eq("user_id", user["id"]).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check plan limits for resolution
    profile = user["profile"]
    try:
        plan = sb.table("subscription_plans").select("*").eq("id", profile.get("plan_id", "free")).single().execute()
    except Exception:
        plan = None
    if plan and plan.data:
        allowed_res = plan.data.get("max_export_resolution", "720p")
        res_order = ["480p", "720p", "1080p", "1440p", "4k"]
        req_res = body.resolution if body.resolution and body.resolution != "original" else None
        if req_res and req_res in res_order and allowed_res in res_order:
            if res_order.index(req_res) > res_order.index(allowed_res):
                raise HTTPException(status_code=403, detail=f"Your plan allows max {allowed_res} export")

        if plan.data.get("watermark_required") and not body.include_watermark:
            body.include_watermark = True
            body.watermark_text = body.watermark_text or "SubTranslate"

    job_id = str(uuid.uuid4())
    job_row = {
        "id": job_id,
        "project_id": body.project_id,
        "user_id": user["id"],
        "mode": body.mode.value,
        "resolution": body.resolution,
        "video_codec": body.video_codec.value,
        "audio_codec": body.audio_codec,
        "include_watermark": body.include_watermark,
        "watermark_text": body.watermark_text,
        "keep_audio_tracks": body.keep_audio_tracks,
        "status": "queued",
    }
    sb.table("export_jobs").insert(job_row).execute()

    sb.table("projects").update({"status": "exporting"}).eq("id", body.project_id).execute()

    try:
        from app.workers.tasks import run_export_task
        run_export_task.delay(
            job_id=job_id,
            project_id=body.project_id,
            user_id=user["id"],
            mode=body.mode.value,
            resolution=body.resolution,
            video_codec=body.video_codec.value,
            audio_codec=body.audio_codec,
            watermark_text=body.watermark_text if body.include_watermark else None,
            watermark_position=body.watermark_position,
            subtitle_style=body.subtitle_style,
        )
    except Exception as e:
        logger.warning("celery_unavailable_export_fallback_thread", job_id=job_id, error=str(e))
        # Fallback: run in background thread when Celery/Redis is unavailable
        import threading
        thread = threading.Thread(
            target=_run_export,
            kwargs={
                "job_id": job_id,
                "project_id": body.project_id,
                "user_id": user["id"],
                "mode": body.mode.value,
                "resolution": body.resolution,
                "video_codec": body.video_codec.value,
                "audio_codec": body.audio_codec,
                "watermark_text": body.watermark_text if body.include_watermark else None,
                "watermark_position": body.watermark_position,
                "subtitle_style": body.subtitle_style,
            },
            daemon=True,
        )
        thread.start()

    return {"id": job_id, "status": "queued"}


@router.get("/active/{project_id}")
def get_active_export_job(project_id: str, user: dict = Depends(get_current_user)):
    """Get the active (queued/processing) export job for a project, if any."""
    sb = get_supabase_admin()
    result = (
        sb.table("export_jobs")
        .select("*")
        .eq("project_id", project_id)
        .eq("user_id", user["id"])
        .in_("status", ["queued", "processing"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data or len(result.data) == 0:
        return None
    return result.data[0]


@router.get("/{job_id}")
def get_export_job(job_id: str, user: dict = Depends(get_current_user)):
    """Get export job status."""
    sb = get_supabase_admin()
    result = sb.table("export_jobs").select("*").eq("id", job_id).eq("user_id", user["id"]).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return result.data


@router.get("/{job_id}/download")
def download_export(job_id: str, user: dict = Depends(get_current_user)):
    """Download the exported file."""
    sb = get_supabase_admin()
    job = sb.table("export_jobs").select("*").eq("id", job_id).eq("user_id", user["id"]).single().execute()
    if not job.data:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.data["status"] != "completed":
        raise HTTPException(status_code=400, detail="Export not completed yet")

    file_url = job.data.get("output_file_url")
    if not file_url:
        raise HTTPException(status_code=404, detail="Export file not found")

    # Return relative file URL for download (frontend prepends API base)
    return {"url": f"/files/{file_url}"}


@router.post("/{job_id}/cancel")
def cancel_export_job(job_id: str, user: dict = Depends(get_current_user)):
    """Cancel a running export job."""
    sb = get_supabase_admin()
    job = sb.table("export_jobs").select("*").eq("id", job_id).eq("user_id", user["id"]).single().execute()
    if not job.data:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.data["status"] not in ("queued", "processing"):
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")

    sb.table("export_jobs").update({"status": "cancelled"}).eq("id", job_id).execute()
    sb.table("projects").update({"status": "translated"}).eq("id", job.data["project_id"]).execute()
    return {"status": "cancelled"}


@router.delete("/previous/{project_id}")
def delete_previous_export(project_id: str, user: dict = Depends(get_current_user)):
    """Delete previous export files for a project before re-exporting."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()

    # Verify project ownership
    project = sb.table("projects").select("id, status").eq("id", project_id).eq("user_id", user["id"]).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # Find completed export jobs for this project
    jobs = (
        sb.table("export_jobs")
        .select("id, output_file_url")
        .eq("project_id", project_id)
        .eq("user_id", user["id"])
        .eq("status", "completed")
        .execute()
    )

    deleted_files = 0
    for job in (jobs.data or []):
        # Delete from R2 storage
        if job.get("output_file_url"):
            try:
                r2.delete(job["output_file_url"])
                deleted_files += 1
            except Exception as e:
                logger.warning("export_file_delete_failed", key=job["output_file_url"], error=str(e))

        # Delete the old export job record
        sb.table("export_jobs").delete().eq("id", job["id"]).execute()

    # Delete stored_files records for export_video type
    sb.table("stored_files").delete().eq("project_id", project_id).eq("user_id", user["id"]).eq("file_type", "export_video").execute()

    # Reset project status back to translated
    if project.data.get("status") == "exported":
        sb.table("projects").update({"status": "translated"}).eq("id", project_id).execute()

    # Recalculate storage
    _recalculate_user_storage(sb, user["id"])

    return {"deleted_files": deleted_files, "message": "Önceki dışa aktarma dosyaları silindi."}


@router.post("/{project_id}/uploaded-to-own-storage")
def notify_uploaded_to_own_storage(project_id: str, user: dict = Depends(get_current_user)):
    """User uploaded export to their own Cloudflare/Backblaze — delete from our R2."""
    sb = get_supabase_admin()
    project = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user["id"]).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    deleted = mark_uploaded_to_user_storage(project_id)
    return {"deleted_files": deleted, "message": "Dosyalar kendi depolamanıza yüklendiği için sunucumuzdan silindi."}


def _run_export(
    job_id: str,
    project_id: str,
    user_id: str,
    mode: str,
    resolution: str,
    video_codec: str,
    audio_codec: str,
    watermark_text: str | None,
    watermark_position: str = "bottom-right",
    subtitle_style: dict | None = None,
):
    """Sync background task: export video with subtitles. Runs in a separate thread."""
    import time
    sb = get_supabase_admin()
    r2 = get_r2_storage()
    settings = get_settings()
    work_dir = settings.temp_path / f"export_{job_id}"
    work_dir.mkdir(parents=True, exist_ok=True)

    # Track last progress to avoid spamming DB with identical updates
    _last_progress = [0]

    def _update_progress(pct: int):
        """Write ffmpeg progress to DB (throttled: only when changed by >=2%)."""
        # Map ffmpeg 0-100 to overall 30-90 range (30% = download done, 90% = encode done)
        overall = 30 + int(pct * 0.6)
        if overall <= _last_progress[0]:
            return
        if overall - _last_progress[0] < 2 and overall < 90:
            return
        _last_progress[0] = overall
        try:
            sb.table("export_jobs").update({"progress": overall}).eq("id", job_id).execute()
        except Exception:
            pass

    try:
        sb.table("export_jobs").update({
            "status": "processing",
            "progress": 5,
        }).eq("id", job_id).execute()

        # Get project info
        project = sb.table("projects").select("*").eq("id", project_id).single().execute()
        if not project.data or not project.data.get("file_url"):
            raise RuntimeError("Project source file not found")

        sb.table("export_jobs").update({"progress": 10}).eq("id", job_id).execute()

        # Copy source video to work dir (no RAM load for large files)
        source_ext = Path(project.data["file_name"]).suffix or ".mkv"
        source_path = work_dir / f"source{source_ext}"
        r2.copy_to(project.data["file_url"], str(source_path))

        sb.table("export_jobs").update({"progress": 20}).eq("id", job_id).execute()

        # Get translated subtitle file from storage
        sub_files = sb.table("subtitle_files").select("*").eq("project_id", project_id).execute()
        translated_url = None
        for sf in (sub_files.data or []):
            if sf.get("translated_file_url"):
                translated_url = sf["translated_file_url"]
                break
        if not translated_url:
            raise RuntimeError("No translated subtitle file found")

        sub_data = r2.download(translated_url)
        # Preserve original subtitle format extension (could be .ass, .ssa, .srt, .vtt)
        sub_ext = Path(translated_url).suffix or ".srt"
        sub_path = work_dir / f"translated{sub_ext}"
        sub_path.write_bytes(sub_data)

        sb.table("export_jobs").update({"progress": 30}).eq("id", job_id).execute()

        # Check if cancelled before starting expensive FFmpeg encode
        job_check = sb.table("export_jobs").select("status").eq("id", job_id).single().execute()
        if job_check.data and job_check.data["status"] == "cancelled":
            logger.info("export_cancelled_before_encode", job_id=job_id)
            sb.table("projects").update({"status": "translated"}).eq("id", project_id).execute()
            return

        # Export based on mode
        output_ext = ".mp4" if mode == "burn_in" else source_ext
        output_path = work_dir / f"output{output_ext}"
        start_time = time.time()

        ffmpeg_codec = CODEC_MAP.get(video_codec, "libx264")

        if mode == "burn_in":
            burn_subtitles(
                input_path=str(source_path),
                subtitle_path=str(sub_path),
                output_path=str(output_path),
                resolution=resolution if resolution != "original" else None,
                video_codec=ffmpeg_codec,
                audio_codec="copy" if audio_codec == "copy" else audio_codec,
                watermark_text=watermark_text,
                watermark_position=watermark_position,
                subtitle_style=subtitle_style,
                progress_callback=_update_progress,
            )
        else:
            mux_subtitles(
                input_path=str(source_path),
                subtitle_path=str(sub_path),
                output_path=str(output_path),
            )

        elapsed_ms = int((time.time() - start_time) * 1000)
        output_size = output_path.stat().st_size

        job_check = sb.table("export_jobs").select("status").eq("id", job_id).single().execute()
        if job_check.data and job_check.data["status"] == "cancelled":
            logger.info("export_cancelled_after_encode", job_id=job_id)
            sb.table("projects").update({"status": "translated"}).eq("id", project_id).execute()
            return

        sb.table("export_jobs").update({"progress": 90}).eq("id", job_id).execute()

        # Get retention days for user's plan
        try:
            profile = sb.table("profiles").select("plan_id").eq("id", user_id).single().execute()
            plan_id = profile.data.get("plan_id", "free") if profile.data else "free"
            plan = sb.table("subscription_plans").select("retention_days").eq("id", plan_id).single().execute()
            retention_days = plan.data.get("retention_days", 1) if plan.data else 1
        except Exception:
            retention_days = 1
        expires_at = (datetime.now(timezone.utc) + timedelta(days=retention_days)).isoformat()

        # Upload export to R2 (file copy, no RAM load)
        storage_key = r2.get_storage_key(user_id, project_id, "export", f"{job_id}{output_ext}")
        r2.upload_file(storage_key, str(output_path), content_type=f"video/{output_ext.lstrip('.')}")

        sb.table("export_jobs").update({"progress": 95}).eq("id", job_id).execute()

        # Track in stored_files
        sb.table("stored_files").insert({
            "user_id": user_id,
            "project_id": project_id,
            "file_type": "export_video",
            "storage_path": storage_key,
            "file_size_bytes": output_size,
            "cdn_url": r2.get_cdn_url(storage_key),
            "expires_at": expires_at,
        }).execute()

        # Update job
        sb.table("export_jobs").update({
            "status": "completed",
            "progress": 100,
            "output_file_url": storage_key,
            "output_file_size_bytes": output_size,
            "duration_ms": elapsed_ms,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        sb.table("projects").update({"status": "exported"}).eq("id", project_id).execute()

        # Recalculate storage
        _recalculate_user_storage(sb, user_id)

        logger.info("export_completed", job_id=job_id, size=output_size, elapsed_ms=elapsed_ms)

    except Exception as e:
        logger.error("export_failed", job_id=job_id, error=str(e))
        sb.table("export_jobs").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", job_id).execute()
        sb.table("projects").update({"status": "translated"}).eq("id", project_id).execute()
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _recalculate_user_storage(sb, user_id: str):
    """Delegate to shared helper in cleanup module."""
    recalculate_user_storage(sb, user_id)
