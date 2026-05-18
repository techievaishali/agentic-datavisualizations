[CmdletBinding()]
param(
    [string]$Remote = "origin",
    [string]$Branch = "main",
    [switch]$RestartBackend
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host "[safe-sync] $Message" -ForegroundColor Cyan
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot

try {
    Write-Step "Validating git repository"
    git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "This script must be run inside a git repository."
    }

    Write-Step "Stopping repo dev processes that can lock files"
    $repoPattern = [regex]::Escape($repoRoot)
    $lockingProcesses = Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -match $repoPattern -and
            (
                $_.CommandLine -match "uvicorn app\.main:app" -or
                $_.CommandLine -match "npm run dev" -or
                $_.CommandLine -match "vite"
            )
        }

    if ($lockingProcesses) {
        $lockingProcesses | ForEach-Object {
            Write-Step ("Stopping PID {0} ({1})" -f $_.ProcessId, $_.Name)
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Step "No matching repo dev processes found"
    }

    Write-Step "Checking for tracked local changes"
    $statusOutput = git status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to read git status."
    }

    if ($statusOutput) {
        Write-Host "Tracked changes detected. Commit/stash/discard first:" -ForegroundColor Yellow
        Write-Host $statusOutput -ForegroundColor Yellow
        exit 1
    }

    Write-Step ("Fetching {0}" -f $Remote)
    git fetch $Remote --prune
    if ($LASTEXITCODE -ne 0) {
        throw "Fetch failed."
    }

    Write-Step ("Pulling with rebase from {0}/{1}" -f $Remote, $Branch)
    git pull --rebase $Remote $Branch
    if ($LASTEXITCODE -ne 0) {
        throw "Pull with rebase failed."
    }

    if ($RestartBackend) {
        Write-Step "Restarting backend server in a new terminal"
        $backendPath = Join-Path $repoRoot "backend"
        $rootVenvActivate = Join-Path $repoRoot ".venv\Scripts\Activate.ps1"
        $backendVenvActivate = Join-Path $backendPath ".venv\Scripts\Activate.ps1"

        if (Test-Path $rootVenvActivate) {
            $activatePath = $rootVenvActivate
        } elseif (Test-Path $backendVenvActivate) {
            $activatePath = $backendVenvActivate
        } else {
            $activatePath = $null
        }

        if ($activatePath) {
            $command = "Set-Location '$backendPath'; & '$activatePath'; uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
        } else {
            $command = "Set-Location '$backendPath'; uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
        }

        Start-Process powershell -ArgumentList "-NoExit", "-Command", $command | Out-Null
    }

    Write-Step "Sync completed successfully"
}
catch {
    Write-Host ("[safe-sync] ERROR: {0}" -f $_.Exception.Message) -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
