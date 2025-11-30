#!/bin/bash

# IDS Complete Restart Script
# Verifies, kills, and restarts ALL services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LOG_FILE="/tmp/ids-backend.log"

echo "========================================="
echo "IDS Complete Restart Script"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Kill all IDS processes
echo -e "${YELLOW}[1/6]${NC} Stopping all IDS processes..."

# Kill backend
if pgrep -f "node dist/index.js" >/dev/null 2>&1; then
    echo "   Stopping backend..."
    sudo pkill -f "node dist/index.js" || true
    sleep 2
    sudo pkill -9 -f "node dist/index.js" || true
    echo -e "${GREEN}   ✓ Backend stopped${NC}"
fi

# Kill frontend/electron
if pgrep -f "vite" >/dev/null 2>&1; then
    echo "   Stopping frontend..."
    pkill -f "vite" || true
    pkill -f "electron" || true
    sleep 1
    echo -e "${GREEN}   ✓ Frontend stopped${NC}"
fi

# Kill prediction service
if pgrep -f "prediction_service.py" >/dev/null 2>&1; then
    echo "   Stopping prediction service..."
    pkill -f "prediction_service.py" || true
    sleep 1
    echo -e "${GREEN}   ✓ Prediction service stopped${NC}"
fi

# Kill demo site
if pgrep -f "demo-site" >/dev/null 2>&1; then
    echo "   Stopping demo site..."
    pkill -f "demo-site" || true
    sleep 1
    echo -e "${GREEN}   ✓ Demo site stopped${NC}"
fi

# Free up ports
echo "   Freeing ports..."
sudo lsof -ti :5001 | xargs sudo kill -9 2>/dev/null || true
sudo lsof -ti :5173 | xargs sudo kill -9 2>/dev/null || true
sudo lsof -ti :3000 | xargs sudo kill -9 2>/dev/null || true
sleep 1
echo -e "${GREEN}   ✓ Ports freed${NC}"
echo ""

# Step 2: Verify MongoDB
echo -e "${YELLOW}[2/6]${NC} Verifying MongoDB..."
MONGODB_RUNNING=false

# Check if system MongoDB is running
if pgrep -x mongod >/dev/null 2>&1; then
    if timeout 3 nc -zv 127.0.0.1 27017 >/dev/null 2>&1; then
        echo -e "${GREEN}   ✓ System MongoDB is running${NC}"
        MONGODB_RUNNING=true
    fi
fi

# Check Docker MongoDB
if [ "$MONGODB_RUNNING" = false ]; then
    if sudo docker ps | grep -q mongodb; then
        if timeout 3 nc -zv 127.0.0.1 27017 >/dev/null 2>&1; then
            echo -e "${GREEN}   ✓ Docker MongoDB is running${NC}"
            MONGODB_RUNNING=true
        fi
    fi
fi

if [ "$MONGODB_RUNNING" = false ]; then
    echo "   ⚠ MongoDB not running - starting Docker MongoDB..."
    sudo docker stop mongodb >/dev/null 2>&1 || true
    sudo docker rm mongodb >/dev/null 2>&1 || true
    
    # Start MongoDB with proper binding
    echo "   Starting MongoDB container..."
    sudo docker run -d -p 0.0.0.0:27017:27017 --name mongodb mongo:4.4 >/dev/null 2>&1
    
    # Wait and verify with retries
    echo "   Waiting for MongoDB to be ready..."
    for i in {1..15}; do
        sleep 2
        # Test from inside container first
        if sudo docker exec mongodb mongo --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1; then
            # Then test from host
            if timeout 3 nc -zv 127.0.0.1 27017 >/dev/null 2>&1; then
                echo -e "${GREEN}   ✓ Docker MongoDB started and responding${NC}"
                MONGODB_RUNNING=true
                break
            fi
        fi
        if [ $i -eq 15 ]; then
            echo -e "${RED}   ✗ MongoDB failed to start after 30 seconds${NC}"
            echo "   Check logs: sudo docker logs mongodb"
            echo "   Trying to continue anyway..."
        fi
    done
fi
echo ""

# Step 3: Verify Redis
echo -e "${YELLOW}[3/6]${NC} Verifying Redis..."
REDIS_RUNNING=false

# Check system Redis
if pgrep -x redis-server >/dev/null 2>&1; then
    if redis-cli ping >/dev/null 2>&1; then
        echo -e "${GREEN}   ✓ System Redis is running${NC}"
        REDIS_RUNNING=true
    fi
fi

# Check Docker Redis
if [ "$REDIS_RUNNING" = false ]; then
    if sudo docker ps | grep -q redis; then
        if timeout 3 nc -zv 127.0.0.1 6379 >/dev/null 2>&1; then
            echo -e "${GREEN}   ✓ Docker Redis is running${NC}"
            REDIS_RUNNING=true
        fi
    fi
fi

if [ "$REDIS_RUNNING" = false ]; then
    echo "   ⚠ Redis not running - starting Docker Redis..."
    sudo docker stop redis >/dev/null 2>&1 || true
    sudo docker rm redis >/dev/null 2>&1 || true
    sudo docker run -d -p 0.0.0.0:6379:6379 --name redis redis:latest >/dev/null 2>&1
    sleep 3
    if timeout 3 nc -zv 127.0.0.1 6379 >/dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Docker Redis started${NC}"
        REDIS_RUNNING=true
    else
        echo "   ⚠ Redis may still be starting"
    fi
fi
echo ""

# Step 4: Build and start backend
echo -e "${YELLOW}[4/6]${NC} Building and starting backend..."
cd "$BACKEND_DIR" || exit 1

if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies..."
    npm install
fi

echo "   Building TypeScript..."
npm run build > /tmp/ids-build.log 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}   ✗ Build failed! Check: cat /tmp/ids-build.log${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ Build successful${NC}"

echo "   Starting backend..."
sudo npm start > "$LOG_FILE" 2>&1 &
BACKEND_PID=$!
sleep 5

if ps -p $BACKEND_PID > /dev/null 2>&1 || pgrep -f "node dist/index.js" >/dev/null 2>&1; then
    echo -e "${GREEN}   ✓ Backend started${NC}"
    
    # Wait for backend to be ready
    for i in {1..10}; do
        sleep 1
        if curl -s http://localhost:5001 >/dev/null 2>&1; then
            echo -e "${GREEN}   ✓ Backend is responding${NC}"
            break
        fi
    done
else
    echo -e "${RED}   ✗ Backend failed to start${NC}"
    echo "   Check logs: cat $LOG_FILE"
    exit 1
fi
echo ""

# Step 5: Start prediction service (optional)
echo -e "${YELLOW}[5/6]${NC} Starting prediction service..."
if [ -f "$BACKEND_DIR/venv/bin/activate" ]; then
    cd "$BACKEND_DIR" || exit 1
    source venv/bin/activate
    python3 prediction_service.py > /tmp/ids-prediction.log 2>&1 &
    PREDICTION_PID=$!
    sleep 2
    if ps -p $PREDICTION_PID > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Prediction service started${NC}"
    else
        echo "   ⚠ Prediction service may not have started"
    fi
    deactivate 2>/dev/null || true
else
    echo "   ⚠ Virtual environment not found, skipping"
fi
echo ""

# Step 6: Start frontend
echo -e "${YELLOW}[6/6]${NC} Starting frontend..."
cd "$FRONTEND_DIR" || exit 1

if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies..."
    npm install
fi

echo "   Starting frontend..."
npm run dev > /tmp/ids-frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 3

if ps -p $FRONTEND_PID > /dev/null 2>&1 || pgrep -f "vite" >/dev/null 2>&1; then
    echo -e "${GREEN}   ✓ Frontend started${NC}"
    
    # Get WSL IP if in WSL
    if [ -n "$WSL_DISTRO_NAME" ]; then
        WSL_IP=$(hostname -I | awk '{print $1}')
        echo "   Frontend URL: http://$WSL_IP:5173"
    else
        echo "   Frontend URL: http://localhost:5173"
    fi
else
    echo "   ⚠ Frontend may not have started"
fi
echo ""

echo "========================================="
echo -e "${GREEN}✓ All services restarted!${NC}"
echo "========================================="
echo "Backend logs: tail -f $LOG_FILE"
echo "Frontend logs: tail -f /tmp/ids-frontend.log"
echo ""

