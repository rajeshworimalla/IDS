#!/bin/bash

# IDS Backend Restart Script
# Verifies, kills, and restarts the backend service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
LOG_FILE="/tmp/ids-backend.log"

echo "========================================="
echo "IDS Backend Restart Script"
echo "========================================="
echo ""

# Step 1: Check if backend is running
echo "[1/4] Checking if backend is running..."
BACKEND_PID=$(pgrep -f "node dist/index.js" || true)

if [ -n "$BACKEND_PID" ]; then
    echo "   ✓ Found backend process (PID: $BACKEND_PID)"
    echo "[2/4] Stopping backend..."
    sudo pkill -f "node dist/index.js" || true
    sleep 2
    
    # Verify it's stopped
    if pgrep -f "node dist/index.js" >/dev/null 2>&1; then
        echo "   ⚠ Backend still running, force killing..."
        sudo pkill -9 -f "node dist/index.js" || true
        sleep 1
    fi
    echo "   ✓ Backend stopped"
else
    echo "   ✓ No backend process found (already stopped)"
fi
echo ""

# Step 2: Verify port 5001 is free
echo "[3/4] Verifying port 5001 is free..."
if lsof -i :5001 >/dev/null 2>&1; then
    echo "   ⚠ Port 5001 still in use, killing process..."
    sudo lsof -ti :5001 | xargs sudo kill -9 2>/dev/null || true
    sleep 1
fi
echo "   ✓ Port 5001 is free"
echo ""

# Step 3: Build backend
echo "[4/4] Building backend..."
cd "$BACKEND_DIR" || exit 1

if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies..."
    npm install
fi

echo "   Building TypeScript..."
npm run build > /tmp/ids-build.log 2>&1
if [ $? -ne 0 ]; then
    echo "   ✗ Build failed! Check: cat /tmp/ids-build.log"
    exit 1
fi
echo "   ✓ Build successful"
echo ""

# Step 4: Start backend
echo "[5/5] Starting backend..."
sudo npm start > "$LOG_FILE" 2>&1 &
BACKEND_PID=$!
sleep 3

# Verify it started
if ps -p $BACKEND_PID > /dev/null 2>&1 || pgrep -f "node dist/index.js" >/dev/null 2>&1; then
    echo "   ✓ Backend started (PID: $BACKEND_PID)"
    
    # Wait for backend to be ready
    echo "   Waiting for backend to be ready..."
    for i in {1..10}; do
        sleep 1
        if curl -s http://localhost:5001/api/health >/dev/null 2>&1 || curl -s http://localhost:5001 >/dev/null 2>&1; then
            echo "   ✓ Backend is responding"
            break
        fi
        if [ $i -eq 10 ]; then
            echo "   ⚠ Backend may still be starting (check logs if issues persist)"
        fi
    done
    echo ""
    echo "========================================="
    echo "✓ Backend restarted successfully!"
    echo "========================================="
    echo "Logs: tail -f $LOG_FILE"
    echo "PID: $BACKEND_PID"
else
    echo "   ✗ Backend failed to start!"
    echo "   Check logs: cat $LOG_FILE"
    exit 1
fi

