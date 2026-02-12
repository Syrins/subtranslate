import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import structlog

from app.core.config import get_settings
from app.api.routes import health, projects, translate, export, admin, glossary
from app.services.storage import STORAGE_DIR

# --- Logging setup ---
_settings = get_settings()
_log_level = logging.DEBUG if _settings.debug else logging.INFO
logging.basicConfig(level=_log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("uvicorn").setLevel(_log_level)
logging.getLogger("fastapi").setLevel(_log_level)
# Suppress noisy httpcore/httpx debug logs (floods console during background tasks)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.dev.ConsoleRenderer(),
    ],
)
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("server_starting", host=settings.host, port=settings.port, debug=settings.debug)

    # Verify FFmpeg on startup
    try:
        from app.utils.ffmpeg import get_ffmpeg_path, get_ffprobe_path
        ffmpeg_path = get_ffmpeg_path()
        ffprobe_path = get_ffprobe_path()
        logger.info("ffmpeg_ready", ffmpeg=ffmpeg_path, ffprobe=ffprobe_path)
    except Exception as e:
        logger.warning("ffmpeg_not_found", error=str(e))

    # Verify local storage
    logger.info("storage_dir", path=str(STORAGE_DIR), exists=STORAGE_DIR.exists())

    yield
    logger.info("server_shutdown")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="SubTranslate API",
        description="Subtitle translation & video export backend",
        version="1.0.0",
        lifespan=lifespan,
        debug=settings.debug,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routes
    app.include_router(health.router)
    app.include_router(projects.router, prefix="/api")
    app.include_router(translate.router, prefix="/api")
    app.include_router(export.router, prefix="/api")
    app.include_router(glossary.router, prefix="/api")
    app.include_router(admin.router, prefix="/api")

    # --- Local file serving endpoint (with Range request support for video) ---
    import mimetypes as _mimetypes

    _CONTENT_TYPE_MAP = {
        ".mp4": "video/mp4", ".mkv": "video/x-matroska",
        ".webm": "video/webm", ".avi": "video/x-msvideo",
        ".mov": "video/quicktime", ".ts": "video/mp2t", ".flv": "video/x-flv",
        ".srt": "text/plain", ".ass": "text/plain", ".ssa": "text/plain",
    }

    @app.get("/files/{file_path:path}")
    def serve_file(file_path: str, request: Request):
        """Serve files from local storage directory with HTTP Range support."""
        full_path = STORAGE_DIR / file_path
        if not full_path.exists() or not full_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        # Security: ensure path is within STORAGE_DIR
        try:
            full_path.resolve().relative_to(STORAGE_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied")

        file_size = full_path.stat().st_size
        content_type, _ = _mimetypes.guess_type(str(full_path))
        if not content_type:
            content_type = _CONTENT_TYPE_MAP.get(full_path.suffix.lower(), "application/octet-stream")

        range_header = request.headers.get("range")
        if range_header:
            try:
                range_spec = range_header.replace("bytes=", "").strip()
                parts = range_spec.split("-")
                start = int(parts[0]) if parts[0] else 0
                end = int(parts[1]) if parts[1] else file_size - 1
                end = min(end, file_size - 1)
                if start < 0 or start >= file_size or start > end:
                    raise HTTPException(status_code=416, detail="Range not satisfiable")
                length = end - start + 1
            except (ValueError, IndexError):
                raise HTTPException(status_code=416, detail="Invalid range header")

            def iter_range():
                with open(full_path, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk_size = min(262144, remaining)  # 256KB chunks
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk

            return StreamingResponse(
                iter_range(),
                status_code=206,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(length),
                    "Content-Type": content_type,
                },
            )

        return FileResponse(
            full_path,
            media_type=content_type,
            headers={"Accept-Ranges": "bytes"},
        )

    return app


app = create_app()
