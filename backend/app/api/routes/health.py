from fastapi import APIRouter
import structlog

from app.core.config import get_settings
from app.core.supabase import get_supabase_admin
from app.services.storage import STORAGE_DIR

logger = structlog.get_logger()
router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check():
    """System health check endpoint (sync — all checks are sync I/O)."""
    checks = {"status": "ok", "version": "1.0.0", "ffmpeg": False, "redis": False, "supabase": False, "storage": False}

    # FFmpeg + FFprobe check
    try:
        from app.utils.ffmpeg import get_ffmpeg_path, get_ffprobe_path
        checks["ffmpeg"] = bool(get_ffmpeg_path() and get_ffprobe_path())
    except Exception:
        checks["ffmpeg"] = False

    # Redis check
    try:
        import redis
        settings = get_settings()
        r = redis.from_url(settings.redis_broker_url, socket_timeout=2)
        r.ping()
        r.close()
        checks["redis"] = True
    except Exception:
        checks["redis"] = False

    # Supabase check
    try:
        sb = get_supabase_admin()
        sb.table("system_settings").select("key").limit(1).execute()
        checks["supabase"] = True
    except Exception:
        checks["supabase"] = False

    # Local Storage check
    checks["storage"] = STORAGE_DIR.exists() and STORAGE_DIR.is_dir()

    if not all([checks["ffmpeg"], checks["supabase"], checks["storage"]]):
        checks["status"] = "degraded"

    return checks
