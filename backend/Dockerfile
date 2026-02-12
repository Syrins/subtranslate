FROM python:3.12-slim

WORKDIR /app

# System deps (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download ffmpeg + ffprobe static binaries (cached in image)
RUN python -c "import static_ffmpeg; static_ffmpeg.run.get_or_fetch_platform_executables_else_raise(); print('ffmpeg+ffprobe downloaded')"

# App code
COPY . .

# Create persistent directories
RUN mkdir -p /app/tmp /app/storage

# Default env vars (overridden by Coolify/docker-compose)
ENV HOST=0.0.0.0
ENV PORT=8000
ENV TEMP_DIR=/app/tmp
ENV STORAGE_DIR=/app/storage

EXPOSE 8000

# Use workers for production (2 workers, each with own event loop)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
