FROM python:3.12-slim AS base

WORKDIR /app

# System deps (curl for healthcheck, fontconfig for subtitle fonts)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl fontconfig fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Python deps (cached layer — only rebuilds when requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir --no-warn-script-location -r requirements.txt

# Pre-download ffmpeg + ffprobe static binaries (cached in image)
RUN python -c "import static_ffmpeg; static_ffmpeg.run.get_or_fetch_platform_executables_else_raise(); print('ffmpeg+ffprobe downloaded')"

# App code
COPY . .

# Non-root user for security
RUN groupadd --system --gid 1001 appuser \
    && useradd --system --uid 1001 --gid appuser appuser \
    && mkdir -p /app/tmp /app/storage \
    && chown -R appuser:appuser /app \
    && chown -R appuser:appuser /usr/local/lib/python3.12/site-packages/static_ffmpeg

USER appuser

# Default env vars (overridden by Coolify/docker-compose)
ENV HOST=0.0.0.0 \
    PORT=8000 \
    TEMP_DIR=/app/tmp \
    STORAGE_DIR=/app/storage \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

# Use workers for production (2 workers, each with own event loop)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
