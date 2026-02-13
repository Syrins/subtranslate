from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Body
from typing import Optional
import shutil
import uuid
import tempfile
import threading
from pathlib import Path
from datetime import datetime, timezone, timedelta
import structlog

from app.core.security import get_current_user
from app.core.supabase import get_supabase_admin
from app.core.config import get_settings
from app.models.schemas import ProjectCreate, ProjectResponse, UrlDownloadRequest
from app.utils.ffmpeg import get_media_info, extract_all_subtitles, create_web_preview, needs_web_transcode
from app.services.subtitle_parser import parse_subtitle_file, write_srt
from app.services.storage import get_r2_storage
from app.services.cleanup import ensure_storage_for_upload, check_storage_limit, recalculate_user_storage

logger = structlog.get_logger()
router = APIRouter(prefix="/projects", tags=["Projects"])


def _save_upload_file(upload: UploadFile, dest: Path, max_bytes: int) -> int:
    """Stream an UploadFile to disk with a hard size limit. Returns written bytes."""
    written = 0
    chunk_size = 1024 * 1024  # 1MB
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = upload.file.read(chunk_size)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Dosya çok büyük. Maksimum {max_bytes // (1024 * 1024)}MB",
                    )
                out.write(chunk)
    finally:
        try:
            upload.file.close()
        except Exception:
            pass
    return written


@router.get("")
def list_projects(user: dict = Depends(get_current_user)):
    """List all projects for the current user."""
    sb = get_supabase_admin()
    result = sb.table("projects").select("*").eq("user_id", user["id"]).order("created_at", desc=True).execute()
    return result.data


@router.get("/storage/info")
def get_storage_info(user: dict = Depends(get_current_user)):
    """Get user's storage usage and limits."""
    return check_storage_limit(user["id"])


@router.get("/storage/files")
def list_stored_files(
    location: str = "all",
    user: dict = Depends(get_current_user),
):
    """List stored files for the current user with project names.

    Query params:
      location: 'system' (on server), 'external' (uploaded to user storage), 'all' (default)
    """
    sb = get_supabase_admin()
    query = (
        sb.table("stored_files")
        .select("*, projects(name)")
        .eq("user_id", user["id"])
    )
    if location == "system":
        query = query.eq("uploaded_to_user_storage", False)
    elif location == "external":
        query = query.eq("uploaded_to_user_storage", True)
    # 'all' → no filter

    result = query.order("created_at", desc=True).execute()

    files = []
    for f in (result.data or []):
        project_info = f.pop("projects", None)
        f["project_name"] = project_info.get("name", "—") if project_info else "—"
        files.append(f)
    return files


@router.patch("/storage/files/{file_id}/rename")
def rename_stored_file(file_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Rename a stored file's display name."""
    sb = get_supabase_admin()
    new_name = body.get("display_name", "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="display_name is required")

    file_record = sb.table("stored_files").select("id").eq("id", file_id).eq("user_id", user["id"]).single().execute()
    if not file_record.data:
        raise HTTPException(status_code=404, detail="File not found")

    sb.table("stored_files").update({"display_name": new_name}).eq("id", file_id).execute()
    return {"ok": True}


@router.delete("/storage/files/{file_id}")
def delete_stored_file(file_id: str, user: dict = Depends(get_current_user)):
    """Delete a stored file from storage and database."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()

    file_record = sb.table("stored_files").select("*").eq("id", file_id).eq("user_id", user["id"]).single().execute()
    if not file_record.data:
        raise HTTPException(status_code=404, detail="File not found")

    # Delete from storage
    try:
        r2.delete(file_record.data["storage_path"])
    except Exception as e:
        logger.warning("storage_file_delete_failed", key=file_record.data["storage_path"], error=str(e))

    # Delete DB record
    sb.table("stored_files").delete().eq("id", file_id).execute()

    # Recalculate storage
    _recalculate_user_storage(sb, user["id"])
    return {"ok": True}


@router.get("/storage/files/{file_id}/url")
def get_stored_file_url(file_id: str, user: dict = Depends(get_current_user)):
    """Get CDN/download URL for a stored file."""
    sb = get_supabase_admin()

    file_record = sb.table("stored_files").select("storage_path, cdn_url").eq("id", file_id).eq("user_id", user["id"]).single().execute()
    if not file_record.data:
        raise HTTPException(status_code=404, detail="File not found")

    return {"url": file_record.data.get("cdn_url", ""), "storage_path": file_record.data["storage_path"]}


@router.get("/{project_id}")
def get_project(project_id: str, user: dict = Depends(get_current_user)):
    """Get a single project with details."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()
    result = sb.table("projects").select("*").eq("id", project_id).eq("user_id", user["id"]).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    data = result.data
    # Add video_url for frontend playback
    data["needs_transcode"] = False
    if data.get("file_url"):
        file_url = data["file_url"]
        has_preview = False
        # 1) Check stored_files DB for existing web preview
        try:
            preview = sb.table("stored_files").select("storage_path").eq(
                "project_id", project_id
            ).eq("file_type", "preview").maybeSingle().execute()
            if preview.data and preview.data.get("storage_path"):
                preview_path = r2._resolve(preview.data["storage_path"])
                if preview_path.exists():
                    file_url = preview.data["storage_path"]
                    has_preview = True
        except Exception:
            pass
        # 2) Fallback: check if preview.mp4 exists on disk next to source file
        if not has_preview:
            try:
                source_path = r2._resolve(data["file_url"])
                preview_sibling = source_path.parent / "preview.mp4"
                if preview_sibling.exists():
                    # Compute the storage key for this preview
                    source_key = data["file_url"]
                    preview_key = str(Path(source_key).parent / "preview.mp4").replace("\\", "/")
                    file_url = preview_key
                    has_preview = True
                    # Register in DB so cleanup/retention can manage it
                    try:
                        preview_size = preview_sibling.stat().st_size
                        profile = user.get("profile", {})
                        plan_q = sb.table("subscription_plans").select("retention_days").eq(
                            "id", profile.get("plan_id", "free")
                        ).maybeSingle().execute()
                        ret_days = plan_q.data.get("retention_days", 1) if plan_q.data else 1
                        exp = (datetime.now(timezone.utc) + timedelta(days=ret_days)).isoformat()
                        sb.table("stored_files").insert({
                            "user_id": user["id"],
                            "project_id": project_id,
                            "file_type": "preview",
                            "storage_path": preview_key,
                            "file_size_bytes": preview_size,
                            "cdn_url": r2.get_cdn_url(preview_key),
                            "expires_at": exp,
                        }).execute()
                        logger.info("preview_registered_in_db", project_id=project_id, key=preview_key)
                    except Exception:
                        pass
            except Exception:
                pass
        data["video_url"] = f"/files/{file_url}"
        # 3) If still no preview, check if source needs transcoding
        if not has_preview:
            try:
                source_path = r2._resolve(data["file_url"])
                if source_path.exists():
                    data["needs_transcode"] = needs_web_transcode(str(source_path))
            except Exception:
                pass
    return data


@router.post("/{project_id}/web-preview")
def create_on_demand_web_preview(project_id: str, user: dict = Depends(get_current_user)):
    """Create a browser-compatible MP4 preview for an existing project on demand.
    This fixes audio playback for MKV/AVI files with DTS/AC3/FLAC audio codecs
    that browsers cannot decode."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()

    result = sb.table("projects").select("*").eq("id", project_id).eq("user_id", user["id"]).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    project = result.data
    file_url = project.get("file_url")
    if not file_url:
        raise HTTPException(status_code=400, detail="No source file")

    # Check if web preview already exists
    try:
        existing = sb.table("stored_files").select("storage_path").eq(
            "project_id", project_id
        ).eq("file_type", "preview").maybeSingle().execute()
        if existing.data and existing.data.get("storage_path"):
            preview_path = r2._resolve(existing.data["storage_path"])
            if preview_path.exists():
                return {"video_url": f"/files/{existing.data['storage_path']}", "cached": True}
    except Exception:
        pass

    # Resolve source file
    try:
        source_path = r2._resolve(file_url)
        if not source_path.exists():
            raise HTTPException(status_code=404, detail="Source file not found on disk")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Check if transcoding is needed
    if not needs_web_transcode(str(source_path)):
        # File is already browser-compatible, just return it
        return {"video_url": f"/files/{file_url}", "cached": True}

    # Create web preview
    settings = get_settings()
    work_dir = settings.temp_path / f"preview_{project_id}"
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        preview_out = work_dir / "preview.mp4"
        create_web_preview(str(source_path), str(preview_out))

        preview_key = r2.get_storage_key(user["id"], project_id, "source", "preview.mp4")
        r2.upload_file(preview_key, str(preview_out), content_type="video/mp4")
        preview_size = preview_out.stat().st_size

        # Get retention from plan
        try:
            profile = user.get("profile", {})
            plan = sb.table("subscription_plans").select("retention_days").eq(
                "id", profile.get("plan_id", "free")
            ).single().execute()
            retention_days = plan.data.get("retention_days", 1) if plan.data else 1
        except Exception:
            retention_days = 1
        expires_at = (datetime.now(timezone.utc) + timedelta(days=retention_days)).isoformat()

        sb.table("stored_files").insert({
            "user_id": user["id"],
            "project_id": project_id,
            "file_type": "preview",
            "storage_path": preview_key,
            "file_size_bytes": preview_size,
            "cdn_url": r2.get_cdn_url(preview_key),
            "expires_at": expires_at,
        }).execute()

        logger.info("on_demand_web_preview_created", project_id=project_id, size=preview_size)
        return {"video_url": f"/files/{preview_key}", "cached": False}

    except Exception as e:
        logger.error("on_demand_web_preview_failed", project_id=project_id, error=str(e))
        # Fallback: return original file
        return {"video_url": f"/files/{file_url}", "cached": True, "error": str(e)[:200]}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(
    file: UploadFile = File(...),
    name: str = Form(...),
    source_lang: str = Form(""),
    target_lang: str = Form(""),
    user: dict = Depends(get_current_user),
):
    """Upload a video file and create a new project. Processing happens in background."""
    settings = get_settings()
    sb = get_supabase_admin()

    # --- 1. Check daily job limit ---
    profile = user["profile"]
    plan = sb.table("subscription_plans").select("*").eq("id", profile.get("plan_id", "free")).single().execute()
    if not plan.data:
        raise HTTPException(status_code=500, detail="Plan not found")

    plan_data = plan.data
    daily_limit = plan_data.get("daily_job_limit", 3)

    daily_used = sb.rpc("check_and_reset_daily_jobs", {"user_id_param": user["id"]}).data
    if isinstance(daily_used, int) and daily_used >= daily_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Günlük video yükleme limitinize ulaştınız ({daily_limit}/{daily_limit}). Yarın tekrar deneyin."
        )

    # --- 2. Validate file ---
    allowed = {".mkv", ".mp4", ".avi", ".webm", ".mov", ".ts", ".flv"}
    ext = Path(file.filename or "file.mkv").suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Desteklenmeyen dosya türü: {ext}")

    # --- 3. Save file locally (stream + size limit) ---
    project_id = str(uuid.uuid4())
    work_dir = settings.temp_path / project_id
    work_dir.mkdir(parents=True, exist_ok=True)

    local_path = work_dir / f"source{ext}"
    try:
        _save_upload_file(file, local_path, settings.max_upload_bytes)
    except HTTPException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Dosya kaydedilemedi: {str(e)}")

    actual_size = local_path.stat().st_size

    # --- 4. Check storage limit (after we know real size) ---
    storage_check = ensure_storage_for_upload(user["id"], actual_size)
    if not storage_check["ok"]:
        try:
            local_path.unlink(missing_ok=True)
        except Exception:
            pass
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(
            status_code=507,
            detail="Depolama alanı yetersiz. Eski dosyalarınızı silmenize rağmen yeterli alan açılamadı."
        )

    # --- 5. Create project record immediately (status=processing) ---
    project_data = {
        "id": project_id,
        "user_id": user["id"],
        "name": name,
        "file_name": file.filename or f"video{ext}",
        "file_size_bytes": actual_size,
        "status": "processing",
    }
    if source_lang:
        project_data["source_lang"] = source_lang
    if target_lang:
        project_data["target_lang"] = target_lang
    sb.table("projects").insert(project_data).execute()

    # --- 6. Queue heavy processing in Celery (non-blocking + durable) ---
    celery_ok = False
    try:
        from app.workers.tasks import run_project_processing_task
        run_project_processing_task.delay(
            project_id=project_id,
            user_id=user["id"],
            local_path=str(local_path),
            work_dir=str(work_dir),
            ext=ext,
            plan_data=plan_data,
        )
        celery_ok = True
    except Exception as e:
        logger.warning("celery_unavailable_fallback_thread", project_id=project_id, error=str(e))
        # Fallback: process in a background thread when Celery/Redis is unavailable
        thread = threading.Thread(
            target=_process_video_project,
            kwargs={
                "project_id": project_id,
                "user_id": user["id"],
                "local_path": str(local_path),
                "work_dir": str(work_dir),
                "ext": ext,
                "plan_data": plan_data,
            },
            daemon=True,
        )
        thread.start()
        celery_ok = True  # Thread started successfully

    # --- 7. Increment daily job counter (only after successful enqueue) ---
    sb.rpc("increment_daily_jobs", {"user_id_param": user["id"]})

    logger.info("project_upload_accepted", project_id=project_id, size=actual_size)

    return {
        "id": project_id,
        "status": "processing",
        "total_lines": 0,
    }


def _process_video_project(
    project_id: str,
    user_id: str,
    local_path: str,
    work_dir: str,
    ext: str,
    plan_data: dict,
):
    """Background task: probe media, extract subtitles, upload to R2."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()
    work_dir_path = Path(work_dir)

    try:
        # --- Probe media info ---
        media_info = get_media_info(local_path)
        actual_size = Path(local_path).stat().st_size

        retention_days = plan_data.get("retention_days", 1)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=retention_days)).isoformat()

        # Auto-detect source language from first subtitle track
        detected_source = None
        for sub in media_info.get("subtitle_streams", []):
            lang = sub.get("language", "und")
            if lang and lang != "und":
                detected_source = lang
                break

        # Update project with media info
        project_update = {
            "duration_seconds": media_info["duration_seconds"],
            "video_codec": media_info["video_codec"],
            "audio_tracks": len(media_info["audio_tracks"]),
            "width": media_info.get("width", 0),
            "height": media_info.get("height", 0),
        }
        if detected_source:
            project_update["source_lang"] = detected_source
        sb.table("projects").update(project_update).eq("id", project_id).execute()

        # --- Upload source video to R2 (file copy, no RAM load) ---
        storage_key = r2.get_storage_key(user_id, project_id, "source", f"video{ext}")
        r2.upload_file(storage_key, local_path, content_type=f"video/{ext.lstrip('.')}")

        sb.table("stored_files").insert({
            "user_id": user_id,
            "project_id": project_id,
            "file_type": "source_video",
            "storage_path": storage_key,
            "file_size_bytes": actual_size,
            "cdn_url": r2.get_cdn_url(storage_key),
            "expires_at": expires_at,
        }).execute()

        # --- Create browser-compatible preview if needed (MKV/AVI audio fix) ---
        preview_key = storage_key  # default: use source
        if needs_web_transcode(local_path):
            try:
                preview_path = work_dir_path / "preview.mp4"
                create_web_preview(local_path, str(preview_path))
                preview_key = r2.get_storage_key(user_id, project_id, "source", "preview.mp4")
                r2.upload_file(preview_key, str(preview_path), content_type="video/mp4")
                preview_size = preview_path.stat().st_size
                sb.table("stored_files").insert({
                    "user_id": user_id,
                    "project_id": project_id,
                    "file_type": "preview",
                    "storage_path": preview_key,
                    "file_size_bytes": preview_size,
                    "cdn_url": r2.get_cdn_url(preview_key),
                    "expires_at": expires_at,
                }).execute()
                logger.info("web_preview_created", project_id=project_id, size=preview_size)
            except Exception as e:
                logger.warning("web_preview_failed", project_id=project_id, error=str(e))
                preview_key = storage_key  # fallback to original

        # IMPORTANT: file_url must ALWAYS point to original source (not preview)
        # Preview is served via stored_files lookup in get_project endpoint
        # Export task uses file_url as source — must be original quality
        sb.table("projects").update({"file_url": storage_key}).eq("id", project_id).execute()

        # --- Extract subtitles ---
        sub_dir = work_dir_path / "subtitles"
        extracted = extract_all_subtitles(local_path, str(sub_dir))

        total_lines = 0
        for sub_info in extracted:
            if not sub_info.get("extracted"):
                continue

            lines = parse_subtitle_file(sub_info["file_path"])
            total_lines += len(lines)

            sub_file_id = str(uuid.uuid4())
            sb.table("subtitle_files").insert({
                "id": sub_file_id,
                "project_id": project_id,
                "format": sub_info["format"],
                "language": sub_info["language"],
                "track_index": sub_info["stream_index"],
                "total_lines": len(lines),
            }).execute()

            sub_storage_key = r2.get_storage_key(
                user_id, project_id, "subtitle",
                f"sub_{sub_info['stream_index']}_{sub_info['language']}.{sub_info['format']}"
            )
            with open(sub_info["file_path"], "rb") as sf:
                sub_data = sf.read()
                r2.upload(sub_storage_key, sub_data, content_type="text/plain")

            sub_size = len(sub_data)
            sb.table("stored_files").insert({
                "user_id": user_id,
                "project_id": project_id,
                "file_type": f"subtitle_{sub_info['format']}",
                "storage_path": sub_storage_key,
                "file_size_bytes": sub_size,
                "cdn_url": r2.get_cdn_url(sub_storage_key),
                "expires_at": expires_at,
            }).execute()

            sb.table("subtitle_files").update({
                "file_url": sub_storage_key,
            }).eq("id", sub_file_id).execute()

        # --- Mark project as ready ---
        sb.table("projects").update({
            "total_lines": total_lines,
            "status": "ready",
        }).eq("id", project_id).execute()

        _recalculate_user_storage(sb, user_id)

        logger.info("project_processing_done", project_id=project_id, lines=total_lines, subs=len(extracted))

    except Exception as e:
        logger.error("project_processing_failed", error=str(e), project_id=project_id)
        try:
            sb.table("projects").update({"status": "failed"}).eq("id", project_id).execute()
        except Exception:
            pass
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    """Delete a project and all associated data (including R2 files)."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()

    project = sb.table("projects").select("id, user_id").eq("id", project_id).eq("user_id", user["id"]).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete all local storage files for this project
    stored = sb.table("stored_files").select("storage_path").eq("project_id", project_id).execute()
    for f in (stored.data or []):
        try:
            r2.delete(f["storage_path"])
        except Exception:
            pass

    # CASCADE handles subtitle_files, translation_jobs, export_jobs, stored_files
    sb.table("projects").delete().eq("id", project_id).execute()

    # Recalculate storage
    _recalculate_user_storage(sb, user["id"])


@router.get("/{project_id}/tracks")
def get_project_tracks(project_id: str, user: dict = Depends(get_current_user)):
    """Get all subtitle file tracks (languages) for a project."""
    sb = get_supabase_admin()
    project = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user["id"]).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    tracks = sb.table("subtitle_files").select("id, language, format, track_index, total_lines").eq("project_id", project_id).order("track_index").execute()
    return tracks.data or []


@router.get("/{project_id}/subtitles")
def get_project_subtitles(
    project_id: str,
    subtitle_file_id: str | None = None,
    user: dict = Depends(get_current_user),
):
    """Get subtitle lines by parsing the file from local storage."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()

    project = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user["id"]).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get subtitle files for this project
    query = sb.table("subtitle_files").select("*").eq("project_id", project_id)
    if subtitle_file_id:
        query = query.eq("id", subtitle_file_id)
    sub_files = query.order("track_index").execute()

    all_lines = []
    for sf in (sub_files.data or []):
        file_url = sf.get("file_url")
        if not file_url:
            continue

        # Read file from local storage and parse
        try:
            file_data = r2.download(file_url)
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{sf['format']}") as tf:
                tmp = Path(tf.name)
                tf.write(file_data)
            try:
                lines = parse_subtitle_file(str(tmp))
            finally:
                tmp.unlink(missing_ok=True)

            # Check if translated version exists
            translated_url = sf.get("translated_file_url")
            translated_lines = {}
            if translated_url:
                try:
                    tr_data = r2.download(translated_url)
                    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{sf['format']}") as tf:
                        tr_tmp = Path(tf.name)
                        tf.write(tr_data)
                    try:
                        tr_parsed = parse_subtitle_file(str(tr_tmp))
                    finally:
                        tr_tmp.unlink(missing_ok=True)
                    translated_lines = {l["line_number"]: l["original_text"] for l in tr_parsed}
                except Exception:
                    pass

            for line in lines:
                tr_text = translated_lines.get(line["line_number"])
                all_lines.append({
                    "id": f"{sf['id']}_{line['line_number']}",
                    "subtitle_file_id": sf["id"],
                    "project_id": project_id,
                    "line_number": line["line_number"],
                    "start_time": line["start_time"],
                    "end_time": line["end_time"],
                    "original_text": line["original_text"],
                    "translated_text": tr_text,
                    "style": line.get("style"),
                    "is_translated": bool(tr_text),
                })
        except Exception as e:
            logger.warning("subtitle_parse_failed", file_id=sf["id"], error=str(e))

    return all_lines


@router.patch("/{project_id}/subtitles/batch")
def batch_update_subtitles(
    project_id: str,
    updates: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """
    Batch update translated texts AND/OR timing.
    Body: {
      "edits": {
        "<subtitle_file_id>_<line_number>": {
          "translated_text": "new text",   // optional
          "start_time": "HH:MM:SS,mmm",   // optional
          "end_time": "HH:MM:SS,mmm"      // optional
        }
        OR "<subtitle_file_id>_<line_number>": "new text"  // legacy string format
      }
    }
    """
    sb = get_supabase_admin()
    r2 = get_r2_storage()

    try:
        project = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user["id"]).single().execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    raw_edits = updates.get("edits", {})
    if not raw_edits:
        return {"updated": 0}

    # Normalize edits: support both string (legacy) and dict (new) formats
    # grouped[sf_id][line_num] = {"translated_text": ..., "start_time": ..., "end_time": ...}
    grouped: dict[str, dict[int, dict]] = {}
    for composite_id, value in raw_edits.items():
        parts = composite_id.rsplit("_", 1)
        if len(parts) != 2:
            continue
        sf_id, line_num_str = parts
        try:
            line_num = int(line_num_str)
        except ValueError:
            continue
        if isinstance(value, str):
            # Legacy format: just translated text
            edit_data = {"translated_text": value}
        elif isinstance(value, dict):
            edit_data = value
        else:
            continue
        grouped.setdefault(sf_id, {})[line_num] = edit_data

    updated_count = 0

    for sf_id, line_edits in grouped.items():
        try:
            sub_file = sb.table("subtitle_files").select("*").eq("id", sf_id).eq("project_id", project_id).maybeSingle().execute()
        except Exception as e:
            logger.warning("batch_update_sf_lookup_failed", sf_id=sf_id, error=str(e))
            continue
        if not sub_file.data:
            logger.warning("batch_update_sf_not_found", sf_id=sf_id)
            continue

        original_format = sub_file.data.get("format", "srt").lower()

        # Read original file to get timing info
        file_url = sub_file.data.get("file_url")
        if not file_url:
            logger.warning("batch_update_no_file_url", sf_id=sf_id)
            continue

        try:
            file_data = r2.download(file_url)
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{sub_file.data['format']}") as tf:
                tmp = Path(tf.name)
                tf.write(file_data)
            try:
                original_lines = parse_subtitle_file(str(tmp))
            finally:
                tmp.unlink(missing_ok=True)
        except Exception as e:
            logger.error("batch_update_read_original_failed", sf_id=sf_id, file_url=file_url, error=str(e))
            continue

        # Read existing translated file if it exists
        translated_url = sub_file.data.get("translated_file_url")
        existing_translations: dict[int, str] = {}
        if translated_url:
            try:
                tr_data = r2.download(translated_url)
                with tempfile.NamedTemporaryFile(delete=False, suffix=f".{original_format}") as tf:
                    tr_tmp = Path(tf.name)
                    tf.write(tr_data)
                try:
                    tr_parsed = parse_subtitle_file(str(tr_tmp))
                finally:
                    tr_tmp.unlink(missing_ok=True)
                existing_translations = {l["line_number"]: l["original_text"] for l in tr_parsed}
            except Exception as e:
                logger.warning("batch_update_read_translated_failed", sf_id=sf_id, error=str(e))

        # Apply edits on top of existing translations
        for ln, edit_data in line_edits.items():
            if "translated_text" in edit_data:
                existing_translations[ln] = edit_data["translated_text"]

        # Build output lines (apply timing edits from original)
        out_lines = []
        has_timing_edits = False
        for line in original_lines:
            ln = line["line_number"]
            edit = line_edits.get(ln, {})
            start = edit.get("start_time", line["start_time"])
            end = edit.get("end_time", line["end_time"])
            if start != line["start_time"] or end != line["end_time"]:
                has_timing_edits = True
            out_lines.append({
                "line_number": ln,
                "start_time": start,
                "end_time": end,
                "original_text": existing_translations.get(ln, line["original_text"]),
            })

        # Write translated file
        out_ext = f".{original_format}" if original_format in ("ass", "ssa") else ".srt"
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=out_ext) as tf:
                tmp_out = Path(tf.name)

            if original_format in ("ass", "ssa"):
                from app.services.subtitle_parser import write_ass
                write_ass(out_lines, str(tmp_out))
            else:
                write_srt(out_lines, str(tmp_out), use_translated=False)

            translated_key = r2.get_storage_key(
                user["id"], project_id, "subtitle",
                f"translated_{sf_id}{out_ext}"
            )
            with open(tmp_out, "rb") as f:
                r2.upload(translated_key, f.read(), content_type="text/plain")
            tmp_out.unlink(missing_ok=True)

            sb.table("subtitle_files").update({
                "translated_file_url": translated_key,
            }).eq("id", sf_id).execute()

            # If timing was edited, also update the original source file
            if has_timing_edits:
                orig_out_lines = []
                for line in original_lines:
                    ln = line["line_number"]
                    edit = line_edits.get(ln, {})
                    orig_out_lines.append({
                        "line_number": ln,
                        "start_time": edit.get("start_time", line["start_time"]),
                        "end_time": edit.get("end_time", line["end_time"]),
                        "original_text": line["original_text"],
                    })
                with tempfile.NamedTemporaryFile(delete=False, suffix=out_ext) as tf:
                    tmp_orig = Path(tf.name)
                if original_format in ("ass", "ssa"):
                    write_ass(orig_out_lines, str(tmp_orig))
                else:
                    write_srt(orig_out_lines, str(tmp_orig), use_translated=False)
                with open(tmp_orig, "rb") as f:
                    r2.upload(file_url, f.read(), content_type="text/plain")
                tmp_orig.unlink(missing_ok=True)

            updated_count += len(line_edits)
        except Exception as e:
            logger.error("batch_update_write_failed", sf_id=sf_id, error=str(e))
            continue

    return {"updated": updated_count}


@router.post("/subtitle", status_code=status.HTTP_201_CREATED)
def create_subtitle_project(
    file: UploadFile = File(...),
    name: str = Form(...),
    source_lang: str = Form("ja"),
    target_lang: str = Form("tr"),
    user: dict = Depends(get_current_user),
):
    """Upload a subtitle file (SRT/ASS/SSA/VTT) directly and create a project."""
    settings = get_settings()
    sb = get_supabase_admin()
    r2 = get_r2_storage()

    # --- 1. Check daily job limit ---
    profile = user["profile"]
    plan = sb.table("subscription_plans").select("*").eq("id", profile.get("plan_id", "free")).single().execute()
    if not plan.data:
        raise HTTPException(status_code=500, detail="Plan not found")

    plan_data = plan.data
    daily_limit = plan_data.get("daily_job_limit", 3)

    daily_used = sb.rpc("check_and_reset_daily_jobs", {"user_id_param": user["id"]}).data
    if isinstance(daily_used, int) and daily_used >= daily_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Günlük yükleme limitinize ulaştınız ({daily_limit}/{daily_limit}). Yarın tekrar deneyin."
        )

    # --- 2. Validate file ---
    allowed_sub = {".srt", ".ass", ".ssa", ".vtt"}
    ext = Path(file.filename or "subtitle.srt").suffix.lower()
    if ext not in allowed_sub:
        raise HTTPException(status_code=400, detail=f"Desteklenmeyen altyazı formatı: {ext}. Desteklenen: {', '.join(allowed_sub)}")

    # --- 3. Save file locally ---
    project_id = str(uuid.uuid4())
    work_dir = settings.temp_path / project_id
    work_dir.mkdir(parents=True, exist_ok=True)

    local_path = work_dir / f"subtitle{ext}"
    try:
        _save_upload_file(file, local_path, settings.max_upload_bytes)
    except HTTPException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Dosya kaydedilemedi: {str(e)}")

    try:
        actual_size = local_path.stat().st_size

        # --- 3.5. Check storage limit (after we know real size) ---
        storage_check = ensure_storage_for_upload(user["id"], actual_size)
        if not storage_check["ok"]:
            raise HTTPException(status_code=507, detail="Depolama alanı yetersiz.")

        # --- 4. Parse subtitle ---
        lines = parse_subtitle_file(str(local_path))
        if not lines:
            raise HTTPException(status_code=400, detail="Altyazı dosyasında satır bulunamadı.")

        # --- 5. Retention ---
        retention_days = plan_data.get("retention_days", 1)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=retention_days)).isoformat()

        # --- 6. Create project ---
        sub_format = ext.lstrip(".")
        project_data = {
            "id": project_id,
            "user_id": user["id"],
            "name": name,
            "file_name": file.filename or f"subtitle{ext}",
            "file_size_bytes": actual_size,
            "status": "ready",
            "source_lang": source_lang,
            "target_lang": target_lang,
            "total_lines": len(lines),
        }
        sb.table("projects").insert(project_data).execute()

        # --- 7. Upload subtitle to R2 ---
        storage_key = r2.get_storage_key(user["id"], project_id, "subtitle", f"original{ext}")
        with open(local_path, "rb") as f:
            r2.upload(storage_key, f.read(), content_type="text/plain")

        sb.table("stored_files").insert({
            "user_id": user["id"],
            "project_id": project_id,
            "file_type": f"subtitle_{sub_format}",
            "storage_path": storage_key,
            "file_size_bytes": actual_size,
            "cdn_url": r2.get_cdn_url(storage_key),
            "expires_at": expires_at,
        }).execute()

        # --- 8. Create subtitle_file + lines ---
        sub_file_id = str(uuid.uuid4())
        sb.table("subtitle_files").insert({
            "id": sub_file_id,
            "project_id": project_id,
            "format": sub_format,
            "language": source_lang,
            "track_index": 0,
            "total_lines": len(lines),
            "file_url": storage_key,
        }).execute()

        # --- 9. Increment daily job counter ---
        sb.rpc("increment_daily_jobs", {"user_id_param": user["id"]})

        _recalculate_user_storage(sb, user["id"])

        logger.info("subtitle_project_created", project_id=project_id, lines=len(lines), format=sub_format)

        return {
            "id": project_id,
            "status": "ready",
            "total_lines": len(lines),
            "format": sub_format,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("subtitle_project_failed", error=str(e), project_id=project_id)
        try:
            sb.table("projects").update({"status": "failed"}).eq("id", project_id).execute()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@router.get("/{project_id}/export-srt")
def export_srt(
    project_id: str,
    subtitle_file_id: str | None = None,
    translated: bool = True,
    user: dict = Depends(get_current_user),
):
    """Export subtitle lines as SRT file content (from local files)."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()

    project = sb.table("projects").select("id, name").eq("id", project_id).eq("user_id", user["id"]).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get the subtitle file
    query = sb.table("subtitle_files").select("*").eq("project_id", project_id)
    if subtitle_file_id:
        query = query.eq("id", subtitle_file_id)
    sub_files = query.order("track_index").limit(1).execute()
    if not sub_files.data:
        raise HTTPException(status_code=404, detail="No subtitle file found")

    sf = sub_files.data[0]

    # If translated requested and translated file exists, serve that
    if translated and sf.get("translated_file_url"):
        try:
            tr_data = r2.download(sf["translated_file_url"])
            return {"filename": f"{project.data['name']}_translated.srt", "content": tr_data.decode("utf-8")}
        except Exception:
            pass

    # Otherwise serve original
    file_url = sf.get("file_url")
    if not file_url:
        raise HTTPException(status_code=404, detail="Subtitle file not found")

    file_data = r2.download(file_url)
    return {"filename": f"{project.data['name']}.srt", "content": file_data.decode("utf-8")}


def _recalculate_user_storage(sb, user_id: str):
    """Delegate to shared helper in cleanup module."""
    recalculate_user_storage(sb, user_id)
