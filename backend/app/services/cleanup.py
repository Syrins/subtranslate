"""Automatic file cleanup service based on retention days and storage limits."""

import structlog
from datetime import datetime, timezone

from app.core.supabase import get_supabase_admin
from app.services.storage import get_r2_storage

logger = structlog.get_logger()
ACTIVE_PROJECT_STATUSES = {"processing", "translating", "exporting"}


def _project_is_active(sb, project_id: str | None) -> bool:
    """Return True if a project is currently in an active processing state."""
    if not project_id:
        return False
    try:
        project = sb.table("projects").select("status").eq("id", project_id).maybeSingle().execute()
    except Exception:
        return False
    status = (project.data or {}).get("status")
    return status in ACTIVE_PROJECT_STATUSES


def cleanup_expired_files():
    """Delete all expired files from local storage and database."""
    sb = get_supabase_admin()
    storage = get_r2_storage()

    now = datetime.now(timezone.utc).isoformat()
    expired = sb.table("stored_files").select("*").lt("expires_at", now).eq("uploaded_to_user_storage", False).execute()

    if not expired.data:
        logger.info("cleanup_no_expired_files")
        return 0

    deleted_count = 0
    freed_bytes = 0

    for file in expired.data:
        if _project_is_active(sb, file.get("project_id")):
            continue
        try:
            storage.delete(file["storage_path"])
            sb.table("stored_files").delete().eq("id", file["id"]).execute()

            freed_bytes += file.get("file_size_bytes", 0)
            deleted_count += 1
        except Exception as e:
            logger.warning("cleanup_file_failed", file_id=file["id"], error=str(e))

    # Update storage_used_bytes for affected users
    user_ids = set(f["user_id"] for f in expired.data)
    for uid in user_ids:
        _recalculate_storage(sb, uid)

    logger.info("cleanup_completed", deleted=deleted_count, freed_bytes=freed_bytes)
    return deleted_count


def mark_uploaded_to_user_storage(project_id: str):
    """Mark all files for a project as uploaded to user's own storage, then delete locally."""
    sb = get_supabase_admin()
    storage = get_r2_storage()

    files = sb.table("stored_files").select("*").eq("project_id", project_id).execute()
    if not files.data:
        return 0

    deleted_count = 0
    for file in files.data:
        try:
            storage.delete(file["storage_path"])
            sb.table("stored_files").update({"uploaded_to_user_storage": True}).eq("id", file["id"]).execute()
            deleted_count += 1
        except Exception as e:
            logger.warning("mark_user_storage_failed", file_id=file["id"], error=str(e))

    # Recalculate storage for the user
    if files.data:
        _recalculate_storage(sb, files.data[0]["user_id"])

    logger.info("marked_user_storage", project_id=project_id, deleted=deleted_count)
    return deleted_count


def check_storage_limit(user_id: str) -> dict:
    """Check if user has enough storage. If not, delete oldest files until space is available."""
    sb = get_supabase_admin()
    storage = get_r2_storage()

    # Get user's plan
    profile = sb.table("profiles").select("plan_id, storage_used_bytes").eq("id", user_id).single().execute()
    if not profile.data:
        return {"ok": False, "error": "Profile not found"}

    plan = sb.table("subscription_plans").select("storage_gb").eq("id", profile.data["plan_id"]).single().execute()
    if not plan.data:
        return {"ok": False, "error": "Plan not found"}

    max_bytes = int(float(plan.data["storage_gb"]) * 1024 * 1024 * 1024)
    used_bytes = profile.data.get("storage_used_bytes", 0)

    if used_bytes < max_bytes:
        return {
            "ok": True,
            "used_bytes": used_bytes,
            "max_bytes": max_bytes,
            "available_bytes": max_bytes - used_bytes,
        }

    # Need to free space - delete oldest files first
    files = (
        sb.table("stored_files")
        .select("*")
        .eq("user_id", user_id)
        .eq("uploaded_to_user_storage", False)
        .order("created_at")
        .execute()
    )

    deleted_files = []
    freed = 0
    for file in (files.data or []):
        if used_bytes - freed < max_bytes:
            break
        if _project_is_active(sb, file.get("project_id")):
            continue
        try:
            storage.delete(file["storage_path"])
            sb.table("stored_files").delete().eq("id", file["id"]).execute()
            freed += file.get("file_size_bytes", 0)
            deleted_files.append({
                "id": file["id"],
                "file_type": file["file_type"],
                "size": file["file_size_bytes"],
                "project_id": file.get("project_id"),
            })
        except Exception as e:
            logger.warning("storage_cleanup_failed", file_id=file["id"], error=str(e))

    _recalculate_storage(sb, user_id)

    new_used = used_bytes - freed
    return {
        "ok": new_used < max_bytes,
        "used_bytes": new_used,
        "max_bytes": max_bytes,
        "available_bytes": max_bytes - new_used,
        "freed_bytes": freed,
        "deleted_files": deleted_files,
        "warning": f"Depolama alanı yetersiz. {len(deleted_files)} eski dosya silindi." if deleted_files else None,
    }


def ensure_storage_for_upload(user_id: str, needed_bytes: int) -> dict:
    """Ensure there's enough storage for a new upload. Delete oldest if needed."""
    sb = get_supabase_admin()
    storage = get_r2_storage()

    profile = sb.table("profiles").select("plan_id, storage_used_bytes").eq("id", user_id).single().execute()
    if not profile.data:
        return {"ok": False, "error": "Profile not found"}

    plan = sb.table("subscription_plans").select("storage_gb").eq("id", profile.data["plan_id"]).single().execute()
    if not plan.data:
        return {"ok": False, "error": "Plan not found"}

    max_bytes = int(float(plan.data["storage_gb"]) * 1024 * 1024 * 1024)
    used_bytes = profile.data.get("storage_used_bytes", 0)
    available = max_bytes - used_bytes

    if available >= needed_bytes:
        return {"ok": True, "used_bytes": used_bytes, "max_bytes": max_bytes, "available_bytes": available}

    # Need to free: (needed_bytes - available) bytes
    need_to_free = needed_bytes - available

    files = (
        sb.table("stored_files")
        .select("*")
        .eq("user_id", user_id)
        .eq("uploaded_to_user_storage", False)
        .order("created_at")
        .execute()
    )

    freed = 0
    deleted_files = []
    for file in (files.data or []):
        if freed >= need_to_free:
            break
        if _project_is_active(sb, file.get("project_id")):
            continue
        try:
            storage.delete(file["storage_path"])
            sb.table("stored_files").delete().eq("id", file["id"]).execute()
            freed += file.get("file_size_bytes", 0)
            deleted_files.append({
                "id": file["id"],
                "file_type": file["file_type"],
                "size": file["file_size_bytes"],
                "project_id": file.get("project_id"),
            })
        except Exception as e:
            logger.warning("ensure_storage_failed", file_id=file["id"], error=str(e))

    _recalculate_storage(sb, user_id)

    new_used = used_bytes - freed
    new_available = max_bytes - new_used

    return {
        "ok": new_available >= needed_bytes,
        "used_bytes": new_used,
        "max_bytes": max_bytes,
        "available_bytes": new_available,
        "freed_bytes": freed,
        "deleted_files": deleted_files,
        "warning": f"Depolama yetersiz. {len(deleted_files)} eski kayıt silindi, {_format_bytes(freed)} yer açıldı." if deleted_files else None,
    }


def _recalculate_storage(sb, user_id: str):
    """Recalculate total storage used by a user from stored_files."""
    result = sb.table("stored_files").select("file_size_bytes").eq("user_id", user_id).eq("uploaded_to_user_storage", False).execute()
    total = sum(f.get("file_size_bytes", 0) for f in (result.data or []))
    sb.table("profiles").update({"storage_used_bytes": total}).eq("id", user_id).execute()


def _format_bytes(b: int) -> str:
    if b < 1024:
        return f"{b} B"
    elif b < 1024 * 1024:
        return f"{b / 1024:.1f} KB"
    elif b < 1024 * 1024 * 1024:
        return f"{b / (1024 * 1024):.1f} MB"
    return f"{b / (1024 * 1024 * 1024):.2f} GB"
