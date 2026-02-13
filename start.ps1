# SubTranslate - Start Services (Windows)
#
# Usage:
#   .\start.ps1                  # headless (no console windows), logs -> .\logs
#   .\start.ps1 -ShowWindows     # show minimized windows with live logs
#   .\start.ps1 -NoFrontend
#   .\start.ps1 -NoWorker
#   .\start.ps1 -NoBeat
#   .\start.ps1 -SkipHealthChecks
#
# Why this exists:
# - Uvicorn reload (watchfiles) uses a parent reloader + a child server process.
# - If you only stop the parent PID, the child can remain alive (ports/files stay “open”).
# - This script is paired with stop.ps1 (which kills process trees).

[CmdletBinding()]
param(
    [switch]$ShowWindows,
    [switch]$NoFrontend,
    [switch]$NoWorker,
    [switch]$NoBeat,
    [switch]$SkipHealthChecks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT = $PSScriptRoot
$BACKEND = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"

$VENV_PYTHON = Join-Path $BACKEND "venv\Scripts\python.exe"
$VENV_CELERY = Join-Path $BACKEND "venv\Scripts\celery.exe"
$BACKEND_ENV = Join-Path $BACKEND ".env"
$FRONTEND_ENV = Join-Path $FRONTEND ".env.local"

$PID_DIR = Join-Path $ROOT ".pids"
$LOG_DIR = Join-Path $ROOT "logs"

$BACKEND_PID_FILE  = Join-Path $PID_DIR "backend.pid"
$WORKER_PID_FILE   = Join-Path $PID_DIR "celery_worker.pid"
$BEAT_PID_FILE     = Join-Path $PID_DIR "celery_beat.pid"
$FRONTEND_PID_FILE = Join-Path $PID_DIR "frontend.pid"

function Fail-AndExit {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

function Get-AliveProcessFromPidFile {
    param([string]$PidFilePath)

    if (-not (Test-Path $PidFilePath)) { return $null }

    $raw = Get-Content $PidFilePath -Raw -ErrorAction SilentlyContinue
    if ($null -eq $raw) { $raw = "" }
    $pidStr = ($raw.ToString()).Trim()

    if (($pidStr -notmatch '^\d+$')) {
        Remove-Item $PidFilePath -Force -ErrorAction SilentlyContinue
        return $null
    }

    $proc = Get-Process -Id ([int]$pidStr) -ErrorAction SilentlyContinue
    if (-not $proc) {
        Remove-Item $PidFilePath -Force -ErrorAction SilentlyContinue
        return $null
    }

    return $proc
}

function Find-ProjectProcesses {
    param([string]$Pattern)

    # Her zaman array döndür
    $procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    if ($procs.Length -eq 0) { return @() }

    $filtered = @($procs | Where-Object { $_.CommandLine -and ($_.CommandLine -match $Pattern) })
    return $filtered
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

function Assert-ServiceNotRunning {
    param(
        [string]$ServiceName,
        [string]$PidFilePath,
        [string]$Pattern,
        [int]$Port = 0
    )

    $pidProc = Get-AliveProcessFromPidFile -PidFilePath $PidFilePath
    if ($pidProc) {
        Fail-AndExit "$ServiceName already running (PID: $($pidProc.Id)). Run .\stop.ps1 and retry."
    }

    # HER ZAMAN array
    $cmdProcs = @(Find-ProjectProcesses -Pattern $Pattern)
    if ($cmdProcs.Length -gt 0) {
        $pids = ($cmdProcs | Select-Object -ExpandProperty ProcessId) -join ", "
        Fail-AndExit "$ServiceName already running (PID: $pids). Run .\stop.ps1 and retry."
    }

    if ($Port -gt 0) {
        # HER ZAMAN array
        $pidsOnPort = @(Get-ListeningPids -Port $Port)
        if ($pidsOnPort.Length -gt 0) {
            foreach ($procId in $pidsOnPort) {
                $cmd = $null
                try {  $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId").CommandLine } catch { $cmd = $null }
                if ($cmd -and ($cmd -match [Regex]::Escape($ROOT))) {
                    Fail-AndExit "... PID $procId ..."
                }
            }
        }
    }
}


function With-TempEnv {
    param(
        [hashtable]$Vars,
        [scriptblock]$Script
    )

    $backup = @{}
    foreach ($k in $Vars.Keys) {
        $existing = Get-Item -Path ("Env:{0}" -f $k) -ErrorAction SilentlyContinue
        if ($existing) {
            $backup[$k] = [pscustomobject]@{ Existed = $true; Value = $existing.Value }
        } else {
            $backup[$k] = [pscustomobject]@{ Existed = $false; Value = $null }
        }
    }

    try {
        foreach ($k in $Vars.Keys) {
            $v = $Vars[$k]
            if ($null -eq $v) {
                Remove-Item -Path ("Env:{0}" -f $k) -ErrorAction SilentlyContinue
            } else {
                Set-Item -Path ("Env:{0}" -f $k) -Value ([string]$v)
            }
        }

        # Script’in çıktısını (Start-Process -PassThru dönen Process objesi) geri döndür
        return & $Script
    }
    finally {
        foreach ($k in $Vars.Keys) {
            if ($backup[$k].Existed) {
                Set-Item -Path ("Env:{0}" -f $k) -Value ([string]$backup[$k].Value)
            } else {
                Remove-Item -Path ("Env:{0}" -f $k) -ErrorAction SilentlyContinue
            }
        }
    }
}


function Start-ServiceProcess {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][string]$FilePath,
        [Parameter(Mandatory=$true)][object]$ArgumentList,
        [Parameter(Mandatory=$true)][string]$WorkingDirectory,
        [Parameter(Mandatory=$true)][string]$PidFilePath,
        [hashtable]$TempEnv = $null,
        [string]$OutLog = $null,
        [string]$ErrLog = $null,
        [ValidateRange(1,30)][int]$WarmupSeconds = 2
    )

    $windowStyle = if ($ShowWindows) { "Minimized" } else { "Hidden" }

    $startBlock = {
        if ($ShowWindows) {
            Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle $windowStyle
        } else {
            Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle $windowStyle `
                -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
        }
    }

    $proc = $null
    if ($TempEnv) { $proc = With-TempEnv -Vars $TempEnv -Script $startBlock } else { $proc = & $startBlock }

    $proc.Id | Out-File $PidFilePath -Force
    Start-Sleep -Seconds $WarmupSeconds

    if ($proc.HasExited) {
        Fail-AndExit "$Name exited immediately. Check logs."
    }

    return $proc
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SubTranslate - Starting Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Ensure-Dir -Path $PID_DIR
Ensure-Dir -Path $LOG_DIR

# Validate backend venv + env
if (-not (Test-Path $VENV_PYTHON)) {
    Fail-AndExit "Python venv not found at $VENV_PYTHON`nRun: cd backend; python -m venv venv; .\venv\Scripts\pip install -r requirements.txt"
}
if (-not (Test-Path $VENV_CELERY)) {
    Fail-AndExit "Celery executable not found at $VENV_CELERY"
}
if (-not (Test-Path $BACKEND_ENV)) {
    Fail-AndExit "Backend .env file not found at $BACKEND_ENV"
}

# Validate frontend env + node/npm if frontend enabled
$NPM = $null
$NODE = $null
if (-not $NoFrontend) {
    if (-not (Test-Path $FRONTEND_ENV)) {
        Fail-AndExit "Frontend .env.local file not found at $FRONTEND_ENV"
    }

    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
    if (-not $npmCmd) { Fail-AndExit "npm command not found. Install Node.js first." }
    $NPM = $npmCmd.Source

    $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { $nodeCmd = Get-Command node -ErrorAction SilentlyContinue }
    if (-not $nodeCmd) { Fail-AndExit "node command not found. Install Node.js first." }
    $NODE = $nodeCmd.Source

    # Ensure frontend deps
    $nodeModules = Join-Path $FRONTEND "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host "[PREP] frontend/node_modules not found, running npm install..." -ForegroundColor Yellow
        & $NPM install --prefix $FRONTEND
        if ($LASTEXITCODE -ne 0) {
            Fail-AndExit "npm install failed in frontend."
        }
    }
}

# Detect already-running services (including orphaned reload children)
$backendEsc = [Regex]::Escape($BACKEND)
$frontendEsc = [Regex]::Escape($FRONTEND)

$backendPattern  = "$backendEsc.*(run\.py|\buvicorn\b|\bwatchfiles\b)"
$workerPattern   = "$backendEsc.*\bcelery(\.exe)?\b.*\-A\s+app\.workers\.celery_app.*\bworker\b"
$beatPattern     = "$backendEsc.*\bcelery(\.exe)?\b.*\-A\s+app\.workers\.celery_app.*\bbeat\b"
$frontendPattern = "$frontendEsc.*((\bnext(\.exe)?\b.*\bdev\b)|start-server\.js|npm(\.cmd)?\s+run\s+dev)"

Assert-ServiceNotRunning -ServiceName "Backend"       -PidFilePath $BACKEND_PID_FILE  -Pattern $backendPattern  -Port 8000
if (-not $NoWorker) { Assert-ServiceNotRunning -ServiceName "Celery worker" -PidFilePath $WORKER_PID_FILE -Pattern $workerPattern }
if (-not $NoBeat)   { Assert-ServiceNotRunning -ServiceName "Celery beat"   -PidFilePath $BEAT_PID_FILE   -Pattern $beatPattern }
if (-not $NoFrontend) { Assert-ServiceNotRunning -ServiceName "Frontend" -PidFilePath $FRONTEND_PID_FILE -Pattern $frontendPattern -Port 3000 }

$started = New-Object System.Collections.Generic.List[int]

function Cleanup-Started {
    if ($started.Count -eq 0) { return }
    Write-Host ""
    Write-Host "[CLEANUP] Stopping started processes due to an error..." -ForegroundColor Yellow
    foreach ($procId in @($started | Sort-Object -Descending)) {
        try { & taskkill.exe /PID $procId /T /F 2>$null | Out-Null } catch { }
    }
}

try {
    # --- 1. Backend ---
    Write-Host "[1/4] Starting FastAPI backend..." -ForegroundColor Green
    $backendOut = Join-Path $LOG_DIR "backend.out.log"
    $backendErr = Join-Path $LOG_DIR "backend.err.log"

    $backendProc = Start-ServiceProcess -Name "Backend" -FilePath $VENV_PYTHON -ArgumentList "run.py" -WorkingDirectory $BACKEND `
        -PidFilePath $BACKEND_PID_FILE -TempEnv @{ NO_COLOR="1"; UVICORN_NO_COLOR="1"; PYTHONUNBUFFERED="1" } `
        -OutLog $backendOut -ErrLog $backendErr -WarmupSeconds 2

    [void]$started.Add($backendProc.Id)
    Write-Host "      PID: $($backendProc.Id) | http://localhost:8000" -ForegroundColor Gray
    if (-not $ShowWindows) { Write-Host "      Logs: $backendOut , $backendErr" -ForegroundColor Gray }

    # --- 2. Celery Worker ---
    if (-not $NoWorker) {
        Write-Host "[2/4] Starting Celery worker..." -ForegroundColor Green
        $workerOut = Join-Path $LOG_DIR "celery_worker.out.log"
        $workerErr = Join-Path $LOG_DIR "celery_worker.err.log"
        $workerProc = Start-ServiceProcess -Name "Celery worker" -FilePath $VENV_CELERY `
            -ArgumentList "-A app.workers.celery_app worker --loglevel=info --pool=solo --concurrency=1" `
            -WorkingDirectory $BACKEND -PidFilePath $WORKER_PID_FILE -TempEnv @{ PYTHONUNBUFFERED="1" } `
            -OutLog $workerOut -ErrLog $workerErr -WarmupSeconds 2
        [void]$started.Add($workerProc.Id)
        Write-Host "      PID: $($workerProc.Id)" -ForegroundColor Gray
        if (-not $ShowWindows) { Write-Host "      Logs: $workerOut , $workerErr" -ForegroundColor Gray }
    } else {
        Write-Host "[2/4] Skipping Celery worker..." -ForegroundColor Yellow
    }

    # --- 3. Celery Beat ---
    if (-not $NoBeat) {
        Write-Host "[3/4] Starting Celery beat scheduler..." -ForegroundColor Green
        $beatOut = Join-Path $LOG_DIR "celery_beat.out.log"
        $beatErr = Join-Path $LOG_DIR "celery_beat.err.log"
        $beatProc = Start-ServiceProcess -Name "Celery beat" -FilePath $VENV_CELERY `
            -ArgumentList "-A app.workers.celery_app beat --loglevel=info" `
            -WorkingDirectory $BACKEND -PidFilePath $BEAT_PID_FILE -TempEnv @{ PYTHONUNBUFFERED="1" } `
            -OutLog $beatOut -ErrLog $beatErr -WarmupSeconds 2
        [void]$started.Add($beatProc.Id)
        Write-Host "      PID: $($beatProc.Id)" -ForegroundColor Gray
        if (-not $ShowWindows) { Write-Host "      Logs: $beatOut , $beatErr" -ForegroundColor Gray }
    } else {
        Write-Host "[3/4] Skipping Celery beat..." -ForegroundColor Yellow
    }

    # --- 4. Frontend ---
    if (-not $NoFrontend) {
        Write-Host "[4/4] Starting Frontend (Next.js dev)..." -ForegroundColor Green
        $nextBin = Join-Path $FRONTEND "node_modules\next\dist\bin\next"
        if (-not (Test-Path $nextBin)) {
            Fail-AndExit "Next.js binary not found at $nextBin. Run npm install in frontend."
        }

        $frontendOut = Join-Path $LOG_DIR "frontend.out.log"
        $frontendErr = Join-Path $LOG_DIR "frontend.err.log"

        $oldApiUrl = Get-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
        try {
            $env:NEXT_PUBLIC_API_URL = "http://localhost:8000"
            $frontendProc = Start-ServiceProcess -Name "Frontend" -FilePath $NODE `
                -ArgumentList @($nextBin, "dev") -WorkingDirectory $FRONTEND -PidFilePath $FRONTEND_PID_FILE `
                -TempEnv @{ NO_COLOR="1" } -OutLog $frontendOut -ErrLog $frontendErr -WarmupSeconds 2
        } finally {
            if ($oldApiUrl) { $env:NEXT_PUBLIC_API_URL = $oldApiUrl.Value } else { Remove-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue }
        }

        [void]$started.Add($frontendProc.Id)
        Write-Host "      PID: $($frontendProc.Id) | http://localhost:3000" -ForegroundColor Gray
        Write-Host "      NEXT_PUBLIC_API_URL: http://localhost:8000" -ForegroundColor Gray
        if (-not $ShowWindows) { Write-Host "      Logs: $frontendOut , $frontendErr" -ForegroundColor Gray }
    } else {
        Write-Host "[4/4] Skipping Frontend..." -ForegroundColor Yellow
    }

    if (-not $SkipHealthChecks) {
        Write-Host ""
        Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3

        $backendHealth = $null
        $frontendOk = $false

        try { $backendHealth = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 8 }
        catch { Write-Host "[WARN] Backend health check failed - backend may still be starting." -ForegroundColor Yellow }

        if (-not $NoFrontend) {
            try {
                $frontendResp = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 8 -UseBasicParsing
                if ($frontendResp.StatusCode -ge 200 -and $frontendResp.StatusCode -lt 500) { $frontendOk = $true }
            } catch {
                Write-Host "[WARN] Frontend health check failed - frontend may still be compiling." -ForegroundColor Yellow
            }
        }

        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  Health Check Results" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green

        if ($backendHealth -ne $null) {
            Write-Host "  Backend Status:  $($backendHealth.status)" -ForegroundColor $(if ($backendHealth.status -eq "ok") { "Green" } else { "Yellow" })
            if ($backendHealth.PSObject.Properties.Name -contains "ffmpeg")   { Write-Host "  FFmpeg:          $($backendHealth.ffmpeg)"   -ForegroundColor $(if ($backendHealth.ffmpeg) { "Green" } else { "Red" }) }
            if ($backendHealth.PSObject.Properties.Name -contains "redis")    { Write-Host "  Redis:           $($backendHealth.redis)"    -ForegroundColor $(if ($backendHealth.redis) { "Green" } else { "Red" }) }
            if ($backendHealth.PSObject.Properties.Name -contains "supabase") { Write-Host "  Supabase:        $($backendHealth.supabase)" -ForegroundColor $(if ($backendHealth.supabase) { "Green" } else { "Red" }) }
        } else {
            Write-Host "  Backend Status:  unknown" -ForegroundColor Yellow
        }

        if (-not $NoFrontend) {
            Write-Host "  Frontend (3000): $frontendOk" -ForegroundColor $(if ($frontendOk) { "Green" } else { "Yellow" })
        }
        Write-Host "========================================" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "All requested services started!" -ForegroundColor Cyan
    Write-Host "To stop everything: .\stop.ps1" -ForegroundColor Cyan
    if (-not $ShowWindows) { Write-Host "Logs folder: $LOG_DIR" -ForegroundColor Cyan }
    Write-Host ""

} catch {
    Cleanup-Started
    throw
}
