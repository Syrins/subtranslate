"""Local file storage service for SubTranslate."""

import shutil
from pathlib import Path
from typing import Optional
import structlog

from app.core.config import get_settings

logger = structlog.get_logger()

# Local storage root directory — configurable via STORAGE_DIR env var, defaults to backend/storage/
_settings = get_settings()
STORAGE_DIR = Path(_settings.storage_dir) if _settings.storage_dir else (Path(__file__).resolve().parent.parent.parent / "storage")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class LocalStorage:
    """Local file system storage — same API as R2Storage for drop-in replacement."""

    def __init__(self):
        self.root = STORAGE_DIR
        self.root.mkdir(parents=True, exist_ok=True)
        self._root_resolved = self.root.resolve()
        # Keep these for health check compatibility
        self.access_key = "local"
        self.secret_key = "local"
        self.endpoint = str(self.root)
        logger.info("local_storage_init", root=str(self.root))

    def _resolve(self, key: str) -> Path:
        """Resolve a storage key to a local file path (with path traversal protection)."""
        path = (self.root / key).resolve()
        try:
            path.relative_to(self._root_resolved)
        except ValueError:
            raise ValueError(f"Path traversal detected: {key}")
        return path

    def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> dict:
        """Save data to local file."""
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        logger.info("local_stored", key=key, size=len(data))
        return {"key": key, "cdn_url": f"/files/{key}", "size": len(data)}

    def upload_file(self, key: str, file_path: str, content_type: str = "application/octet-stream") -> dict:
        """Copy a file to local storage."""
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file_path, path)
        size = path.stat().st_size
        logger.info("local_stored_file", key=key, size=size)
        return {"key": key, "cdn_url": f"/files/{key}", "size": size}

    def download(self, key: str) -> bytes:
        """Read a file from local storage."""
        path = self._resolve(key)
        if not path.exists():
            raise RuntimeError(f"File not found: {key}")
        return path.read_bytes()

    def get_local_path(self, key: str) -> Path:
        """Get the local filesystem path for a storage key (avoids RAM load for large files)."""
        path = self._resolve(key)
        if not path.exists():
            raise RuntimeError(f"File not found: {key}")
        return path

    def copy_to(self, key: str, dest_path: str) -> str:
        """Copy a stored file to a destination path (no RAM load)."""
        src = self._resolve(key)
        if not src.exists():
            raise RuntimeError(f"File not found: {key}")
        shutil.copy2(str(src), dest_path)
        return dest_path

    def delete(self, key: str) -> bool:
        """Delete a file from local storage."""
        path = self._resolve(key)
        if path.exists():
            path.unlink()
            logger.info("local_deleted", key=key)
            # Clean up empty parent directories
            try:
                parent = path.parent
                while parent != self.root and not any(parent.iterdir()):
                    parent.rmdir()
                    parent = parent.parent
            except Exception:
                pass
            return True
        return False

    def delete_many(self, keys: list[str]) -> int:
        """Delete multiple files."""
        deleted = 0
        for key in keys:
            if self.delete(key):
                deleted += 1
        return deleted

    def get_cdn_url(self, key: str) -> str:
        """Get local file URL (served via /files/ endpoint)."""
        return f"/files/{key}"

    def get_storage_key(self, user_id: str, project_id: str, file_type: str, filename: str) -> str:
        """Generate a structured storage key."""
        return f"users/{user_id}/{project_id}/{file_type}/{filename}"


_storage_client: Optional[LocalStorage] = None


def get_r2_storage() -> LocalStorage:
    """Get singleton storage client (kept as get_r2_storage for API compatibility)."""
    global _storage_client
    if _storage_client is None:
        _storage_client = LocalStorage()
    return _storage_client
