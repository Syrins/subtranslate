from fastapi import APIRouter, Depends, HTTPException
import structlog
import uuid
import time
import asyncio
import tempfile
from pathlib import Path
from datetime import datetime, timezone

from app.core.security import get_current_user
from app.core.supabase import get_supabase_admin
from app.core.config import get_settings
from app.models.schemas import TranslationJobCreate
from app.services.translation import get_engine
from app.services.subtitle_parser import parse_subtitle_file, write_srt, write_ass
from app.services.storage import get_r2_storage
from app.utils.chunking import build_chunks, apply_glossary_pre, apply_glossary_post, OVERLAP_LINES

logger = structlog.get_logger()
router = APIRouter(prefix="/translate", tags=["Translation"])


@router.post("")
def create_translation_job(
    body: TranslationJobCreate,
    user: dict = Depends(get_current_user),
):
    """Create a translation job and start processing in background."""
    sb = get_supabase_admin()
    storage = get_r2_storage()

    # Verify project ownership
    project = sb.table("projects").select("*").eq("id", body.project_id).eq("user_id", user["id"]).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # Must have subtitle_file_id
    if not body.subtitle_file_id:
        raise HTTPException(status_code=400, detail="subtitle_file_id is required")

    # Verify subtitle file exists and get its info
    sub_file = sb.table("subtitle_files").select("*").eq("id", body.subtitle_file_id).eq("project_id", body.project_id).single().execute()
    if not sub_file.data or not sub_file.data.get("file_url"):
        raise HTTPException(status_code=404, detail="Subtitle file not found")

    # Read and parse the subtitle file to get line count
    file_data = storage.download(sub_file.data["file_url"])
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{sub_file.data['format']}") as tf:
        tmp = Path(tf.name)
        tf.write(file_data)
    try:
        lines = parse_subtitle_file(str(tmp))
    finally:
        tmp.unlink(missing_ok=True)
    total_lines = len(lines)

    if total_lines == 0:
        raise HTTPException(status_code=400, detail="Subtitle file has no lines")

    # Check plan limits
    profile = user["profile"]
    plan = sb.table("subscription_plans").select("*").eq("id", profile.get("plan_id", "free")).single().execute()
    if plan.data:
        limit = plan.data.get("lines_per_month", 1000)
        used = profile.get("lines_used_this_month", 0)
        if limit != -1 and used + total_lines > limit:
            raise HTTPException(status_code=429, detail=f"Aylık satır limitiniz aşıldı. Kullanılan: {used}, Limit: {limit}")

    # Get API key (user's own first, system only if plan allows)
    plan_id = profile.get("plan_id", "free")
    api_key, resolved_model = _get_api_key(sb, user["id"], body.engine.value, plan_id, body.model_id)
    if not api_key:
        if plan_id == "free":
            raise HTTPException(
                status_code=403,
                detail=f"Free plan kullanıcıları sistem API anahtarını kullanamaz. Lütfen kendi {body.engine.value} API anahtarınızı Ayarlar > API Anahtarları bölümünden ekleyin."
            )
        raise HTTPException(status_code=400, detail=f"{body.engine.value} için API anahtarı bulunamadı.")

    # Create job record
    job_id = str(uuid.uuid4())

    sb.table("translation_jobs").insert({
        "id": job_id,
        "project_id": body.project_id,
        "user_id": user["id"],
        "engine": body.engine.value,
        "source_lang": body.source_lang,
        "target_lang": body.target_lang,
        "status": "queued",
        "total_lines": total_lines,
        "context_enabled": body.context_enabled,
        "glossary_enabled": body.glossary_enabled,
    }).execute()

    sb.table("projects").update({"status": "translating"}).eq("id", body.project_id).execute()

    try:
        from app.workers.tasks import run_translation_task
        run_translation_task.delay(
            job_id=job_id,
            project_id=body.project_id,
            user_id=user["id"],
            engine_id=body.engine.value,
            api_key=api_key,
            source_lang=body.source_lang,
            target_lang=body.target_lang,
            context_enabled=body.context_enabled,
            glossary_enabled=body.glossary_enabled,
            subtitle_file_id=body.subtitle_file_id,
            model_id=resolved_model,
        )
    except Exception as e:
        logger.warning("celery_unavailable_translate_fallback_thread", job_id=job_id, error=str(e))
        # Fallback: run in background thread when Celery/Redis is unavailable
        import threading
        thread = threading.Thread(
            target=_run_translation,
            kwargs={
                "job_id": job_id,
                "project_id": body.project_id,
                "user_id": user["id"],
                "engine_id": body.engine.value,
                "api_key": api_key,
                "source_lang": body.source_lang,
                "target_lang": body.target_lang,
                "context_enabled": body.context_enabled,
                "glossary_enabled": body.glossary_enabled,
                "subtitle_file_id": body.subtitle_file_id,
                "model_id": resolved_model,
            },
            daemon=True,
        )
        thread.start()

    return {"id": job_id, "status": "queued", "total_lines": total_lines}


@router.get("/{job_id}")
def get_translation_job(job_id: str, user: dict = Depends(get_current_user)):
    """Get translation job status and progress."""
    sb = get_supabase_admin()
    result = sb.table("translation_jobs").select("*").eq("id", job_id).eq("user_id", user["id"]).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return result.data


@router.post("/{job_id}/cancel")
def cancel_translation_job(job_id: str, user: dict = Depends(get_current_user)):
    """Cancel a running translation job."""
    sb = get_supabase_admin()
    job = sb.table("translation_jobs").select("*").eq("id", job_id).eq("user_id", user["id"]).single().execute()
    if not job.data:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.data["status"] not in ("queued", "processing"):
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")

    sb.table("translation_jobs").update({"status": "cancelled"}).eq("id", job_id).execute()
    sb.table("projects").update({"status": "ready"}).eq("id", job.data["project_id"]).execute()
    return {"status": "cancelled"}


@router.get("/history/{project_id}")
def get_translation_history(project_id: str, user: dict = Depends(get_current_user)):
    """Get all translation jobs for a project."""
    sb = get_supabase_admin()
    result = sb.table("translation_jobs").select("*").eq("project_id", project_id).eq("user_id", user["id"]).order("created_at", desc=True).execute()
    return result.data


# ---------------------------------------------------------------------------
# API key resolution
# ---------------------------------------------------------------------------

def _get_api_key(sb, user_id: str, engine: str, plan_id: str = "free", model_id: str | None = None) -> tuple[str | None, str]:
    """Get API key and model: user's own first, then system default (if plan allows).
    Returns (api_key, model_id) tuple."""
    resolved_model = model_id or ""

    # 1. Try user's own keys — pick the one matching engine
    # IMPORTANT: Always honour the caller's model_id selection.
    # The user_api_keys.model_id is only a *default* when the caller didn't specify one.
    try:
        user_keys = sb.table("user_api_keys").select("api_key_encrypted, model_id, is_default").eq("user_id", user_id).eq("engine", engine).execute()
        if user_keys.data:
            # Use default key or first available key
            chosen_key = None
            for k in user_keys.data:
                if k.get("is_default") and k.get("api_key_encrypted"):
                    chosen_key = k
                    break
            if not chosen_key:
                for k in user_keys.data:
                    if k.get("api_key_encrypted"):
                        chosen_key = k
                        break
            if chosen_key:
                # If caller specified a model, use it; otherwise fall back to key's stored model
                final_model = resolved_model or chosen_key.get("model_id") or ""
                return chosen_key["api_key_encrypted"], final_model
    except Exception:
        pass

    # 2. Check plan allows system keys
    plan = sb.table("subscription_plans").select("can_use_system_keys").eq("id", plan_id).single().execute()
    if plan.data and not plan.data.get("can_use_system_keys", False):
        return None, resolved_model

    # 3. System engine key from DB
    try:
        engine_config = sb.table("translation_engines").select("api_key_encrypted").eq("id", engine).single().execute()
        if engine_config.data and engine_config.data.get("api_key_encrypted"):
            return engine_config.data["api_key_encrypted"], resolved_model
    except Exception:
        pass

    # 4. Env fallback
    settings = get_settings()
    env_keys = {"openai": settings.openai_api_key, "deepl": settings.deepl_api_key, "gemini": settings.gemini_api_key}
    key = env_keys.get(engine) or None
    return key, resolved_model


# ---------------------------------------------------------------------------
# Background translation task
# ---------------------------------------------------------------------------

def _run_translation(
    job_id: str,
    project_id: str,
    user_id: str,
    engine_id: str,
    api_key: str,
    source_lang: str,
    target_lang: str,
    context_enabled: bool,
    glossary_enabled: bool,
    subtitle_file_id: str | None = None,
    model_id: str = "",
):
    """Sync background task: read subtitle file, translate via AI, save translated file.
    Runs in a separate thread to avoid blocking the event loop."""
    sb = get_supabase_admin()
    storage = get_r2_storage()
    # Create a new event loop for this thread (needed for async engine.translate_batch)
    loop = asyncio.new_event_loop()

    try:
        sb.table("translation_jobs").update({
            "status": "processing",
            "started_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        # --- 1. Read subtitle file from local storage ---
        sub_file = sb.table("subtitle_files").select("*").eq("id", subtitle_file_id).single().execute()
        if not sub_file.data or not sub_file.data.get("file_url"):
            raise RuntimeError("Subtitle file not found in storage")

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
            return

        total_lines = len(all_lines)
        engine = get_engine(engine_id, api_key, model_id)

        # --- 2. Load glossary ---
        glossary = {}
        if glossary_enabled:
            g_result = sb.table("glossary_terms").select("*").eq("user_id", user_id).eq("source_lang", source_lang).eq("target_lang", target_lang).execute()
            glossary = {t["source_term"]: t["target_term"] for t in (g_result.data or [])}

        # --- 3. Build chunks ---
        chunks = build_chunks(all_lines)
        logger.info("translation_chunking",
            job_id=job_id, total_lines=total_lines, num_chunks=len(chunks))

        # --- 4. Translate chunk by chunk ---
        translated_map: dict[int, str] = {}
        start_time = time.time()
        context_lines: list[str] = []

        for chunk_idx, chunk in enumerate(chunks):
            job_check = sb.table("translation_jobs").select("status").eq("id", job_id).single().execute()
            if job_check.data and job_check.data["status"] == "cancelled":
                logger.info("translation_cancelled", job_id=job_id)
                sb.table("projects").update({"status": "ready"}).eq("id", project_id).execute()
                return

            overlap_count = OVERLAP_LINES if chunk_idx > 0 else 0
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

            new_lines = chunk[overlap_count:]
            for j, line in enumerate(new_lines):
                ln = line["line_number"]
                if j < len(translated) and translated[j] and ln not in translated_map:
                    translated_map[ln] = translated[j]
                    context_lines.append(translated[j])

            progress = min(int((len(translated_map) / total_lines) * 100), 99)
            sb.table("translation_jobs").update({
                "progress": progress,
                "translated_lines": len(translated_map),
            }).eq("id", job_id).execute()

        # --- 5. Build translated subtitle file (preserve original format) ---
        original_format = sub_file.data.get("format", "srt").lower()
        translated_lines_out = [{
            "line_number": line["line_number"],
            "start_time": line["start_time"],
            "end_time": line["end_time"],
            "original_text": translated_map.get(line["line_number"], line["original_text"]),
        } for line in all_lines]

        out_ext = f".{original_format}" if original_format in ("ass", "ssa") else ".srt"
        with tempfile.NamedTemporaryFile(delete=False, suffix=out_ext) as tf:
            tmp_out = Path(tf.name)

        if original_format in ("ass", "ssa"):
            write_ass(translated_lines_out, str(tmp_out))
        else:
            write_srt(translated_lines_out, str(tmp_out), use_translated=False)

        translated_key = storage.get_storage_key(
            user_id, project_id, "subtitle",
            f"translated_{subtitle_file_id}{out_ext}"
        )
        with open(tmp_out, "rb") as f:
            storage.upload(translated_key, f.read(), content_type="text/plain")
        tmp_out.unlink(missing_ok=True)

        # Update subtitle_files with translated file URL
        sb.table("subtitle_files").update({
            "translated_file_url": translated_key,
        }).eq("id", subtitle_file_id).execute()

        elapsed_ms = int((time.time() - start_time) * 1000)

        # Calculate cost
        engine_config = sb.table("translation_engines").select("cost_per_line").eq("id", engine_id).single().execute()
        cost_per_line = float(engine_config.data.get("cost_per_line", 0)) if engine_config.data else 0
        total_cost = cost_per_line * total_lines

        # Update job as completed
        sb.table("translation_jobs").update({
            "status": "completed",
            "progress": 100,
            "translated_lines": total_lines,
            "duration_ms": elapsed_ms,
            "cost_usd": total_cost,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        # Update project
        sb.table("projects").update({
            "status": "translated",
            "translated_lines": total_lines,
        }).eq("id", project_id).execute()

        # Update user's monthly usage
        sb.rpc("increment_lines_used", {"user_id_param": user_id, "lines_count": total_lines})

        logger.info("translation_completed", job_id=job_id, lines=total_lines,
                    chunks=len(chunks), elapsed_ms=elapsed_ms)

    except Exception as e:
        logger.error("translation_failed", job_id=job_id, error=str(e))
        sb.table("translation_jobs").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", job_id).execute()
        sb.table("projects").update({"status": "ready"}).eq("id", project_id).execute()
    finally:
        loop.close()


