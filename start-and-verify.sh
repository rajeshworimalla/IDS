#!/bin/bash

# IDS Project - Complete Startup Script with Verification
# This script actually starts everything AND verifies it's working

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to check if service is responding
check_service() {
    local url=$1
    local name=$2
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $name is responding${NC}"
            return 0
        fi
        echo -e "${YELLOW}⏳ Waiting for $name... (attempt $attempt/$max_attempts)${NC}"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ $name failed to respond after $max_attempts attempts${NC}"
    return 1
}

# Helper function to check if port is listening
check_port() {
    local port=$1
    local name=$2
    
    if ss -tlnp 2>/dev/null | grep -q ":$port " || netstat -tlnp 2>/dev/null | grep -q ":$port "; then
        echo -e "${GREEN}✅ Port $port ($name) is listening${NC}"
        return 0
    else
        echo -e "${RED}❌ Port $port ($name) is NOT listening${NC}"
        return 1
    fi
}

# Helper function to check if process is running
check_process() {
    local pattern=$1
    local name=$2
    
    # More flexible pattern matching - handle both with and without sudo
    if ps aux | grep -v grep | grep -E "$pattern" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $name process is running${NC}"
        return 0
    else
        echo -e "${RED}❌ $name process is NOT running${NC}"
        return 1
    fi
}

echo "=========================================="
echo "  IDS Project - Complete Startup"
echo "=========================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Step 1: Setup Firewall
echo "1. Setting up firewall..."
if command -v sudo >/dev/null 2>&1; then
    sudo ipset -exist create ids_blocklist hash:ip family inet timeout 0 2>/dev/null || true
    sudo ipset -exist create ids6_blocklist hash:ip family inet6 timeout 0 2>/dev/null || true
    echo -e "${GREEN}   ✅ Firewall setup complete${NC}"
else
    echo -e "${YELLOW}   ⚠ Skipping firewall setup (sudo not available)${NC}"
fi
echo ""

# Step 2: Start MongoDB
echo "2. Starting MongoDB..."
if ps aux | grep -q "[m]ongod"; then
    echo -e "${GREEN}   ✅ MongoDB is already running${NC}"
else
    echo "   Starting MongoDB..."
    if systemctl start mongod 2>/dev/null || sudo systemctl start mongod 2>/dev/null; then
        sleep 2
        if ps aux | grep -q "[m]ongod"; then
            echo -e "${GREEN}   ✅ MongoDB started${NC}"
        else
            echo -e "${YELLOW}   ⚠ MongoDB may not have started (check manually)${NC}"
        fi
    else
        # Try manual start
        mkdir -p ~/data/db 2>/dev/null
        mongod --fork --logpath /tmp/mongod.log --dbpath ~/data/db 2>/dev/null && \
            echo -e "${GREEN}   ✅ MongoDB started manually${NC}" || \
            echo -e "${RED}   ❌ MongoDB failed to start${NC}"
    fi
fi

# Verify MongoDB
sleep 1
if ps aux | grep -q "[m]ongod"; then
    echo -e "${GREEN}   ✅ MongoDB verified running${NC}"
else
    echo -e "${RED}   ❌ MongoDB is NOT running${NC}"
fi
echo ""

# Step 3: Start Redis
echo "3. Starting Redis..."
if ps aux | grep -q "[r]edis-server"; then
    echo -e "${GREEN}   ✅ Redis is already running${NC}"
else
    echo "   Starting Redis..."
    if systemctl start redis-server 2>/dev/null || sudo systemctl start redis-server 2>/dev/null; then
        sleep 1
    else
        redis-server --daemonize yes 2>/dev/null || true
        sleep 1
    fi
fi

# Verify Redis
if redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo -e "${GREEN}   ✅ Redis verified (responds to PING)${NC}"
else
    echo -e "${RED}   ❌ Redis is NOT responding${NC}"
fi
echo ""

# Step 4: Build and Start Backend
echo "4. Starting Backend..."
cd "$SCRIPT_DIR/backend" || exit 1

# Kill any existing backend more aggressively
echo "   Stopping any existing backend processes..."
pkill -9 -f "node dist/index.js" >/dev/null 2>&1 || true
sudo pkill -9 -f "node dist/index.js" >/dev/null 2>&1 || true
# Also kill anything using port 5001
sudo lsof -ti:5001 2>/dev/null | xargs sudo kill -9 2>/dev/null || true
sleep 2
echo ""  # Add blank line for cleaner output

# Build if needed
if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
    echo "   Building backend..."
    npm run build
    if [ ! -f "dist/index.js" ]; then
        echo -e "${RED}   ❌ Build failed${NC}"
        exit 1
    fi
    echo -e "${GREEN}   ✅ Build complete${NC}"
fi

# Start backend
echo "   Starting backend server..."
# Clear old log
> /tmp/ids-backend.log
if command -v sudo >/dev/null 2>&1; then
    # Use nohup to ensure process survives and redirect properly
    nohup sudo node --max-old-space-size=4096 dist/index.js > /tmp/ids-backend.log 2>&1 </dev/null &
else
    nohup node --max-old-space-size=4096 dist/index.js > /tmp/ids-backend.log 2>&1 </dev/null &
fi
# Note: $! might be sudo's PID, so we'll check by process pattern instead
sleep 4

# Check if process is running by pattern (more reliable than PID with sudo)
if ! ps aux | grep -v grep | grep -q "node.*dist/index.js"; then
    echo -e "${RED}   ❌ Backend process not found after startup${NC}"
    echo "   Last 20 lines of log:"
    tail -20 /tmp/ids-backend.log
    echo ""
    echo "   Checking if port 5001 is in use:"
    sudo lsof -i:5001 2>/dev/null || echo "   Port 5001 is free"
    echo ""
fi

# Wait a bit more for startup and check again
sleep 4

# Verify backend
echo "   Verifying backend..."
# Check by port first (most reliable indicator)
if check_port 5001 "Backend"; then
    if check_service "http://localhost:5001" "Backend API"; then
        echo -e "${GREEN}   ✅ Backend fully operational${NC}"
        VM_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
        echo -e "   🌐 Access at: http://$VM_IP:5001"
    else
        echo -e "${RED}   ❌ Backend not responding to HTTP requests${NC}"
        echo "   Check logs: tail -f /tmp/ids-backend.log"
    fi
else
    echo -e "${RED}   ❌ Backend failed to start (port 5001 not listening)${NC}"
    echo "   Last 30 lines of log:"
    tail -30 /tmp/ids-backend.log
    echo ""
    echo "   Full log: cat /tmp/ids-backend.log"
fi
echo ""

# Step 5: Start Prediction Service
echo "5. Starting Prediction Service..."
cd "$SCRIPT_DIR/backend" || exit 1

# Kill existing prediction service
pkill -f "prediction_service.py" >/dev/null 2>&1 || true
sleep 1

if [ -f "venv/bin/activate" ] && [ -f "binary_attack_model.pkl" ] && [ -f "multiclass_attack_model.pkl" ]; then
    source venv/bin/activate
    python3 prediction_service.py > /tmp/ids-prediction.log 2>&1 &
    PREDICTION_PID=$!
    deactivate 2>/dev/null || true
    sleep 3
    
    # Verify prediction service
    echo "   Verifying prediction service..."
    if check_process "prediction_service.py" "Prediction Service"; then
        if check_port 5002 "Prediction Service"; then
            # Test prediction endpoint
            if curl -s -X POST http://localhost:5002/predict \
                -H "Content-Type: application/json" \
                -d '{"packet": {"start_bytes": 100, "end_bytes": 200, "protocol": "TCP"}}' \
                > /dev/null 2>&1; then
                echo -e "${GREEN}   ✅ Prediction service fully operational${NC}"
            else
                echo -e "${YELLOW}   ⚠ Prediction service running but endpoint not responding${NC}"
            fi
        else
            echo -e "${YELLOW}   ⚠ Prediction service process running but port not listening${NC}"
        fi
    else
        echo -e "${RED}   ❌ Prediction service failed to start${NC}"
        echo "   Check logs: cat /tmp/ids-prediction.log"
    fi
else
    echo -e "${YELLOW}   ⚠ Skipping prediction service (venv or models not found)${NC}"
    PREDICTION_PID=""
fi
echo ""

# Step 6: Start Frontend
echo "6. Starting Frontend..."
cd "$SCRIPT_DIR/frontend" || exit 1

# Kill existing frontend
pkill -f "vite" >/dev/null 2>&1 || true
pkill -f "electron" >/dev/null 2>&1 || true
sleep 1

# Check if dependencies are installed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
    echo "   Installing frontend dependencies..."
    npm install > /tmp/ids-frontend-install.log 2>&1
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}   ⚠ npm install had issues, but continuing...${NC}"
    fi
fi

# Start frontend
echo "   Starting web dev server..."
nohup npm run dev > /tmp/ids-frontend.log 2>&1 </dev/null &
FRONTEND_PID=$!
sleep 8

# Verify frontend
echo "   Verifying frontend..."
if check_process "vite\|electron" "Frontend"; then
    if check_port 5173 "Frontend"; then
        if check_service "http://localhost:5173" "Frontend"; then
            echo -e "${GREEN}   ✅ Frontend fully operational${NC}"
            VM_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
            echo -e "   🌐 Access at: http://$VM_IP:5173"
        else
            echo -e "${YELLOW}   ⚠ Frontend port listening but not responding${NC}"
        fi
    else
        echo -e "${YELLOW}   ⚠ Frontend process running but port not listening${NC}"
    fi
else
    echo -e "${RED}   ❌ Frontend failed to start${NC}"
    echo "   Checking logs..."
    if [ -f /tmp/ids-frontend.log ]; then
        echo "   Last 20 lines of log:"
        tail -20 /tmp/ids-frontend.log
    else
        echo "   Log file not found. Check if npm run dev is working."
    fi
    echo ""
    echo "   Try manually: cd frontend && npm run dev"
fi
echo ""

# Step 7: Start Demo Site
echo "7. Starting Demo Site..."
cd "$SCRIPT_DIR/demo-site" || exit 1

# Kill existing demo site
pkill -f "python.*http.server.*8080" >/dev/null 2>&1 || true
sleep 1

# Start demo site
echo "   Starting demo site..."
nohup python3 -m http.server 8080 > /tmp/ids-demo-site.log 2>&1 </dev/null &
DEMO_PID=$!
sleep 2

# Verify demo site
echo "   Verifying demo site..."
if check_process "python.*http.server.*8080" "Demo Site"; then
    if check_port 8080 "Demo Site"; then
        if check_service "http://localhost:8080" "Demo Site"; then
            echo -e "${GREEN}   ✅ Demo site fully operational${NC}"
            VM_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
            echo -e "   🌐 Access at: http://$VM_IP:8080"
        else
            echo -e "${YELLOW}   ⚠ Demo site port listening but not responding${NC}"
        fi
    else
        echo -e "${YELLOW}   ⚠ Demo site process running but port not listening${NC}"
    fi
else
    echo -e "${RED}   ❌ Demo site failed to start${NC}"
fi
echo ""

# Get VM IP
VM_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")

# Final Summary
echo "=========================================="
echo "  Startup Complete - Verification Summary"
echo "=========================================="
echo ""

# Service Status
echo "Service Status:"
check_process "mongod" "MongoDB"
check_process "redis-server" "Redis"
# Check backend by port (more reliable than process name with sudo)
if check_port 5001 "Backend"; then
    echo -e "${GREEN}✅ Backend process is running (port 5001 listening)${NC}"
else
    echo -e "${RED}❌ Backend process is NOT running (port 5001 not listening)${NC}"
fi
[ ! -z "$PREDICTION_PID" ] && check_process "prediction_service.py" "Prediction Service"
check_process "vite\|electron" "Frontend"
check_process "python.*http.server.*8080" "Demo Site"
echo ""

# Port Status
echo "Port Status:"
check_port 27017 "MongoDB"
check_port 6379 "Redis"
check_port 5001 "Backend"
[ ! -z "$PREDICTION_PID" ] && check_port 5002 "Prediction Service"
check_port 5173 "Frontend"
check_port 8080 "Demo Site"
echo ""

# API Status
echo "API Status:"
if curl -s http://localhost:5001 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend API: http://$VM_IP:5001${NC}"
else
    echo -e "${RED}❌ Backend API: NOT responding${NC}"
fi

if [ ! -z "$PREDICTION_PID" ]; then
    if curl -s -X POST http://localhost:5002/predict -H "Content-Type: application/json" -d '{"test":1}' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Prediction API: http://$VM_IP:5002${NC}"
    else
        echo -e "${YELLOW}⚠ Prediction API: Running but may have issues${NC}"
    fi
fi

if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend: http://$VM_IP:5173${NC}"
else
    echo -e "${RED}❌ Frontend: NOT responding${NC}"
fi

if curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Demo Site: http://$VM_IP:8080${NC}"
else
    echo -e "${RED}❌ Demo Site: NOT responding${NC}"
fi
echo ""

# Process IDs
echo "Process IDs:"
ps aux | grep -E "node dist/index.js|prediction_service.py|vite|python.*http.server.*8080" | grep -v grep | awk '{print "  " $2 " - " $11 " " $12 " " $13}'
echo ""

# Access URLs
echo "Access URLs:"
echo "  📡 Backend API:    http://$VM_IP:5001"
echo "  🌐 Frontend:       http://$VM_IP:5173"
echo "  🧪 Demo Site:      http://$VM_IP:8080"
[ ! -z "$PREDICTION_PID" ] && echo "  🤖 Prediction API: http://$VM_IP:5002"
echo ""
echo "Quick Access (copy and paste in browser):"
echo "  Frontend:       http://$VM_IP:5173"
echo "  Demo Site:      http://$VM_IP:8080"
echo "  Backend API:    http://$VM_IP:5001"
echo ""

# Log locations
echo "Log Files:"
echo "  Backend:    tail -f /tmp/ids-backend.log"
[ ! -z "$PREDICTION_PID" ] && echo "  Prediction: tail -f /tmp/ids-prediction.log"
echo "  Frontend:   tail -f /tmp/ids-frontend.log"
echo "  Demo Site:  tail -f /tmp/ids-demo-site.log"
echo ""

echo "=========================================="
echo ""

# Check if everything is working
ALL_OK=true
if ! ps aux | grep -q "[m]ongod"; then ALL_OK=false; fi
if ! redis-cli ping 2>/dev/null | grep -q "PONG"; then ALL_OK=false; fi
if ! curl -s http://localhost:5001 > /dev/null 2>&1; then ALL_OK=false; fi
if ! curl -s http://localhost:5173 > /dev/null 2>&1; then ALL_OK=false; fi

if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}✅ All critical services are operational!${NC}"
    echo ""
    echo "You can now:"
    echo "  1. Open frontend: http://$VM_IP:5173"
    echo "  2. Create a user account or login"
    echo "  3. Start testing attacks from Kali VM"
else
    echo -e "${YELLOW}⚠ Some services may not be fully operational${NC}"
    echo "Check the logs above for details"
fi

echo ""

