# SubTranslate - Stop All Services (Windows)
# Usage:
#   .\stop.ps1
#
# Fix:
# - Uses taskkill /T /F to kill the whole process tree for each saved PID.
#   This reliably stops uvicorn reload children and releases files/ports.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT = $PSScriptRoot
$PID_DIR = Join-Path $ROOT ".pids"
$BACKEND = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"

function Kill-ProcessTree {
    param([Parameter(Mandatory=$true)][int]$ProcessId)

    try {
        & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
        return $true
    } catch {
        try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch { }
        return $false
    }
}

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

    $killed = Kill-ProcessTree -ProcessId $procId
    if ($killed) {
        Write-Host "  [STOPPED] $ServiceName (PID tree: $procId)" -ForegroundColor Green
    } else {
        Write-Host "  [STOPPED/NOT FOUND] $ServiceName (PID: $procId)" -ForegroundColor Yellow
    }

    Remove-Item $PidFilePath -Force -ErrorAction SilentlyContinue
}

function Get-ListeningPids {
    param([int]$Port)

    $pids = New-Object System.Collections.Generic.List[int]
    try {
        $conns = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
        foreach ($c in $conns) {
            if ($null -ne $c.OwningProcess) { [void]$pids.Add([int]$c.OwningProcess) }
        }
    } catch {
        $lines = & netstat -ano 2>$null | Select-String -Pattern (":$Port\s") -ErrorAction SilentlyContinue
        foreach ($m in $lines) {
            $line = ($m.Line -replace "\s+"," ").Trim()
            $parts = $line.Split(" ")
            if ($parts.Length -ge 5) {
                $maybePid = $parts[$parts.Length - 1]
                if ($maybePid -match '^\d+$') { [void]$pids.Add([int]$maybePid) }
            }
        }
    }

    return @($pids | Sort-Object -Unique)
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SubTranslate - Stopping Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Stop via PID files (kill process trees) ---
if (Test-Path $PID_DIR) {
    Stop-ByPidFile -ServiceName "frontend"      -PidFilePath (Join-Path $PID_DIR "frontend.pid")
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
$frontendEsc = [Regex]::Escape($FRONTEND)

$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
if ($procs -eq $null) { $procs = @() }

$targets = @()

foreach ($p in $procs) {
    $cmd = $p.CommandLine
    if ([string]::IsNullOrWhiteSpace($cmd)) { continue }

    $isTarget = $false

    # Backend (run.py / uvicorn / watchfiles)
    if (($cmd -match $backendEsc) -and (($cmd -match 'run\.py') -or ($cmd -match '\buvicorn\b') -or ($cmd -match '\bwatchfiles\b'))) {
        $isTarget = $true
    }

    # Celery worker/beat
    if (-not $isTarget -and ($cmd -match $backendEsc) -and ($cmd -match '\bcelery(\.exe)?\b') -and ($cmd -match '\-A\s+app\.workers\.celery_app')) {
        $isTarget = $true
    }

    # Frontend next dev (npm/node)
    if (-not $isTarget -and ($cmd -match $frontendEsc) -and (($cmd -match '\bnext(\.exe)?\b') -or ($cmd -match 'npm(\.cmd)?\s+run\s+dev'))) {
        $isTarget = $true
    }

    # Fallback: any python/celery/node/npm started inside the project root
    if (-not $isTarget -and ($cmd -match $rootEsc) -and (($cmd -match '\bpython(\.exe)?\b') -or ($cmd -match '\bcelery(\.exe)?\b') -or ($cmd -match '\bnode(\.exe)?\b') -or ($cmd -match '\bnpm(\.cmd)?\b'))) {
        $isTarget = $true
    }

    if ($isTarget) { $targets += $p }
}

if ($targets.Count -gt 0) {
    foreach ($p in $targets) {
        try {
            Kill-ProcessTree -ProcessId ([int]$p.ProcessId) | Out-Null
            Write-Host ("  [KILLED] PID tree: {0}" -f $p.ProcessId) -ForegroundColor Yellow
        } catch {
            Write-Host ("  [SKIP] Could not kill PID: {0}" -f $p.ProcessId) -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  [OK] No remaining SubTranslate processes found." -ForegroundColor Green
}

# --- Port-based cleanup (covers orphaned listeners even if PID files were missing) ---
Write-Host ""
Write-Host "  Releasing common ports (8000, 3000) if any SubTranslate processes are still listening..." -ForegroundColor Yellow

foreach ($port in @(8000, 3000)) {
    $pids = Get-ListeningPids -Port $port
    foreach ($procId in $pids) {
        $cmd = $null
        try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId").CommandLine } catch { $cmd = $null }
        if ($cmd -and ($cmd -match $rootEsc)) {
            Kill-ProcessTree -ProcessId $procId | Out-Null
            Write-Host "  [KILLED] PID tree $procId (was listening on $port)" -ForegroundColor Yellow
        }
    }
}

# --- Optional: remove static_ffmpeg lock file (not required, but avoids confusion) ---
$ffmpegLock = Join-Path $BACKEND "venv\Lib\site-packages\static_ffmpeg\lock.file"
if (Test-Path $ffmpegLock) {
    try {
        Remove-Item $ffmpegLock -Force -ErrorAction Stop
        Write-Host "  [CLEAN] Removed static_ffmpeg lock file" -ForegroundColor Green
    } catch {
        Write-Host "  [INFO] Could not remove static_ffmpeg lock file (it may already be gone)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "All services stopped." -ForegroundColor Green
Write-Host ""
