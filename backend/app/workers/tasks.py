import time
import shutil
import asyncio
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
import structlog

from app.workers.celery_app import celery_app
from app.core.supabase import get_supabase_admin
from app.core.config import get_settings
from app.services.translation import get_engine
from app.services.subtitle_parser import parse_subtitle_file, write_srt, write_ass
from app.utils.ffmpeg import burn_subtitles, mux_subtitles, CODEC_MAP
from app.services.storage import get_r2_storage
from app.services.cleanup import cleanup_expired_files
from app.utils.chunking import build_chunks, apply_glossary_pre, apply_glossary_post, OVERLAP_LINES

logger = structlog.get_logger()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def run_translation_task(
    self,
    job_id: str,
    project_id: str,
    user_id: str,
    engine_id: str,
    api_key: str,
    source_lang: str,
    target_lang: str,
    context_enabled: bool = True,
    glossary_enabled: bool = False,
    subtitle_file_id: str | None = None,
    model_id: str = "",
):
    """Celery task: translate subtitle file and save translated file."""
    sb = get_supabase_admin()
    storage = get_r2_storage()
    loop = asyncio.new_event_loop()

    try:
        sb.table("translation_jobs").update({
            "status": "processing",
            "started_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        # Read subtitle file from local storage
        sub_file = sb.table("subtitle_files").select("*").eq("id", subtitle_file_id).single().execute()
        if not sub_file.data or not sub_file.data.get("file_url"):
            raise RuntimeError("Subtitle file not found")

        file_data = storage.download(sub_file.data["file_url"])
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{sub_file.data['format']}") as tf:
            tmp_src = Path(tf.name)
            tf.write(file_data)
        try:
            all_lines = parse_subtitle_file(str(tmp_src))
        finally:
            tmp_src.unlink(missing_ok=True)

        if not all_lines:
            sb.table("translation_jobs").update({"status": "completed", "progress": 100}).eq("id", job_id).execute()
            return {"status": "completed", "lines": 0}

        total_lines = len(all_lines)
        engine = get_engine(engine_id, api_key, model_id)

        glossary = {}
        if glossary_enabled:
            g_result = sb.table("glossary_terms").select("*").eq("user_id", user_id).eq("source_lang", source_lang).eq("target_lang", target_lang).execute()
            glossary = {t["source_term"]: t["target_term"] for t in (g_result.data or [])}

        chunks = build_chunks(all_lines)
        translated_map: dict[int, str] = {}
        context_lines: list[str] = []
        start_time = time.time()

        for chunk_idx, chunk in enumerate(chunks):
            job_check = sb.table("translation_jobs").select("status").eq("id", job_id).single().execute()
            if job_check.data and job_check.data["status"] == "cancelled":
                sb.table("projects").update({"status": "ready"}).eq("id", project_id).execute()
                return {"status": "cancelled"}

            # Determine how many overlap (context-only) lines are in this chunk
            # First chunk has no overlap; subsequent chunks have OVERLAP_LINES
            overlap_count = OVERLAP_LINES if chunk_idx > 0 else 0
            # Clamp: if chunk is smaller than overlap, no overlap
            overlap_count = min(overlap_count, len(chunk) - 1) if overlap_count else 0

            texts = [line["original_text"] for line in chunk]
            if glossary:
                texts = [apply_glossary_pre(t, glossary) for t in texts]

            ctx = context_lines[-10:] if context_enabled and context_lines else None

            translated = loop.run_until_complete(
                engine.translate_batch(texts, source_lang, target_lang, ctx, overlap_count)
            )

            if glossary:
                translated = [apply_glossary_post(t) for t in translated]

            # The engine returns only the NEW lines (overlap lines are stripped).
            # Map them to the non-overlap portion of the chunk.
            new_lines = chunk[overlap_count:]
            for j, line in enumerate(new_lines):
                ln = line["line_number"]
                if j < len(translated) and translated[j] and ln not in translated_map:
                    translated_map[ln] = translated[j]
                    context_lines.append(translated[j])

            progress = min(int((len(translated_map) / total_lines) * 100), 99)
            sb.table("translation_jobs").update({"progress": progress, "translated_lines": len(translated_map)}).eq("id", job_id).execute()
            self.update_state(state="PROGRESS", meta={"progress": progress})

        # Build and save translated file (preserve original format: .ass or .srt)
        original_format = sub_file.data.get("format", "srt").lower()
        translated_lines_out = [{
            "line_number": l["line_number"], "start_time": l["start_time"],
            "end_time": l["end_time"], "original_text": translated_map.get(l["line_number"], l["original_text"]),
        } for l in all_lines]

        out_ext = f".{original_format}" if original_format in ("ass", "ssa") else ".srt"
        with tempfile.NamedTemporaryFile(delete=False, suffix=out_ext) as tf:
            tmp_out = Path(tf.name)

        if original_format in ("ass", "ssa"):
            write_ass(translated_lines_out, str(tmp_out))
        else:
            write_srt(translated_lines_out, str(tmp_out), use_translated=False)

        translated_key = storage.get_storage_key(user_id, project_id, "subtitle", f"translated_{subtitle_file_id}{out_ext}")
        with open(tmp_out, "rb") as f:
            storage.upload(translated_key, f.read(), content_type="text/plain")
        tmp_out.unlink(missing_ok=True)

        sb.table("subtitle_files").update({"translated_file_url": translated_key}).eq("id", subtitle_file_id).execute()

        elapsed_ms = int((time.time() - start_time) * 1000)
        try:
            engine_config = sb.table("translation_engines").select("cost_per_line").eq("id", engine_id).single().execute()
            cost_per_line = float(engine_config.data.get("cost_per_line", 0)) if engine_config.data else 0
        except Exception:
            cost_per_line = 0

        sb.table("translation_jobs").update({
            "status": "completed", "progress": 100, "translated_lines": total_lines,
            "duration_ms": elapsed_ms, "cost_usd": cost_per_line * total_lines, "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        sb.table("projects").update({"status": "translated", "translated_lines": total_lines}).eq("id", project_id).execute()
        sb.rpc("increment_lines_used", {"user_id_param": user_id, "lines_count": total_lines})

        logger.info("translation_completed", job_id=job_id, lines=total_lines, chunks=len(chunks), elapsed_ms=elapsed_ms)
        return {"status": "completed", "lines": total_lines, "elapsed_ms": elapsed_ms}

    except ValueError as e:
        # Non-retryable errors (model not found, invalid API key, etc.)
        error_msg = str(e)[:500]
        logger.error("translation_failed_permanent", job_id=job_id, error=error_msg)
        sb.table("translation_jobs").update({"status": "failed", "error_message": error_msg}).eq("id", job_id).execute()
        sb.table("projects").update({"status": "ready"}).eq("id", project_id).execute()
        return {"status": "failed", "error": error_msg}
    except Exception as e:
        # Extract meaningful error message from RetryError/tenacity wrappers
        error_msg = str(e)[:500]
        if "RetryError" in error_msg:
            try:
                inner = e.__cause__ or e.__context__
                if inner:
                    error_msg = str(inner)[:500]
            except Exception:
                pass
            if "404" in error_msg or "Not Found" in error_msg:
                error_msg = f"Model bulunamadı. Lütfen geçerli bir model seçin. ({error_msg[:200]})"
            elif "401" in error_msg or "auth" in error_msg.lower():
                error_msg = "API anahtarı geçersiz. Lütfen ayarlardan kontrol edin."
        logger.error("translation_failed", job_id=job_id, error=error_msg)
        sb.table("translation_jobs").update({"status": "failed", "error_message": error_msg}).eq("id", job_id).execute()
        sb.table("projects").update({"status": "ready"}).eq("id", project_id).execute()
        raise self.retry(exc=e)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=1, default_retry_delay=60)
def run_export_task(
    self,
    job_id: str,
    project_id: str,
    user_id: str,
    mode: str,
    resolution: str,
    video_codec: str,
    audio_codec: str,
    watermark_text: str | None = None,
    watermark_position: str = "bottom-right",
    subtitle_style: dict | None = None,
):
    """Celery task: export video with burned/muxed subtitles."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()
    settings = get_settings()
    work_dir = settings.temp_path / f"export_{job_id}"
    work_dir.mkdir(parents=True, exist_ok=True)

    _last_progress = [0]

    def _update_progress(pct: int):
        overall = 30 + int(pct * 0.6)
        if overall <= _last_progress[0]:
            return
        if overall - _last_progress[0] < 2 and overall < 90:
            return
        _last_progress[0] = overall
        try:
            sb.table("export_jobs").update({"progress": overall}).eq("id", job_id).execute()
            self.update_state(state="PROGRESS", meta={"progress": overall})
        except Exception as e:
            logger.warning("export_progress_update_failed", job_id=job_id, progress=overall, error=str(e))

    try:
        sb.table("export_jobs").update({
            "status": "processing",
            "progress": 5,
        }).eq("id", job_id).execute()

        project = sb.table("projects").select("*").eq("id", project_id).single().execute()
        if not project.data or not project.data.get("file_url"):
            raise RuntimeError("Project source file not found")

        sb.table("export_jobs").update({"progress": 10}).eq("id", job_id).execute()

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
            return {"status": "cancelled"}

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
            return {"status": "cancelled"}

        sb.table("export_jobs").update({"progress": 90}).eq("id", job_id).execute()

        # Get retention days
        try:
            profile = sb.table("profiles").select("plan_id").eq("id", user_id).single().execute()
            plan_id = profile.data.get("plan_id", "free") if profile.data else "free"
            plan = sb.table("subscription_plans").select("retention_days").eq("id", plan_id).single().execute()
            retention_days = plan.data.get("retention_days", 1) if plan.data else 1
        except Exception:
            retention_days = 1
        expires_at = (datetime.now(timezone.utc) + timedelta(days=retention_days)).isoformat()

        storage_key = r2.get_storage_key(user_id, project_id, "export", f"{job_id}{output_ext}")
        r2.upload_file(storage_key, str(output_path), content_type=f"video/{output_ext.lstrip('.')}")

        sb.table("export_jobs").update({"progress": 95}).eq("id", job_id).execute()

        sb.table("stored_files").insert({
            "user_id": user_id,
            "project_id": project_id,
            "file_type": "export_video",
            "storage_path": storage_key,
            "file_size_bytes": output_size,
            "cdn_url": r2.get_cdn_url(storage_key),
            "expires_at": expires_at,
        }).execute()

        sb.table("export_jobs").update({
            "status": "completed",
            "progress": 100,
            "output_file_url": storage_key,
            "output_file_size_bytes": output_size,
            "duration_ms": elapsed_ms,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        sb.table("projects").update({"status": "exported"}).eq("id", project_id).execute()

        logger.info("export_completed", job_id=job_id, size=output_size, elapsed_ms=elapsed_ms)
        return {"status": "completed", "size": output_size, "elapsed_ms": elapsed_ms}

    except Exception as e:
        logger.error("export_failed", job_id=job_id, error=str(e))
        sb.table("export_jobs").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", job_id).execute()
        sb.table("projects").update({"status": "translated"}).eq("id", project_id).execute()
        raise self.retry(exc=e)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@celery_app.task
def run_project_processing_task(
    project_id: str,
    user_id: str,
    local_path: str,
    work_dir: str,
    ext: str,
    plan_data: dict,
):
    """Celery task: process uploaded source video and extract subtitle tracks."""
    from app.api.routes.projects import _process_video_project
    _process_video_project(
        project_id=project_id,
        user_id=user_id,
        local_path=local_path,
        work_dir=work_dir,
        ext=ext,
        plan_data=plan_data,
    )
    return {"status": "processed", "project_id": project_id}


@celery_app.task
def reset_monthly_usage():
    """Scheduled task: reset all users' monthly line usage (run via cron)."""
    sb = get_supabase_admin()
    sb.table("profiles").update({"lines_used_this_month": 0}).neq("lines_used_this_month", 0).execute()
    logger.info("monthly_usage_reset")


@celery_app.task
def cleanup_expired_files_task():
    """Scheduled task: delete expired files from R2 based on retention_days."""
    deleted = cleanup_expired_files()
    logger.info("cleanup_expired_files_task", deleted=deleted)
    return {"deleted": deleted}


