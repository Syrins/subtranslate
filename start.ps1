# SubTranslate - Start All Services (Windows)
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot
$BACKEND = Join-Path $ROOT "backend"
$VENV_PYTHON = Join-Path $BACKEND "venv\Scripts\python.exe"
$VENV_CELERY = Join-Path $BACKEND "venv\Scripts\celery.exe"
$PID_DIR = Join-Path $ROOT ".pids"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SubTranslate - Starting Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create pid directory
if (-not (Test-Path $PID_DIR)) { New-Item -ItemType Directory -Path $PID_DIR | Out-Null }

# Check venv
if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "[ERROR] Python venv not found at $VENV_PYTHON" -ForegroundColor Red
    Write-Host "Run: cd backend && python -m venv venv && .\venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

# Check .env
$ENV_FILE = Join-Path $BACKEND ".env"
if (-not (Test-Path $ENV_FILE)) {
    Write-Host "[ERROR] .env file not found. Copy .env.example to .env and fill in values." -ForegroundColor Red
    exit 1
}

# --- 1. Start Backend (FastAPI) ---
Write-Host "[1/3] Starting FastAPI backend..." -ForegroundColor Green
$backend_proc = Start-Process -FilePath $VENV_PYTHON -ArgumentList "run.py" -WorkingDirectory $BACKEND -PassThru -WindowStyle Minimized
$backend_proc.Id | Out-File (Join-Path $PID_DIR "backend.pid") -Force
Write-Host "      PID: $($backend_proc.Id) | http://localhost:8000" -ForegroundColor Gray
Write-Host "      Docs: http://localhost:8000/docs" -ForegroundColor Gray

Start-Sleep -Seconds 2

# --- 2. Start Celery Worker ---
Write-Host "[2/3] Starting Celery worker..." -ForegroundColor Green
$worker_proc = Start-Process -FilePath $VENV_CELERY -ArgumentList "-A app.workers.celery_app worker --loglevel=info --concurrency=4 --pool=solo" -WorkingDirectory $BACKEND -PassThru -WindowStyle Minimized
$worker_proc.Id | Out-File (Join-Path $PID_DIR "celery_worker.pid") -Force
Write-Host "      PID: $($worker_proc.Id)" -ForegroundColor Gray

Start-Sleep -Seconds 2

# --- 3. Start Celery Beat ---
Write-Host "[3/3] Starting Celery beat scheduler..." -ForegroundColor Green
$beat_proc = Start-Process -FilePath $VENV_CELERY -ArgumentList "-A app.workers.celery_app beat --loglevel=info" -WorkingDirectory $BACKEND -PassThru -WindowStyle Minimized
$beat_proc.Id | Out-File (Join-Path $PID_DIR "celery_beat.pid") -Force
Write-Host "      PID: $($beat_proc.Id)" -ForegroundColor Gray

# --- Health Check ---
Write-Host ""
Write-Host "Waiting for backend to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 5
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Health Check Results" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Status:   $($response.status)" -ForegroundColor $(if ($response.status -eq "ok") { "Green" } else { "Yellow" })
    Write-Host "  FFmpeg:   $($response.ffmpeg)" -ForegroundColor $(if ($response.ffmpeg) { "Green" } else { "Red" })
    Write-Host "  Redis:    $($response.redis)" -ForegroundColor $(if ($response.redis) { "Green" } else { "Red" })
    Write-Host "  Supabase: $($response.supabase)" -ForegroundColor $(if ($response.supabase) { "Green" } else { "Red" })
    Write-Host "  R2:       $($response.r2)" -ForegroundColor $(if ($response.r2) { "Green" } else { "Red" })
    Write-Host "========================================" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Health check failed - backend may still be starting" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "All services started! To stop: .\stop.ps1" -ForegroundColor Cyan
Write-Host ""
