[CmdletBinding()]
param(
	[int]$BackendPort = 8000,
	[int]$FrontendPort = 5173,
	[string]$BackendHost = "127.0.0.1",
	[string]$FrontendHost = "127.0.0.1",
	[int]$StartupTimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
	param([string]$Message)
	Write-Host "[start-services] $Message" -ForegroundColor Cyan
}

function Stop-RepoDevProcesses {
	param(
		[string]$RepoRoot,
		[int[]]$Ports
	)

	$repoPattern = [regex]::Escape($RepoRoot)

	$byCommand = Get-CimInstance Win32_Process |
		Where-Object {
			$_.CommandLine -and
			$_.CommandLine -match $repoPattern -and
			(
				$_.CommandLine -match "uvicorn" -or
				$_.CommandLine -match "npm run dev" -or
				$_.CommandLine -match "vite"
			)
		} |
		Select-Object -ExpandProperty ProcessId

	$byPort = foreach ($port in $Ports) {
		Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
			Select-Object -ExpandProperty OwningProcess
	}

	$all = @($byCommand)
	$all += @($byPort)
	$all = @($all | Where-Object { $_ } | Sort-Object -Unique)

	if (-not $all -or $all.Count -eq 0) {
		Write-Step "No existing service processes found"
		return
	}

	foreach ($procId in $all) {
		try {
			Write-Step ("Stopping PID {0}" -f $procId)
			Stop-Process -Id $procId -Force -ErrorAction Stop
		}
		catch {
			Write-Step ("PID {0} already stopped or inaccessible" -f $procId)
		}
	}
}

function Start-ServiceWindow {
	param(
		[string]$Title,
		[string]$Command
	)

	Write-Step ("Starting {0}" -f $Title)
	Start-Process powershell -ArgumentList "-NoExit", "-Command", $Command | Out-Null
}

function Wait-ForUrl {
	param(
		[string]$Url,
		[int]$TimeoutSeconds
	)

	$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

	while ((Get-Date) -lt $deadline) {
		try {
			$resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
			if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
				return $true
			}
		}
		catch {
			# Service may still be booting.
		}

		Start-Sleep -Milliseconds 700
	}

	return $false
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".")).Path
$backendPath = Join-Path $repoRoot "backend"
$frontendPath = Join-Path $repoRoot "frontend"

$backendActivateRoot = Join-Path $repoRoot ".venv\Scripts\Activate.ps1"
$backendActivateLocal = Join-Path $backendPath ".venv\Scripts\Activate.ps1"

if (Test-Path $backendActivateRoot) {
	$activatePath = $backendActivateRoot
}
elseif (Test-Path $backendActivateLocal) {
	$activatePath = $backendActivateLocal
}
else {
	$activatePath = $null
}

$backendUrl = "http://$BackendHost`:$BackendPort/health"
$frontendUrl = "http://$FrontendHost`:$FrontendPort/"

Push-Location $repoRoot
try {
	Write-Step "Stopping existing backend/frontend processes"
	Stop-RepoDevProcesses -RepoRoot $repoRoot -Ports @($BackendPort, $FrontendPort)

	$backendCommandPrefix = "Set-Location '$backendPath';"
	if ($activatePath) {
		$backendCommandPrefix = "$backendCommandPrefix & '$activatePath';"
	}

	$backendCommand = "$backendCommandPrefix uvicorn app.main:app --reload --host $BackendHost --port $BackendPort"
	$frontendCommand = "Set-Location '$frontendPath'; npm run dev -- --host $FrontendHost --port $FrontendPort"

	Start-ServiceWindow -Title "backend" -Command $backendCommand
	Start-ServiceWindow -Title "frontend" -Command $frontendCommand

	Write-Step ("Waiting for backend at {0}" -f $backendUrl)
	if (-not (Wait-ForUrl -Url $backendUrl -TimeoutSeconds $StartupTimeoutSeconds)) {
		throw "Backend did not become healthy in time."
	}

	Write-Step ("Waiting for frontend at {0}" -f $frontendUrl)
	if (-not (Wait-ForUrl -Url $frontendUrl -TimeoutSeconds $StartupTimeoutSeconds)) {
		throw "Frontend did not become available in time."
	}

	Write-Step "All services are running"
}
catch {
	Write-Host ("[start-services] ERROR: {0}" -f $_.Exception.Message) -ForegroundColor Red
	exit 1
}
finally {
	Pop-Location
}
