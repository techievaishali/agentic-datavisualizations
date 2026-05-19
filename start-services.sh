#!/bin/bash
# Start Services Script for Agentic AI Data Visualization (Linux/macOS)
# This script kills any running services and restarts them fresh

NO_FRONTEND=false
NO_BACKEND=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-frontend)
            NO_FRONTEND=true
            shift
            ;;
        --no-backend)
            NO_BACKEND=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}======================================== ${NC}"
echo -e "${CYAN}Agentic AI Data Visualization - Service Restart ${NC}"
echo -e "${CYAN}======================================== ${NC}"
echo ""

# Function to kill process on a specific port
kill_process_on_port() {
    local port=$1
    local service_name=$2
    
    local pid=$(lsof -t -i :$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}Stopping $service_name (PID: $pid) on port $port...${NC}"
        kill -9 $pid 2>/dev/null
        sleep 1
        echo -e "${GREEN}✓ $service_name stopped${NC}"
    else
        echo -e "${CYAN}✓ No $service_name running on port $port${NC}"
    fi
}

# Kill existing services
echo ""
echo -e "${CYAN}Step 1: Stopping existing services...${NC}"
echo -e "${CYAN}---${NC}"

if [ "$NO_BACKEND" = false ]; then
    kill_process_on_port 8000 "Backend (Uvicorn)"
fi

if [ "$NO_FRONTEND" = false ]; then
    kill_process_on_port 5173 "Frontend (Vite)"
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start services
echo ""
echo -e "${CYAN}Step 2: Starting services...${NC}"
echo -e "${CYAN}---${NC}"

# Start Backend
if [ "$NO_BACKEND" = false ]; then
    echo ""
    echo -e "${CYAN}Starting Backend...${NC}"
    
    cd "$SCRIPT_DIR/backend"
    source .venv/bin/activate 2>/dev/null || python3 -m venv .venv && source .venv/bin/activate
    
    # Start in background
    PYTHONUNBUFFERED=1 uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
    BACKEND_PID=$!
    
    echo -e "${GREEN}✓ Backend started on http://127.0.0.1:8000 (PID: $BACKEND_PID)${NC}"
    echo -e "${CYAN}  Health check: GET http://127.0.0.1:8000/health${NC}"
fi

# Start Frontend
if [ "$NO_FRONTEND" = false ]; then
    echo ""
    echo -e "${CYAN}Starting Frontend...${NC}"
    
    cd "$SCRIPT_DIR/frontend"
    
    # Start in background
    npm run dev &
    FRONTEND_PID=$!
    
    echo -e "${GREEN}✓ Frontend started on http://127.0.0.1:5173 (PID: $FRONTEND_PID)${NC}"
fi

echo ""
echo -e "${CYAN}======================================== ${NC}"
echo -e "${GREEN}✓ All services started successfully!${NC}"
echo -e "${CYAN}======================================== ${NC}"
echo ""
echo -e "${CYAN}Access the application at:${NC}"
echo -e "${CYAN}  Frontend: http://127.0.0.1:5173${NC}"
echo -e "${CYAN}  Backend:  http://127.0.0.1:8000${NC}"
echo -e "${CYAN}  API Docs: http://127.0.0.1:8000/docs${NC}"
echo ""
echo -e "${YELLOW}To stop all services, run: pkill -f 'uvicorn|npm run dev'${NC}"
echo ""

# Keep the script running to show PIDs
if [ ! -z "$BACKEND_PID" ] || [ ! -z "$FRONTEND_PID" ]; then
    wait
fi
