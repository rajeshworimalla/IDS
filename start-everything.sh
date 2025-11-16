#!/bin/bash

# IDS Project - Complete Startup Script
# Run this script to start everything in the correct order

echo "=== Starting IDS Project ==="
echo ""

# Step 1: Setup Firewall (create sets if they don't exist)
echo "1. Setting up firewall..."
sudo ipset -exist create ids_blocklist hash:ip family inet timeout 0
sudo ipset -exist create ids6_blocklist hash:ip family inet6 timeout 0

# Add iptables rules if they don't exist
sudo iptables -C INPUT -m set --match-set ids_blocklist src -j DROP 2>/dev/null || \
  sudo iptables -I INPUT -m set --match-set ids_blocklist src -j DROP

sudo iptables -C OUTPUT -m set --match-set ids_blocklist dst -j DROP 2>/dev/null || \
  sudo iptables -I OUTPUT -m set --match-set ids_blocklist dst -j DROP

sudo iptables -C FORWARD -m set --match-set ids_blocklist src -j DROP 2>/dev/null || \
  sudo iptables -I FORWARD -m set --match-set ids_blocklist src -j DROP

sudo iptables -C FORWARD -m set --match-set ids_blocklist dst -j DROP 2>/dev/null || \
  sudo iptables -I FORWARD -m set --match-set ids_blocklist dst -j DROP

echo "   ✅ Firewall setup complete"
echo ""

# Step 2: Check/Start MongoDB
echo "2. Checking MongoDB..."
if ps aux | grep -q "[m]ongod"; then
    echo "   ✅ MongoDB is already running"
else
    echo "   Starting MongoDB..."
    sudo mongod --fork --logpath /var/log/mongodb/mongod.log --dbpath /var/lib/mongodb
    echo "   ✅ MongoDB started"
fi
echo ""

# Step 3: Check/Start Redis
echo "3. Checking Redis..."
if ps aux | grep -q "[r]edis-server"; then
    echo "   ✅ Redis is already running"
else
    echo "   Starting Redis..."
    sudo service redis-server start
    echo "   ✅ Redis started"
fi
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Step 4: Start Backend (in background)
echo "4. Starting Backend..."
cd "$SCRIPT_DIR/backend" || exit 1

# Kill any existing backend process
pkill -f "node dist/index.js" >/dev/null 2>&1
sleep 1

# Build if needed
if [ ! -d "dist" ]; then
    echo "   Building backend..."
    npm run build
fi

# Start backend in background with increased memory
echo "   Starting backend server (with 4GB memory limit)..."
sudo node --max-old-space-size=4096 dist/index.js > /tmp/ids-backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

if ps -p $BACKEND_PID > /dev/null; then
    echo "   ✅ Backend started (PID: $BACKEND_PID)"
    echo "   Logs: tail -f /tmp/ids-backend.log"
else
    echo "   ❌ Backend failed to start. Check logs: cat /tmp/ids-backend.log"
fi
echo ""

# Step 5: Start Prediction Service (in background, optional)
echo "5. Starting Prediction Service..."
cd "$SCRIPT_DIR/backend" || exit 1

if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
    python3 prediction_service.py > /tmp/ids-prediction.log 2>&1 &
    PREDICTION_PID=$!
    sleep 2
    
    if ps -p $PREDICTION_PID > /dev/null 2>&1 || ps aux | grep -q "[p]rediction_service.py"; then
        echo "   ✅ Prediction service started (PID: $PREDICTION_PID)"
        echo "   Logs: tail -f /tmp/ids-prediction.log"
    else
        echo "   ⚠ Prediction service may not have started (check logs)"
    fi
    deactivate 2>/dev/null || true
else
    echo "   ⚠ Virtual environment not found, skipping prediction service"
    echo "   (Optional - Run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt)"
fi
echo ""

# Step 6: Start Frontend (Try Electron, fallback to Web)
echo "6. Starting Frontend..."
cd "$SCRIPT_DIR/frontend" || exit 1

# Kill any existing frontend/electron processes
pkill -f "vite" >/dev/null 2>&1
pkill -f "electron" >/dev/null 2>&1
sleep 1

# Check if DISPLAY is set (GUI available)
if [ -z "$DISPLAY" ]; then
    # Try to set DISPLAY if X11 is available
    export DISPLAY=:0
fi

# Try Electron first if DISPLAY is available
if [ ! -z "$DISPLAY" ] && command -v electron >/dev/null 2>&1; then
    echo "   Attempting to start Electron app..."
    export VITE_DEV_SERVER_URL=http://localhost:5173
    npm run electron:dev > /tmp/ids-frontend.log 2>&1 &
    FRONTEND_PID=$!
    sleep 8
    
    if ps aux | grep -q "[e]lectron" || ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo "   ✅ Electron app started (PID: $FRONTEND_PID)"
        echo "   Electron window should open on VM desktop"
        echo "   Logs: tail -f /tmp/ids-frontend.log"
    else
        echo "   ⚠ Electron failed, falling back to web server..."
        pkill -f "electron" >/dev/null 2>&1
        pkill -f "vite" >/dev/null 2>&1
        sleep 2
        npm run dev > /tmp/ids-frontend.log 2>&1 &
        FRONTEND_PID=$!
        sleep 5
        if ps -p $FRONTEND_PID > /dev/null || ps aux | grep -q "[v]ite"; then
            echo "   ✅ Web server started (PID: $FRONTEND_PID)"
            echo "   Access at: http://$VM_IP:5173"
        fi
    fi
else
    echo "   Starting web dev server (no GUI detected)..."
    npm run dev > /tmp/ids-frontend.log 2>&1 &
    FRONTEND_PID=$!
    sleep 5
    
    if ps -p $FRONTEND_PID > /dev/null || ps aux | grep -q "[v]ite"; then
        echo "   ✅ Web server started (PID: $FRONTEND_PID)"
        echo "   Access at: http://$VM_IP:5173 (check logs for actual port)"
        echo "   Logs: tail -f /tmp/ids-frontend.log"
    else
        echo "   ⚠ Frontend may not have started (check logs)"
    fi
fi
echo ""

# Step 7: Start Demo Site (in background)
echo "7. Starting Demo Site..."
cd "$SCRIPT_DIR/demo-site" || exit 1

# Kill any existing demo site server
pkill -f "python.*http.server.*8080" >/dev/null 2>&1
sleep 1

# Get VM IP address
VM_IP=$(hostname -I | awk '{print $1}')
DEMO_PORT=8080

echo "   Starting demo site HTTP server on port $DEMO_PORT..."
python3 -m http.server $DEMO_PORT > /tmp/ids-demo-site.log 2>&1 &
DEMO_PID=$!
sleep 2

if ps -p $DEMO_PID > /dev/null; then
    echo "   ✅ Demo site started (PID: $DEMO_PID)"
    echo "   Access at: http://$VM_IP:$DEMO_PORT"
    echo "   Logs: tail -f /tmp/ids-demo-site.log"
else
    echo "   ⚠ Demo site may not have started (check logs)"
fi
echo ""

# Summary
echo "=========================================="
echo "  IDS Project - All Services Started"
echo "=========================================="
echo ""
echo "Services:"
echo "  ✅ Backend:        http://$VM_IP:5001"
echo "  ✅ Frontend:       http://$VM_IP:5173 (check logs for actual port)"
echo "  ✅ Demo Site:      http://$VM_IP:$DEMO_PORT"
if [ -d "$SCRIPT_DIR/backend/venv/bin" ]; then
    echo "  ✅ Prediction:    Running (if started successfully)"
fi
echo ""
echo "Process IDs:"
echo "  Backend:    $BACKEND_PID"
echo "  Frontend:   $FRONTEND_PID"
echo "  Demo Site:  $DEMO_PID"
[ ! -z "$PREDICTION_PID" ] && echo "  Prediction: $PREDICTION_PID"
echo ""
echo "View logs:"
echo "  Backend:    tail -f /tmp/ids-backend.log"
echo "  Frontend:   tail -f /tmp/ids-frontend.log"
echo "  Demo Site:  tail -f /tmp/ids-demo-site.log"
[ ! -z "$PREDICTION_PID" ] && echo "  Prediction: tail -f /tmp/ids-prediction.log"
echo ""
echo "To stop all services: ./stop-demo.sh"
echo "=========================================="
echo ""
echo "Press Ctrl+C to exit (services will continue running in background)"
echo ""

# Keep script running so user can see output
tail -f /tmp/ids-backend.log /tmp/ids-frontend.log /tmp/ids-demo-site.log 2>/dev/null

