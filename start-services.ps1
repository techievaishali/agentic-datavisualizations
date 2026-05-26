# Start Services Script for Agentic AI Data Visualization

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sessionDir = Join-Path $scriptRoot ".runtime"
$sessionFile = Join-Path $sessionDir "service-session.json"
$backendPort = 8001
$frontendPort = 5173
$legacyBackendPort = 8000
$portsToClear = @($legacyBackendPort, $backendPort, $frontendPort)

Write-Host "========================================"
Write-Host "Starting Agentic AI Data Visualization"
Write-Host "========================================"

Write-Host ""
Write-Host "Stopping existing services and releasing ports..."

function Get-PortOwningPids {
	param([int]$TargetPort)

	$pidList = @()

	$tcpPids = Get-NetTCPConnection -State Listen -LocalPort $TargetPort -ErrorAction SilentlyContinue |
		Select-Object -ExpandProperty OwningProcess -Unique
	if ($tcpPids) {
		$pidList += $tcpPids
	}

	$netstatLines = netstat -ano -p tcp | Select-String ":$TargetPort\s+.*LISTENING\s+\d+"
	foreach ($line in $netstatLines) {
		if ($line.Line -match "LISTENING\s+(\d+)") {
			$pidList += [int]$Matches[1]
		}
	}

	return $pidList | Sort-Object -Unique
}

function Stop-OrphanedPythonWorkers {
	param(
		[Parameter(Mandatory = $true)]
		[int[]]$ParentPids
	)

	if (-not $ParentPids -or $ParentPids.Count -eq 0) {
		return
	}

	$workers = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
		Where-Object {
			$_.Name -eq "python.exe" -and $_.CommandLine -match "spawn_main\(parent_pid=(\d+)"
		}

	foreach ($worker in $workers) {
		$null = $worker.CommandLine -match "spawn_main\(parent_pid=(\d+)"
		$parentPid = [int]$Matches[1]
		if ($ParentPids -contains $parentPid) {
			Stop-Process -Id $worker.ProcessId -Force -ErrorAction SilentlyContinue
			cmd /c "taskkill /PID $($worker.ProcessId) /T /F >nul 2>&1" | Out-Null
		}
	}
}

function Stop-ProcessOnPort {
	param(
		[Parameter(Mandatory = $true)]
		[int]$Port
	)

	for ($attempt = 1; $attempt -le 5; $attempt++) {
		$connections = Get-PortOwningPids -TargetPort $Port

		if (-not $connections) {
			return
		}

		Stop-OrphanedPythonWorkers -ParentPids $connections

		foreach ($procId in $connections) {
			if (-not $procId -or $procId -eq $PID -or $procId -eq 0 -or $procId -eq 4) {
				continue
			}

			Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
			cmd /c "taskkill /PID $procId /T /F >nul 2>&1" | Out-Null
		}

		[System.Threading.Thread]::Sleep(250)
	}
}

function Wait-PortReleased {
	param(
		[Parameter(Mandatory = $true)]
		[int]$Port,
		[int]$TimeoutMs = 5000
	)

	$sw = [System.Diagnostics.Stopwatch]::StartNew()
	while ($sw.ElapsedMilliseconds -lt $TimeoutMs) {
		$inUse = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
		if (-not $inUse) {
			return $true
		}
		[System.Threading.Thread]::Sleep(200)
	}

	return $false
}

function Stop-RecordedSessionProcesses {
	if (-not (Test-Path $sessionFile)) {
		return
	}

	try {
		$session = Get-Content $sessionFile -Raw | ConvertFrom-Json
		foreach ($procId in $session.pids) {
			if ($procId -and $procId -ne $PID) {
				Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
				cmd /c "taskkill /PID $procId /T /F >nul 2>&1" | Out-Null
			}
		}
	} catch {
		Write-Host "Previous session metadata could not be parsed. Proceeding with port cleanup."
	}
}

function Stop-WorkspaceDevProcesses {
	$candidates = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
		Where-Object {
			$cmd = ($_.CommandLine | Out-String).ToLowerInvariant()
			$name = ($_.Name | Out-String).ToLowerInvariant()
			$isBackendShell = $cmd -match "uvicorn app\.main:app" -or $cmd -match "cd backend;.*uvicorn"
			$isFrontendShell = $cmd -match "vite\\bin\\vite\.js" -or $cmd -match "npm run dev" -or $cmd -match "--port 5173"
			$isDevCmd = $isBackendShell -or $isFrontendShell
			$isNodeOrShell = $name -match "node\.exe|python\.exe|powershell\.exe"
			$isDevCmd -and $isNodeOrShell
		}

	foreach ($process in $candidates) {
		if ($process.ProcessId -and $process.ProcessId -ne $PID) {
			Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
			cmd /c "taskkill /PID $($process.ProcessId) /T /F >nul 2>&1" | Out-Null
		}
	}
}

Stop-RecordedSessionProcesses
Stop-WorkspaceDevProcesses
foreach ($port in $portsToClear) {
	Stop-ProcessOnPort -Port $port
}
foreach ($port in $portsToClear) {
	if (-not (Wait-PortReleased -Port $port -TimeoutMs 6000)) {
		Write-Warning "Port $port is still in use after cleanup."
	}
}

if (-not (Wait-PortReleased -Port $backendPort -TimeoutMs 2000)) {
	$owners = Get-NetTCPConnection -State Listen -LocalPort $backendPort -ErrorAction SilentlyContinue |
		Select-Object -ExpandProperty OwningProcess -Unique
	throw "Cannot start services: backend port $backendPort is still occupied by PID(s): $($owners -join ', ')."
}

if (-not (Wait-PortReleased -Port $frontendPort -TimeoutMs 2000)) {
	$owners = Get-NetTCPConnection -State Listen -LocalPort $frontendPort -ErrorAction SilentlyContinue |
		Select-Object -ExpandProperty OwningProcess -Unique
	throw "Cannot start services: frontend port $frontendPort is still occupied by PID(s): $($owners -join ', ')."
}

# Start Backend (always on 8001)
Write-Host "Starting Backend on port 8001..."
$backendCmd = "Set-Location '$scriptRoot\\backend'; ..\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001"
$backendProc = Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal -PassThru

# Start Frontend (always proxy to backend 8001)
Write-Host "Starting Frontend on port 5173 with API target 8001..."
$frontendCmd = "Set-Location '$scriptRoot\\frontend'; `$env:VITE_API_PROXY_TARGET='http://127.0.0.1:8001'; npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
$frontendProc = Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal -PassThru

if (-not (Test-Path $sessionDir)) {
	New-Item -ItemType Directory -Path $sessionDir | Out-Null
}

@{
	createdAt = (Get-Date).ToString("o")
	pids = @($backendProc.Id, $frontendProc.Id)
	ports = $portsToClear
	backendPort = $backendPort
	frontendPort = $frontendPort
} | ConvertTo-Json | Set-Content -Path $sessionFile -Encoding UTF8

Write-Host ""
Write-Host "========================================"
Write-Host "Services restarted with clean ports"
Write-Host "========================================"
Write-Host ""
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "Backend:  http://127.0.0.1:8001"
Write-Host "API Docs: http://127.0.0.1:8001/docs"
Write-Host ""
Write-Host "Re-run .\\start-services.bat anytime to force-kill prior session ports and restart cleanly."
