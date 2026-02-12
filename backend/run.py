"""Development server runner."""
import uvicorn
from app.core.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        reload_dirs=["app"],
        log_level="debug" if settings.debug else "info",
    )
