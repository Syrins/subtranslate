from fastapi import APIRouter, Depends, HTTPException
import structlog
import uuid
import time
import asyncio
import threading
import tempfile
import re
from pathlib import Path

from app.core.security import get_current_user
from app.core.supabase import get_supabase_admin
from app.core.config import get_settings
from app.models.schemas import TranslationJobCreate, JobStatus
from app.services.translation import get_engine
from app.services.subtitle_parser import parse_subtitle_file, write_srt
from app.services.storage import get_r2_storage

logger = structlog.get_logger()
router = APIRouter(prefix="/translate", tags=["Translation"])

# --- Character limit rules ---
CHAR_LIMIT_SINGLE = 35_000       # ≤ 35K: send in one shot
CHAR_LIMIT_MEDIUM = 60_000       # 35K-60K: block with overlap
MAX_LINES_PER_BLOCK = 300        # Max lines per block
OVERLAP_LINES = 20               # Overlap lines for context


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
    tmp = Path(tempfile.mktemp(suffix=f".{sub_file.data['format']}"))
    tmp.write_bytes(file_data)
    lines = parse_subtitle_file(str(tmp))
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
    api_key = _get_api_key(sb, user["id"], body.engine.value, plan_id)
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

    t = threading.Thread(
        target=_run_translation,
        kwargs=dict(
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
        ),
        daemon=True,
    )
    t.start()

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
    return {"status": "cancelled"}


@router.get("/history/{project_id}")
def get_translation_history(project_id: str, user: dict = Depends(get_current_user)):
    """Get all translation jobs for a project."""
    sb = get_supabase_admin()
    result = sb.table("translation_jobs").select("*").eq("project_id", project_id).eq("user_id", user["id"]).order("created_at", desc=True).execute()
    return result.data


# ---------------------------------------------------------------------------
# Chunking helpers
# ---------------------------------------------------------------------------

def _build_chunks(lines: list[dict]) -> list[list[dict]]:
    """
    Split subtitle lines into chunks based on character limits.
    Rules:
      ≤ 35K chars  → single chunk
      35K–60K     → 200–350 line blocks, 20 line overlap
      60K+        → max 300 line blocks, 20 line overlap
    """
    total_chars = sum(len(l.get("original_text", "")) for l in lines)

    if total_chars <= CHAR_LIMIT_SINGLE:
        return [lines]

    # Determine block size
    if total_chars <= CHAR_LIMIT_MEDIUM:
        block_size = min(350, max(200, len(lines) // 2))
    else:
        block_size = MAX_LINES_PER_BLOCK

    chunks = []
    i = 0
    while i < len(lines):
        end = min(i + block_size, len(lines))
        chunks.append(lines[i:end])
        i = end - OVERLAP_LINES if end < len(lines) else end

    return chunks


# ---------------------------------------------------------------------------
# API key resolution
# ---------------------------------------------------------------------------

def _get_api_key(sb, user_id: str, engine: str, plan_id: str = "free") -> str | None:
    """Get API key: user's own first, then system default (if plan allows)."""
    try:
        user_key = sb.table("user_api_keys").select("api_key_encrypted").eq("user_id", user_id).eq("engine", engine).single().execute()
        if user_key.data and user_key.data.get("api_key_encrypted"):
            return user_key.data["api_key_encrypted"]
    except Exception:
        pass

    plan = sb.table("subscription_plans").select("can_use_system_keys").eq("id", plan_id).single().execute()
    if plan.data and not plan.data.get("can_use_system_keys", False):
        return None

    try:
        engine_config = sb.table("translation_engines").select("api_key_encrypted").eq("id", engine).single().execute()
        if engine_config.data and engine_config.data.get("api_key_encrypted"):
            return engine_config.data["api_key_encrypted"]
    except Exception:
        pass

    settings = get_settings()
    env_keys = {"openai": settings.openai_api_key, "deepl": settings.deepl_api_key, "gemini": settings.gemini_api_key}
    return env_keys.get(engine) or None


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
            "started_at": "now()",
        }).eq("id", job_id).execute()

        # --- 1. Read subtitle file from local storage ---
        sub_file = sb.table("subtitle_files").select("*").eq("id", subtitle_file_id).single().execute()
        if not sub_file.data or not sub_file.data.get("file_url"):
            raise RuntimeError("Subtitle file not found in storage")

        file_data = storage.download(sub_file.data["file_url"])
        tmp_src = Path(tempfile.mktemp(suffix=f".{sub_file.data['format']}"))
        tmp_src.write_bytes(file_data)
        all_lines = parse_subtitle_file(str(tmp_src))
        tmp_src.unlink(missing_ok=True)

        if not all_lines:
            sb.table("translation_jobs").update({"status": "completed", "progress": 100}).eq("id", job_id).execute()
            return

        total_lines = len(all_lines)
        engine = get_engine(engine_id, api_key)

        # --- 2. Load glossary ---
        glossary = {}
        if glossary_enabled:
            g_result = sb.table("glossary_terms").select("*").eq("user_id", user_id).eq("source_lang", source_lang).eq("target_lang", target_lang).execute()
            glossary = {t["source_term"]: t["target_term"] for t in (g_result.data or [])}

        # --- 3. Build chunks based on character limits ---
        chunks = _build_chunks(all_lines)
        total_chars = sum(len(l.get("original_text", "")) for l in all_lines)
        logger.info("translation_chunking",
            job_id=job_id, total_lines=total_lines, total_chars=total_chars,
            num_chunks=len(chunks),
            strategy="single" if len(chunks) == 1 else ("medium_blocks" if total_chars <= CHAR_LIMIT_MEDIUM else "large_blocks")
        )

        # --- 4. Translate chunk by chunk ---
        translated_map: dict[int, str] = {}  # line_number -> translated_text
        translated_count = 0
        start_time = time.time()
        context_lines: list[str] = []

        for chunk_idx, chunk in enumerate(chunks):
            # Check if cancelled
            job_check = sb.table("translation_jobs").select("status").eq("id", job_id).single().execute()
            if job_check.data and job_check.data["status"] == "cancelled":
                logger.info("translation_cancelled", job_id=job_id)
                return

            texts = [line["original_text"] for line in chunk]

            # Apply glossary pre-processing
            if glossary:
                texts = [_apply_glossary(t, glossary) for t in texts]

            # Context: use last translated lines from previous chunk
            ctx = context_lines[-OVERLAP_LINES:] if context_enabled and context_lines else None

            # Translate (engines are async, run in our thread's event loop)
            translated = loop.run_until_complete(engine.translate_batch(texts, source_lang, target_lang, ctx))

            # Apply glossary post-processing
            if glossary:
                translated = [_apply_glossary_post(t, glossary) for t in translated]

            # Map translations to line numbers (skip overlap lines that were already translated)
            for j, line in enumerate(chunk):
                ln = line["line_number"]
                if j < len(translated) and translated[j]:
                    # For overlap lines, only overwrite if not already translated
                    # (first translation wins for consistency)
                    if ln not in translated_map:
                        translated_map[ln] = translated[j]
                    context_lines.append(translated[j])

            translated_count = len(translated_map)
            progress = min(int((translated_count / total_lines) * 100), 99)

            sb.table("translation_jobs").update({
                "progress": progress,
                "translated_lines": translated_count,
            }).eq("id", job_id).execute()

            logger.info("chunk_translated", job_id=job_id, chunk=chunk_idx + 1,
                        total_chunks=len(chunks), lines_in_chunk=len(chunk))

        # --- 5. Build translated subtitle file ---
        translated_lines_out = []
        for line in all_lines:
            translated_lines_out.append({
                "line_number": line["line_number"],
                "start_time": line["start_time"],
                "end_time": line["end_time"],
                "original_text": translated_map.get(line["line_number"], line["original_text"]),
            })

        # Write translated SRT file
        tmp_out = Path(tempfile.mktemp(suffix=".srt"))
        write_srt(translated_lines_out, str(tmp_out), use_translated=False)

        # Save to local storage
        translated_key = storage.get_storage_key(
            user_id, project_id, "subtitle",
            f"translated_{subtitle_file_id}.srt"
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
            "completed_at": "now()",
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


def _apply_glossary(text: str, glossary: dict) -> str:
    """Mark glossary terms in source text for translation context."""
    for src, tgt in glossary.items():
        if src in text:
            text = text.replace(src, f"{src}[={tgt}]")
    return text


def _apply_glossary_post(text: str, glossary: dict) -> str:
    """Clean up glossary markers from translated text."""
    text = re.sub(r'\[=[^\]]+\]', '', text)
    return text.strip()
