#!/bin/bash

# IDS Project - Demo Mode Startup Script
# Run this ONE script to start everything automatically!

echo "=========================================="
echo "  IDS Project - Starting Demo Mode"
echo "=========================================="
echo ""

# Get script directory (works from anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a process is running
is_running() {
    ps aux | grep -v grep | grep -q "$1"
}

# Step 1: Setup Firewall
echo -e "${YELLOW}[1/6]${NC} Setting up firewall..."
sudo ipset -exist create ids_blocklist hash:ip family inet timeout 0 >/dev/null 2>&1
sudo ipset -exist create ids6_blocklist hash:ip family inet6 timeout 0 >/dev/null 2>&1

# Add iptables rules if they don't exist
sudo iptables -C INPUT -m set --match-set ids_blocklist src -j DROP >/dev/null 2>&1 || \
  sudo iptables -I INPUT -m set --match-set ids_blocklist src -j DROP >/dev/null 2>&1

sudo iptables -C OUTPUT -m set --match-set ids_blocklist dst -j DROP >/dev/null 2>&1 || \
  sudo iptables -I OUTPUT -m set --match-set ids_blocklist dst -j DROP >/dev/null 2>&1

sudo iptables -C FORWARD -m set --match-set ids_blocklist src -j DROP >/dev/null 2>&1 || \
  sudo iptables -I FORWARD -m set --match-set ids_blocklist src -j DROP >/dev/null 2>&1

sudo iptables -C FORWARD -m set --match-set ids_blocklist dst -j DROP >/dev/null 2>&1 || \
  sudo iptables -I FORWARD -m set --match-set ids_blocklist dst -j DROP >/dev/null 2>&1

echo -e "${GREEN}   ✓ Firewall ready${NC}"
echo ""

# Step 2: Start MongoDB
echo -e "${YELLOW}[2/6]${NC} Starting MongoDB..."

# Check if MongoDB is already running and accessible
MONGODB_RUNNING=false
if is_running mongod; then
    # Test if it's actually responding
    if mongosh mongodb://127.0.0.1:27017 --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1 || mongo mongodb://127.0.0.1:27017 --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1; then
        echo -e "${GREEN}   ✓ MongoDB already running and responding${NC}"
        MONGODB_RUNNING=true
    else
        echo "   ⚠ MongoDB process found but not responding, restarting..."
        sudo pkill mongod >/dev/null 2>&1
        sleep 2
    fi
fi

if [ "$MONGODB_RUNNING" = false ]; then
    # Ensure directories exist
    sudo mkdir -p /var/log/mongodb /var/lib/mongodb >/dev/null 2>&1
    sudo chown -R mongodb:mongodb /var/log/mongodb /var/lib/mongodb >/dev/null 2>&1 || true
    
    # Start MongoDB
    echo "   Starting MongoDB..."
    sudo mongod --fork --logpath /var/log/mongodb/mongod.log --dbpath /var/lib/mongodb >/dev/null 2>&1
    sleep 4
    
    # Check if MongoDB is actually running and responding
    if is_running mongod; then
        # Test connection with retries
        for i in {1..5}; do
            sleep 1
            if mongosh mongodb://127.0.0.1:27017 --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1 || mongo mongodb://127.0.0.1:27017 --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1; then
                echo -e "${GREEN}   ✓ MongoDB started and responding${NC}"
                MONGODB_RUNNING=true
                break
            fi
        done
        
        if [ "$MONGODB_RUNNING" = false ]; then
            echo "   ⚠ MongoDB started but not responding yet (may need more time)"
        fi
    else
        echo "   ✗ MongoDB failed to start"
        echo "   Check logs: sudo tail -20 /var/log/mongodb/mongod.log"
        exit 1
    fi
fi
echo ""

# Step 3: Start Redis
echo -e "${YELLOW}[3/6]${NC} Starting Redis..."
if is_running redis-server; then
    echo -e "${GREEN}   ✓ Redis already running${NC}"
else
    sudo service redis-server start >/dev/null 2>&1
    sleep 1
    if is_running redis-server; then
        echo -e "${GREEN}   ✓ Redis started${NC}"
    else
        echo "   ✗ Redis failed to start"
        exit 1
    fi
fi
echo ""

# Step 4: Build and Start Backend (in background)
echo -e "${YELLOW}[4/6]${NC} Building and Starting Backend Server..."
cd "$SCRIPT_DIR/backend" || exit 1

# Verify MongoDB is accessible before starting backend
echo "   Verifying MongoDB connection..."
if mongosh mongodb://127.0.0.1:27017 --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1 || mongo mongodb://127.0.0.1:27017 --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1; then
    echo -e "${GREEN}   ✓ MongoDB is accessible${NC}"
else
    echo "   ⚠ MongoDB may not be fully ready, but continuing..."
fi

# Kill any existing backend process
pkill -f "node dist/index.js" >/dev/null 2>&1
sleep 1

# Build backend first
echo "   Building TypeScript..."
npm run build > /tmp/ids-build.log 2>&1
if [ $? -ne 0 ]; then
    echo "   ✗ Build failed"
    echo "   Check logs: cat /tmp/ids-build.log"
    exit 1
fi
echo -e "${GREEN}   ✓ Build successful${NC}"

# Start backend in background
echo "   Starting backend..."
sudo npm start > /tmp/ids-backend.log 2>&1 &
BACKEND_PID=$!
sleep 5

# Check if backend is running
if ps -p $BACKEND_PID > /dev/null 2>&1 || is_running "node dist/index.js"; then
    echo -e "${GREEN}   ✓ Backend started (PID: $BACKEND_PID)${NC}"
    echo "   Logs: tail -f /tmp/ids-backend.log"
    
    # Wait a bit more and check if backend is responding
    sleep 3
    if curl -s http://localhost:5001/api/health >/dev/null 2>&1 || curl -s http://localhost:5001 >/dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Backend is responding${NC}"
    else
        echo "   ⚠ Backend may still be starting..."
    fi
else
    echo "   ✗ Backend failed to start"
    echo "   Check logs: cat /tmp/ids-backend.log"
    exit 1
fi
echo ""

# Step 5: Start Prediction Service (in background, optional)
echo -e "${YELLOW}[5/6]${NC} Starting Prediction Service..."
cd "$SCRIPT_DIR/backend" || exit 1

# Activate venv and start in background (if venv exists)
if [ -d "venv/bin" ]; then
    source venv/bin/activate
    python3 prediction_service.py > /tmp/ids-prediction.log 2>&1 &
    PREDICTION_PID=$!
    sleep 2
    
    if is_running "prediction_service.py"; then
        echo -e "${GREEN}   ✓ Prediction service started (PID: $PREDICTION_PID)${NC}"
        echo "   Logs: tail -f /tmp/ids-prediction.log"
    else
        echo -e "${YELLOW}   ⚠ Prediction service not started (optional)${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠ Virtual environment not found, skipping prediction service${NC}"
    PREDICTION_PID="N/A"
fi
echo ""

# Step 6: Start Frontend/Electron
echo -e "${YELLOW}[6/6]${NC} Starting Electron App..."
cd "$SCRIPT_DIR/frontend" || exit 1

# Kill any existing Electron/Vite processes
pkill -f "electron" >/dev/null 2>&1
pkill -f "vite" >/dev/null 2>&1
sleep 1

# Start Electron (this will open the window)
npm run electron:dev > /tmp/ids-frontend.log 2>&1 &
FRONTEND_PID=$!

echo -e "${GREEN}   ✓ Electron starting...${NC}"
echo ""

# Wait a moment for everything to initialize
sleep 3

echo "=========================================="
echo -e "${GREEN}  ✓ All services started!${NC}"
echo "=========================================="
echo ""
echo "Services running:"
echo "  • MongoDB:     Running"
echo "  • Redis:       Running"
echo "  • Backend:     http://localhost:5001 (PID: $BACKEND_PID)"
echo "  • Prediction:  http://localhost:5002 (PID: $PREDICTION_PID)"
echo "  • Frontend:    http://localhost:5173 (PID: $FRONTEND_PID)"
echo ""
echo "Electron window should open automatically!"
echo ""
echo -e "${YELLOW}⚠ IMPORTANT: Start Demo Site in Windows PowerShell${NC}"
echo ""
echo "Open a NEW Windows PowerShell window and run:"
echo "  cd C:\\Users\\rajes\\OneDrive\\Desktop\\Academics\\Projects\\Capstone\\IDS"
echo "  python -m http.server 8080 --bind 172.22.208.1 --directory demo-site"
echo ""
echo "Then access demo site at: http://172.22.208.1:8080"
echo ""
echo "To stop everything, press Ctrl+C or run: ./stop-demo.sh"
echo ""
echo "View logs:"
echo "  tail -f /tmp/ids-backend.log"
echo "  tail -f /tmp/ids-prediction.log"
echo "  tail -f /tmp/ids-frontend.log"
echo ""

# Keep script running so processes stay alive
wait

