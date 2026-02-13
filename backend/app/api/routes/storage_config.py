"""User external storage configuration & file management routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
import structlog

from app.core.security import get_current_user
from app.core.supabase import get_supabase_admin
from app.services.user_storage import (
    test_connection,
    list_bucket_files,
    delete_bucket_file,
    rename_bucket_file,
    get_presigned_url,
    get_file_info,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/storage-config", tags=["StorageConfig"])


def _get_user_storage_config(user_id: str) -> dict:
    """Fetch the user's active storage config from Supabase."""
    sb = get_supabase_admin()
    result = (
        sb.table("user_storage_configs")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .maybeSingle()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Aktif depolama yapılandırması bulunamadı. Ayarlar sayfasından yapılandırın.")
    return result.data


# --- Test Connection ---
@router.post("/test")
def test_storage_connection(user: dict = Depends(get_current_user)):
    """Test the user's external storage connection (R2 or B2)."""
    config = _get_user_storage_config(user["id"])
    result = test_connection(config)

    # Update last_test_result in DB
    sb = get_supabase_admin()
    try:
        sb.table("user_storage_configs").update({
            "last_test_result": "success" if result["ok"] else "failed",
        }).eq("id", config["id"]).execute()
    except Exception as e:
        logger.warning("test_result_update_failed", error=str(e))

    return result


@router.post("/test-custom")
def test_custom_storage_connection(
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Test a storage connection with custom (unsaved) credentials.
    Used before saving to verify the config works."""
    provider = body.get("provider", "r2")

    # Build a config dict from the request body
    config = {"provider": provider}

    if provider == "r2":
        config["r2_account_id"] = body.get("r2_account_id", "")
        config["r2_access_key"] = body.get("r2_access_key", "")
        config["r2_secret_key_encrypted"] = body.get("r2_secret_key", "")
        config["r2_bucket_name"] = body.get("r2_bucket_name", "")
        config["r2_endpoint"] = body.get("r2_endpoint", "")
    else:
        config["b2_key_id"] = body.get("b2_key_id", "")
        config["b2_app_key_encrypted"] = body.get("b2_app_key", "")
        config["b2_bucket_name"] = body.get("b2_bucket_name", "")
        config["b2_bucket_id"] = body.get("b2_bucket_id", "")
        config["b2_endpoint"] = body.get("b2_endpoint", "")

    # If masked values (••••), try to fill from saved config
    sb = get_supabase_admin()
    saved = sb.table("user_storage_configs").select("*").eq("user_id", user["id"]).maybeSingle().execute()
    if saved and saved.data:
        sd = saved.data
        if provider == "r2":
            if config["r2_access_key"].startswith("••"):
                config["r2_access_key"] = sd.get("r2_access_key") or ""
            if config["r2_secret_key_encrypted"].startswith("••"):
                config["r2_secret_key_encrypted"] = sd.get("r2_secret_key_encrypted") or ""
        else:
            if config["b2_key_id"].startswith("••"):
                config["b2_key_id"] = sd.get("b2_key_id") or ""
            if config["b2_app_key_encrypted"].startswith("••"):
                config["b2_app_key_encrypted"] = sd.get("b2_app_key_encrypted") or ""

    result = test_connection(config)
    return result


# --- List Files ---
@router.get("/files")
def list_external_files(
    prefix: str = "",
    max_keys: int = Query(200, le=1000),
    user: dict = Depends(get_current_user),
):
    """List files in the user's external storage bucket."""
    try:
        config = _get_user_storage_config(user["id"])
    except HTTPException:
        # No active config — return empty list instead of error
        return {"ok": True, "files": [], "truncated": False, "count": 0}
    result = list_bucket_files(config, prefix=prefix, max_keys=max_keys)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message", "Dosyalar listelenemedi"))
    return result


# --- Get File Info ---
@router.get("/files/info")
def get_external_file_info(
    key: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Get metadata for a specific file in the user's external storage."""
    config = _get_user_storage_config(user["id"])
    result = get_file_info(config, key)
    if not result["ok"]:
        raise HTTPException(status_code=404, detail=result.get("message", "Dosya bulunamadı"))
    return result


# --- Get Presigned URL ---
@router.get("/files/url")
def get_external_file_url(
    key: str = Query(...),
    expires_in: int = Query(3600, ge=60, le=86400),
    user: dict = Depends(get_current_user),
):
    """Generate a presigned download URL for a file in the user's external storage."""
    config = _get_user_storage_config(user["id"])
    result = get_presigned_url(config, key, expires_in=expires_in)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message", "URL oluşturulamadı"))
    return result


# --- Delete File ---
@router.delete("/files")
def delete_external_file(
    key: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Delete a file from the user's external storage bucket."""
    config = _get_user_storage_config(user["id"])
    result = delete_bucket_file(config, key)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message", "Dosya silinemedi"))
    return result


# --- Rename File ---
@router.post("/files/rename")
def rename_external_file(
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Rename a file in the user's external storage bucket.
    Body: {"old_key": "...", "new_key": "..."}"""
    old_key = body.get("old_key", "").strip()
    new_key = body.get("new_key", "").strip()
    if not old_key or not new_key:
        raise HTTPException(status_code=400, detail="old_key ve new_key gerekli")
    if old_key == new_key:
        raise HTTPException(status_code=400, detail="Eski ve yeni isim aynı olamaz")

    config = _get_user_storage_config(user["id"])
    result = rename_bucket_file(config, old_key, new_key)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message", "Yeniden adlandırma başarısız"))
    return result
