import time
import shutil
import asyncio
import tempfile
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
import structlog

from app.workers.celery_app import celery_app
from app.core.supabase import get_supabase_admin
from app.core.config import get_settings
from app.services.translation import get_engine
from app.services.subtitle_parser import parse_subtitle_file, write_srt
from app.utils.ffmpeg import burn_subtitles, mux_subtitles
from app.services.storage import get_r2_storage
from app.services.cleanup import cleanup_expired_files

logger = structlog.get_logger()

CHAR_LIMIT_SINGLE = 35_000
CHAR_LIMIT_MEDIUM = 60_000
MAX_LINES_PER_BLOCK = 300
OVERLAP_LINES = 20
CODEC_MAP = {"h264": "libx264", "h265": "libx265", "vp9": "libvpx-vp9", "av1": "libaom-av1", "copy": "copy"}


def _build_chunks_celery(lines: list[dict]) -> list[list[dict]]:
    """Split subtitle lines into chunks based on character limits."""
    total_chars = sum(len(l.get("original_text", "")) for l in lines)
    if total_chars <= CHAR_LIMIT_SINGLE:
        return [lines]
    block_size = min(350, max(200, len(lines) // 2)) if total_chars <= CHAR_LIMIT_MEDIUM else MAX_LINES_PER_BLOCK
    chunks = []
    i = 0
    while i < len(lines):
        end = min(i + block_size, len(lines))
        chunks.append(lines[i:end])
        i = end - OVERLAP_LINES if end < len(lines) else end
    return chunks


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
        engine = get_engine(engine_id, api_key)

        glossary = {}
        if glossary_enabled:
            g_result = sb.table("glossary_terms").select("*").eq("user_id", user_id).eq("source_lang", source_lang).eq("target_lang", target_lang).execute()
            glossary = {t["source_term"]: t["target_term"] for t in (g_result.data or [])}

        chunks = _build_chunks_celery(all_lines)
        translated_map: dict[int, str] = {}
        context_lines: list[str] = []
        start_time = time.time()

        for chunk_idx, chunk in enumerate(chunks):
            job_check = sb.table("translation_jobs").select("status").eq("id", job_id).single().execute()
            if job_check.data and job_check.data["status"] == "cancelled":
                return {"status": "cancelled"}

            texts = [line["original_text"] for line in chunk]
            if glossary:
                texts = [_apply_glossary(t, glossary) for t in texts]

            ctx = context_lines[-OVERLAP_LINES:] if context_enabled and context_lines else None

            translated = loop.run_until_complete(engine.translate_batch(texts, source_lang, target_lang, ctx))

            if glossary:
                translated = [re.sub(r'\[=[^\]]+\]', '', t).strip() for t in translated]

            for j, line in enumerate(chunk):
                ln = line["line_number"]
                if j < len(translated) and translated[j] and ln not in translated_map:
                    translated_map[ln] = translated[j]
                    context_lines.append(translated[j])

            progress = min(int((len(translated_map) / total_lines) * 100), 99)
            sb.table("translation_jobs").update({"progress": progress, "translated_lines": len(translated_map)}).eq("id", job_id).execute()
            self.update_state(state="PROGRESS", meta={"progress": progress})

        # Build and save translated file
        translated_lines_out = [{
            "line_number": l["line_number"], "start_time": l["start_time"],
            "end_time": l["end_time"], "original_text": translated_map.get(l["line_number"], l["original_text"]),
        } for l in all_lines]

        with tempfile.NamedTemporaryFile(delete=False, suffix=".srt") as tf:
            tmp_out = Path(tf.name)
        write_srt(translated_lines_out, str(tmp_out), use_translated=False)
        translated_key = storage.get_storage_key(user_id, project_id, "subtitle", f"translated_{subtitle_file_id}.srt")
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

    except Exception as e:
        logger.error("translation_failed", job_id=job_id, error=str(e))
        sb.table("translation_jobs").update({"status": "failed", "error_message": str(e)[:500]}).eq("id", job_id).execute()
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
        except Exception:
            pass

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
        sub_path = work_dir / "translated.srt"
        sub_path.write_bytes(sub_data)

        sb.table("export_jobs").update({"progress": 30}).eq("id", job_id).execute()

        # Check if cancelled before starting expensive FFmpeg encode
        job_check = sb.table("export_jobs").select("status").eq("id", job_id).single().execute()
        if job_check.data and job_check.data["status"] == "cancelled":
            logger.info("export_cancelled_before_encode", job_id=job_id)
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


def _apply_glossary(text: str, glossary: dict) -> str:
    for src, tgt in glossary.items():
        if src in text:
            text = text.replace(src, f"{src}[={tgt}]")
    return text
