# SubTranslate - Stop All Services (Windows)
# Usage: .\stop.ps1

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot
$PID_DIR = Join-Path $ROOT ".pids"
$BACKEND = Join-Path $ROOT "backend"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SubTranslate - Stopping Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Stop-ByPidFile {
    param(
        [Parameter(Mandatory=$true)][string]$ServiceName,
        [Parameter(Mandatory=$true)][string]$PidFilePath
    )

    if (-not (Test-Path $PidFilePath)) {
        Write-Host "  [NOT FOUND] $ServiceName - no PID file" -ForegroundColor Gray
        return
    }

    $raw = Get-Content $PidFilePath -Raw -ErrorAction SilentlyContinue
    if ($raw -eq $null) { $raw = "" }
    $procIdStr = ($raw.ToString()).Trim()

    if ([string]::IsNullOrWhiteSpace($procIdStr) -or ($procIdStr -notmatch '^\d+$')) {
        Write-Host "  [WARN] $ServiceName - invalid PID in file: '$procIdStr'" -ForegroundColor Yellow
        Remove-Item $PidFilePath -Force -ErrorAction SilentlyContinue
        return
    }

    $procId = [int]$procIdStr

    try {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "  [STOPPED] $ServiceName (PID: $procId)" -ForegroundColor Green
        } else {
            Write-Host "  [ALREADY STOPPED] $ServiceName (PID: $procId)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  [ALREADY STOPPED] $ServiceName (PID: $procId)" -ForegroundColor Yellow
    }

    Remove-Item $PidFilePath -Force -ErrorAction SilentlyContinue
}

# --- Stop via PID files ---
if (Test-Path $PID_DIR) {
    Stop-ByPidFile -ServiceName "celery_beat"   -PidFilePath (Join-Path $PID_DIR "celery_beat.pid")
    Stop-ByPidFile -ServiceName "celery_worker" -PidFilePath (Join-Path $PID_DIR "celery_worker.pid")
    Stop-ByPidFile -ServiceName "backend"       -PidFilePath (Join-Path $PID_DIR "backend.pid")
} else {
    Write-Host "  [INFO] PID directory not found: $PID_DIR" -ForegroundColor Gray
}

# --- Safety cleanup: kill remaining processes started from this project path ---
Write-Host ""
Write-Host "  Cleaning up remaining SubTranslate processes (by command line)..." -ForegroundColor Yellow

$rootEsc = [Regex]::Escape($ROOT)
$backendEsc = [Regex]::Escape($BACKEND)

$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
if ($procs -eq $null) { $procs = @() }

$targets = @()

foreach ($p in $procs) {
    $cmd = $p.CommandLine
    if ([string]::IsNullOrWhiteSpace($cmd)) { continue }

    $isTarget = $false

    # Backend run.py
    if (($cmd -match $backendEsc) -and ($cmd -match 'run\.py')) {
        $isTarget = $true
    }

    # Celery worker/beat
    if (-not $isTarget -and ($cmd -match $backendEsc) -and ($cmd -match '\bcelery(\.exe)?\b') -and ($cmd -match '\-A\s+app\.workers\.celery_app')) {
        $isTarget = $true
    }

    # Fallback: any python/celery started inside the project root
    if (-not $isTarget -and ($cmd -match $rootEsc) -and (($cmd -match '\bpython(\.exe)?\b') -or ($cmd -match '\bcelery(\.exe)?\b'))) {
        $isTarget = $true
    }

    if ($isTarget) { $targets += $p }
}

if ($targets.Count -gt 0) {
    foreach ($p in $targets) {
        try {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host ("  [KILLED] PID: {0}" -f $p.ProcessId) -ForegroundColor Yellow
        } catch {
            Write-Host ("  [SKIP] Could not kill PID: {0}" -f $p.ProcessId) -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  [OK] No remaining SubTranslate processes found." -ForegroundColor Green
}

Write-Host ""
Write-Host "All services stopped." -ForegroundColor Green
Write-Host ""
