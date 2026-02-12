from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_username: str = ""
    redis_password: str = ""

    # Cloudflare R2 Storage
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_endpoint: str = ""
    r2_bucket_name: str = "subtranslate"
    r2_cdn_domain: str = "cdn.syrins.tech"

    # AI Keys (system-level)
    openai_api_key: str = ""
    deepl_api_key: str = ""
    gemini_api_key: str = ""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    cors_origins: str = "http://localhost:3000"

    # Upload & Storage
    max_upload_size_mb: int = 2048
    temp_dir: str = "./tmp"
    storage_dir: str = ""

    @property
    def redis_broker_url(self) -> str:
        """Build Redis URL with auth if username/password provided."""
        if self.redis_username or self.redis_password:
            from urllib.parse import urlparse, urlunparse
            parsed = urlparse(self.redis_url)
            netloc = ""
            if self.redis_username:
                netloc = self.redis_username
            if self.redis_password:
                netloc = f"{netloc}:{self.redis_password}"
            netloc = f"{netloc}@{parsed.hostname}"
            if parsed.port:
                netloc = f"{netloc}:{parsed.port}"
            return urlunparse((parsed.scheme, netloc, parsed.path, "", "", ""))
        return self.redis_url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def temp_path(self) -> Path:
        p = Path(self.temp_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
