# Start Services Script for Agentic AI Data Visualization

Write-Host "========================================"
Write-Host "Starting Agentic AI Data Visualization"
Write-Host "========================================"

# Kill existing processes
Write-Host ""
Write-Host "Stopping existing services..."
Get-Process | Where-Object { $_.Port -eq 8000 -or $_.Port -eq 5173 } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Start Backend
Write-Host "Starting Backend on port 8000..."
$backendCmd = "cd backend; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal

# Start Frontend
Write-Host "Starting Frontend on port 5173..."
$frontendCmd = "cd frontend; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal

Write-Host ""
Write-Host "========================================"
Write-Host "Services started!"
Write-Host "========================================"
Write-Host ""
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "Backend:  http://127.0.0.1:8000"
Write-Host "API Docs: http://127.0.0.1:8000/docs"
Write-Host ""
Write-Host "Close terminal windows to stop services."
