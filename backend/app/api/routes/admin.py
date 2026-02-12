from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import structlog

from app.core.security import require_admin
from app.core.supabase import get_supabase_admin
from app.services.cleanup import cleanup_expired_files
from app.services.storage import get_r2_storage

logger = structlog.get_logger()
router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


# --- Dashboard Stats ---
@router.get("/stats")
def get_admin_stats():
    """Get system-wide statistics for admin dashboard."""
    sb = get_supabase_admin()

    users = sb.table("profiles").select("id", count="exact").execute()
    projects = sb.table("projects").select("id", count="exact").execute()
    t_jobs = sb.table("translation_jobs").select("id", count="exact").execute()
    e_jobs = sb.table("export_jobs").select("id", count="exact").execute()

    active_jobs = sb.table("translation_jobs").select("id", count="exact").in_("status", ["queued", "processing"]).execute()
    failed_jobs = sb.table("translation_jobs").select("id", count="exact").eq("status", "failed").execute()

    # Storage stats
    stored = sb.table("stored_files").select("file_size_bytes").eq("uploaded_to_user_storage", False).execute()
    total_storage_bytes = sum(f.get("file_size_bytes", 0) for f in (stored.data or []))
    total_files = len(stored.data or [])

    return {
        "total_users": users.count or 0,
        "total_projects": projects.count or 0,
        "total_translation_jobs": t_jobs.count or 0,
        "total_export_jobs": e_jobs.count or 0,
        "active_jobs": active_jobs.count or 0,
        "failed_jobs": failed_jobs.count or 0,
        "total_storage_bytes": total_storage_bytes,
        "total_stored_files": total_files,
    }


# --- User Management ---
@router.get("/users")
def list_users(
    search: Optional[str] = None,
    plan: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=100),
    offset: int = 0,
):
    """List all users with filters."""
    sb = get_supabase_admin()
    query = sb.table("profiles").select("*, subscription_plans(name)", count="exact")

    if plan:
        query = query.eq("plan_id", plan)
    if status:
        query = query.eq("status", status)
    if search:
        query = query.or_(f"full_name.ilike.*{search}*,id.eq.{search}")

    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

    # Get emails from auth in parallel (avoid N+1 sequential HTTP calls)
    profiles = result.data or []
    auth_admin = sb.auth.admin
    email_map: dict[str, str] = {}

    def _fetch_email(uid: str) -> tuple[str, str]:
        try:
            auth_user = auth_admin.get_user_by_id(uid)
            return uid, (auth_user.user.email if auth_user and auth_user.user else "")
        except Exception:
            return uid, ""

    with ThreadPoolExecutor(max_workers=min(10, len(profiles) or 1)) as pool:
        futures = {pool.submit(_fetch_email, p["id"]): p["id"] for p in profiles}
        for future in as_completed(futures):
            uid, email = future.result()
            email_map[uid] = email

    users_with_email = [{**p, "email": email_map.get(p["id"], "")} for p in profiles]
    return {"data": users_with_email, "total": result.count or 0}


@router.patch("/users/{user_id}")
def update_user(user_id: str, update: dict):
    """Update user profile (role, status, plan)."""
    sb = get_supabase_admin()
    allowed = {"role", "status", "plan_id", "full_name"}
    filtered = {k: v for k, v in update.items() if k in allowed}
    if not filtered:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = sb.table("profiles").update(filtered).eq("id", user_id).execute()
    return result.data


@router.delete("/users/{user_id}")
def delete_user(user_id: str):
    """Delete a user and all their data."""
    sb = get_supabase_admin()
    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")
    return {"deleted": True}


# --- Job Management ---
@router.get("/jobs")
def list_all_jobs(
    job_type: str = Query("translation", pattern="^(translation|export)$"),
    status: Optional[str] = None,
    limit: int = Query(50, le=100),
    offset: int = 0,
):
    """List all jobs across all users."""
    sb = get_supabase_admin()
    table = "translation_jobs" if job_type == "translation" else "export_jobs"
    query = sb.table(table).select("*, profiles(full_name), projects(name, file_name)", count="exact")

    if status:
        query = query.eq("status", status)

    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"data": result.data or [], "total": result.count or 0}


@router.post("/jobs/{job_id}/cancel")
def admin_cancel_job(job_id: str, job_type: str = Query("translation")):
    """Admin cancel any job."""
    sb = get_supabase_admin()
    table = "translation_jobs" if job_type == "translation" else "export_jobs"
    sb.table(table).update({"status": "cancelled"}).eq("id", job_id).in_("status", ["queued", "processing"]).execute()
    return {"status": "cancelled"}


@router.post("/jobs/{job_id}/retry")
def admin_retry_job(job_id: str, job_type: str = Query("translation")):
    """Admin retry a failed job — resets status and re-launches the background task."""
    sb = get_supabase_admin()
    table = "translation_jobs" if job_type == "translation" else "export_jobs"

    job = sb.table(table).select("*").eq("id", job_id).eq("status", "failed").single().execute()
    if not job.data:
        raise HTTPException(status_code=404, detail="Failed job not found")

    sb.table(table).update({"status": "queued", "progress": 0, "error_message": None}).eq("id", job_id).execute()

    # Re-launch the background task
    if job_type == "translation":
        from app.api.routes.translate import _run_translation, _get_api_key
        jd = job.data
        profile = sb.table("profiles").select("plan_id").eq("id", jd["user_id"]).single().execute()
        plan_id = profile.data.get("plan_id", "free") if profile.data else "free"
        # Find subtitle_file_id from subtitle_files
        sf = sb.table("subtitle_files").select("id").eq("project_id", jd["project_id"]).limit(1).execute()
        subtitle_file_id = sf.data[0]["id"] if sf.data else None
        api_key = _get_api_key(sb, jd["user_id"], jd["engine"], plan_id)
        if not api_key:
            raise HTTPException(status_code=400, detail="API key not found for retry")
        t = threading.Thread(
            target=_run_translation,
            kwargs=dict(
                job_id=job_id, project_id=jd["project_id"], user_id=jd["user_id"],
                engine_id=jd["engine"], api_key=api_key,
                source_lang=jd["source_lang"], target_lang=jd["target_lang"],
                context_enabled=jd.get("context_enabled", True),
                glossary_enabled=jd.get("glossary_enabled", False),
                subtitle_file_id=subtitle_file_id,
            ),
            daemon=True,
        )
        t.start()
    else:
        from app.api.routes.export import _run_export
        jd = job.data
        t = threading.Thread(
            target=_run_export,
            kwargs=dict(
                job_id=job_id, project_id=jd["project_id"], user_id=jd["user_id"],
                mode=jd["mode"], resolution=jd.get("resolution", "original"),
                video_codec=jd.get("video_codec", "h264"),
                audio_codec=jd.get("audio_codec", "aac"),
                watermark_text=jd.get("watermark_text"),
                subtitle_style=jd.get("subtitle_style"),
            ),
            daemon=True,
        )
        t.start()

    return {"status": "queued", "message": "Job re-launched"}


# --- Engine Management ---
@router.get("/engines")
def list_engines():
    """List all translation engines."""
    sb = get_supabase_admin()
    result = sb.table("translation_engines").select("*").order("sort_order").execute()
    return result.data


@router.patch("/engines/{engine_id}")
def update_engine(engine_id: str, update: dict):
    """Update engine configuration."""
    sb = get_supabase_admin()
    allowed = {"name", "model", "cost_per_line", "status", "is_enabled", "api_key_encrypted", "rate_limit_per_minute", "docs_url"}
    filtered = {k: v for k, v in update.items() if k in allowed}
    result = sb.table("translation_engines").update(filtered).eq("id", engine_id).execute()
    return result.data


# --- System Settings ---
@router.get("/settings")
def get_all_settings():
    """Get all system settings."""
    sb = get_supabase_admin()
    result = sb.table("system_settings").select("*").execute()
    return {s["key"]: s["value"] for s in (result.data or [])}


@router.patch("/settings")
def update_settings(updates: dict, user: dict = Depends(require_admin)):
    """Update system settings (key-value pairs)."""
    sb = get_supabase_admin()
    for key, value in updates.items():
        sb.table("system_settings").upsert({
            "key": key,
            "value": value,
            "updated_by": user["id"],
        }).execute()
    return {"updated": list(updates.keys())}


# --- Announcements ---
@router.get("/announcements")
def list_announcements():
    """List all announcements."""
    sb = get_supabase_admin()
    result = sb.table("announcements").select("*").order("created_at", desc=True).execute()
    return result.data


@router.post("/announcements")
def create_announcement(body: dict, user: dict = Depends(require_admin)):
    """Create a new announcement."""
    sb = get_supabase_admin()
    result = sb.table("announcements").insert({
        "message": body.get("message", ""),
        "type": body.get("type", "info"),
        "is_active": body.get("is_active", False),
        "created_by": user["id"],
    }).execute()
    return result.data


@router.patch("/announcements/{announcement_id}")
def update_announcement(announcement_id: str, update: dict):
    """Update an announcement."""
    sb = get_supabase_admin()
    allowed = {"message", "type", "is_active"}
    filtered = {k: v for k, v in update.items() if k in allowed}
    result = sb.table("announcements").update(filtered).eq("id", announcement_id).execute()
    return result.data


@router.delete("/announcements/{announcement_id}")
def delete_announcement(announcement_id: str):
    """Delete an announcement."""
    sb = get_supabase_admin()
    sb.table("announcements").delete().eq("id", announcement_id).execute()
    return {"deleted": True}


# --- Storage Management ---
@router.get("/storage")
def get_storage_stats():
    """Get detailed storage statistics."""
    sb = get_supabase_admin()

    # Per-user storage usage
    users = sb.table("profiles").select("id, full_name, plan_id, storage_used_bytes, daily_jobs_used").order("storage_used_bytes", desc=True).limit(20).execute()

    # File type breakdown
    files = sb.table("stored_files").select("file_type, file_size_bytes").eq("uploaded_to_user_storage", False).execute()
    type_breakdown = {}
    for f in (files.data or []):
        ft = f["file_type"]
        type_breakdown[ft] = type_breakdown.get(ft, {"count": 0, "bytes": 0})
        type_breakdown[ft]["count"] += 1
        type_breakdown[ft]["bytes"] += f.get("file_size_bytes", 0)

    return {
        "top_users": users.data or [],
        "file_type_breakdown": type_breakdown,
        "total_files": len(files.data or []),
        "total_bytes": sum(f.get("file_size_bytes", 0) for f in (files.data or [])),
    }


@router.post("/storage/cleanup")
def admin_cleanup():
    """Manually trigger expired file cleanup."""
    deleted = cleanup_expired_files()
    return {"deleted_count": deleted, "message": f"{deleted} süresi dolmuş dosya silindi."}


@router.get("/storage/files")
def list_stored_files(
    user_id: Optional[str] = None,
    file_type: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    """List stored files with filters."""
    sb = get_supabase_admin()
    query = sb.table("stored_files").select("*, profiles(full_name, plan_id)")

    if user_id:
        query = query.eq("user_id", user_id)
    if file_type:
        query = query.eq("file_type", file_type)

    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"data": result.data or [], "total": len(result.data or [])}


@router.delete("/storage/files/{file_id}")
def admin_delete_file(file_id: str):
    """Admin: delete a specific stored file from R2."""
    sb = get_supabase_admin()
    r2 = get_r2_storage()

    file = sb.table("stored_files").select("*").eq("id", file_id).single().execute()
    if not file.data:
        raise HTTPException(status_code=404, detail="File not found")

    r2.delete(file.data["storage_path"])
    sb.table("stored_files").delete().eq("id", file_id).execute()

    # Recalculate user storage
    user_id = file.data["user_id"]
    stored = sb.table("stored_files").select("file_size_bytes").eq("user_id", user_id).eq("uploaded_to_user_storage", False).execute()
    total = sum(f.get("file_size_bytes", 0) for f in (stored.data or []))
    sb.table("profiles").update({"storage_used_bytes": total}).eq("id", user_id).execute()

    return {"deleted": True}
