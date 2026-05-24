# Start Services Script for Agentic AI Data Visualization

Write-Host "========================================"
Write-Host "Starting Agentic AI Data Visualization"
Write-Host "========================================"

# Kill existing processes
Write-Host ""
Write-Host "Stopping existing services..."

function Stop-ProcessOnPort {
	param(
		[Parameter(Mandatory = $true)]
		[int]$Port
	)

	$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
	foreach ($procId in $connections) {
		if ($procId -and $procId -ne $PID) {
			Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
		}
	}
}

Stop-ProcessOnPort -Port 8000
Stop-ProcessOnPort -Port 8001
Stop-ProcessOnPort -Port 5173

# Start Backend
Write-Host "Starting Backend on port 8001..."
$backendCmd = "cd backend; ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal

# Start Frontend
Write-Host "Starting Frontend on port 5173..."
$frontendCmd = "cd frontend; `$env:VITE_API_PROXY_TARGET='http://127.0.0.1:8001'; npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal

Write-Host ""
Write-Host "========================================"
Write-Host "Services started!"
Write-Host "========================================"
Write-Host ""
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "Backend:  http://127.0.0.1:8001"
Write-Host "API Docs: http://127.0.0.1:8001/docs"
Write-Host ""
Write-Host "Close terminal windows to stop services."
