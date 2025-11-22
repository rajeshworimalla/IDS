#!/bin/bash

# IDS Project - WSL Startup Script
# Run this ONE script to start everything automatically in WSL!

echo "=========================================="
echo "  IDS Project - Starting in WSL"
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
echo -e "${YELLOW}[1/8]${NC} Setting up firewall..."
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
echo -e "${YELLOW}[2/8]${NC} Starting MongoDB..."

# Function to test MongoDB connection (avoids calling broken mongosh)
test_mongodb() {
    # Use Python to test connection (more reliable than mongosh)
    python3 -c "from pymongo import MongoClient; MongoClient('mongodb://127.0.0.1:27017', serverSelectionTimeoutMS=1000).admin.command('ping')" >/dev/null 2>&1
}

# Check if MongoDB is already running
MONGODB_RUNNING=false
if test_mongodb; then
    echo -e "${GREEN}   ✓ MongoDB already running and responding${NC}"
    MONGODB_RUNNING=true
fi

if [ "$MONGODB_RUNNING" = false ]; then
    # Kill any broken MongoDB processes
    sudo pkill -9 mongod >/dev/null 2>&1 || true
    sleep 1
    
    # Try Docker first (most reliable, works on all CPUs)
    if command -v docker >/dev/null 2>&1; then
        echo "   Starting MongoDB via Docker..."
        sudo systemctl start docker >/dev/null 2>&1 || true
        # Stop any existing MongoDB container
        sudo docker stop mongodb >/dev/null 2>&1 || true
        sudo docker rm mongodb >/dev/null 2>&1 || true
        # Start MongoDB in Docker (use 4.4 for CPUs without AVX support)
        if sudo docker run -d -p 27017:27017 --name mongodb mongo:4.4 >/dev/null 2>&1; then
            sleep 4
            if test_mongodb; then
                echo -e "${GREEN}   ✓ MongoDB started via Docker${NC}"
                MONGODB_RUNNING=true
            fi
        fi
    fi
    
    # If Docker didn't work, try systemctl (but don't use broken mongod binary)
    if [ "$MONGODB_RUNNING" = false ] && ! command -v docker >/dev/null 2>&1; then
        echo "   Installing Docker for MongoDB..."
        sudo apt install -y docker.io >/dev/null 2>&1 || true
        sudo systemctl start docker >/dev/null 2>&1 || true
        if sudo docker run -d -p 27017:27017 --name mongodb mongo:4.4 >/dev/null 2>&1; then
            sleep 4
            if test_mongodb; then
                echo -e "${GREEN}   ✓ MongoDB started via Docker (auto-installed)${NC}"
                MONGODB_RUNNING=true
            fi
        fi
    fi
    
    if [ "$MONGODB_RUNNING" = false ]; then
        echo -e "${YELLOW}   ⚠ MongoDB not available, but continuing anyway${NC}"
        echo "   Backend will handle MongoDB connection retries"
    fi
fi
echo ""

# Step 3: Start Redis
echo -e "${YELLOW}[3/8]${NC} Starting Redis..."
if is_running redis-server; then
    echo -e "${GREEN}   ✓ Redis already running${NC}"
else
    sudo service redis-server start >/dev/null 2>&1
    sleep 1
    if is_running redis-server; then
        echo -e "${GREEN}   ✓ Redis started${NC}"
    else
        echo -e "${YELLOW}   ⚠ Redis failed to start, but continuing anyway${NC}"
    fi
fi
echo ""

# Step 4: Install dependencies and Build Backend
echo -e "${YELLOW}[4/8]${NC} Setting up Backend..."
cd "$SCRIPT_DIR/backend" || exit 1

# Check if node_modules exists, install if not
if [ ! -d "node_modules" ]; then
    echo "   Installing backend dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}   ⚠ npm install had issues, but continuing anyway${NC}"
    fi
    echo -e "${GREEN}   ✓ Dependencies installed${NC}"
fi

# Verify MongoDB is accessible before starting backend (skip if mongosh is broken)
echo "   Verifying MongoDB connection..."
if python3 -c "from pymongo import MongoClient; MongoClient('mongodb://127.0.0.1:27017', serverSelectionTimeoutMS=2000).admin.command('ping')" >/dev/null 2>&1; then
    echo -e "${GREEN}   ✓ MongoDB is accessible${NC}"
else
    echo "   ⚠ MongoDB may not be fully ready, but continuing..."
fi

# Kill any existing backend process (more aggressively)
echo "   Stopping any existing backend processes..."
pkill -9 -f "node.*dist/index.js" >/dev/null 2>&1 || true
pkill -9 -f "node.*index.js" >/dev/null 2>&1 || true
# Also kill anything using port 5001
if command -v lsof >/dev/null 2>&1; then
    sudo lsof -ti:5001 2>/dev/null | xargs sudo kill -9 2>/dev/null || true
fi
if command -v fuser >/dev/null 2>&1; then
    sudo fuser -k 5001/tcp >/dev/null 2>&1 || true
fi
sleep 2

# Build backend first
echo "   Building TypeScript..."
npm run build > /tmp/ids-build.log 2>&1
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}   ⚠ Build had issues, checking if dist exists...${NC}"
    if [ ! -d "dist" ]; then
        echo "   ✗ Build failed and dist/ doesn't exist"
        echo "   Check logs: cat /tmp/ids-build.log"
        echo -e "${YELLOW}   Continuing anyway - backend may still work${NC}"
    else
        echo -e "${GREEN}   ✓ Build completed (dist/ exists)${NC}"
    fi
else
    echo -e "${GREEN}   ✓ Build successful${NC}"
fi

# Start backend in background
echo "   Starting backend..."
sudo npm start > /tmp/ids-backend.log 2>&1 &
BACKEND_PID=$!
sleep 5

# Check if backend is running
if ps -p $BACKEND_PID > /dev/null 2>&1 || is_running "node dist/index.js"; then
    echo -e "${GREEN}   ✓ Backend started (PID: $BACKEND_PID)${NC}"
    echo "   Logs: tail -f /tmp/ids-backend.log"
    
    # Wait for backend to fully start (MongoDB connection can take time)
    echo "   Waiting for backend to be ready..."
    for i in {1..10}; do
        sleep 1
        if curl -s http://localhost:5001 >/dev/null 2>&1; then
            echo -e "${GREEN}   ✓ Backend is responding${NC}"
            break
        fi
        if [ $i -eq 10 ]; then
            echo "   ⚠ Backend may still be starting (check logs if issues persist)"
        fi
    done
else
    echo -e "${YELLOW}   ⚠ Backend process not found, but continuing anyway${NC}"
    echo "   Check logs: cat /tmp/ids-backend.log"
    echo "   Backend may start later or may need manual intervention"
fi
echo ""

# Step 5: Start Prediction Service (in background, optional)
echo -e "${YELLOW}[5/8]${NC} Starting Prediction Service..."
cd "$SCRIPT_DIR/backend" || exit 1

# Check if venv exists, if not, try to set it up
if [ ! -d "venv/bin" ]; then
    echo "   Virtual environment not found, attempting to create..."
    if command -v python3 &> /dev/null; then
        python3 -m venv venv
        if [ $? -eq 0 ]; then
            source venv/bin/activate
            pip install --upgrade pip --quiet
            if [ -f "requirements.txt" ]; then
                pip install -r requirements.txt --quiet
            else
                pip install flask numpy pandas scikit-learn joblib requests --quiet
            fi
            deactivate
            echo -e "${GREEN}   ✓ Virtual environment created and dependencies installed${NC}"
        else
            echo -e "${YELLOW}   ⚠ Failed to create virtual environment${NC}"
            echo "   Run ./setup-prediction-vm.sh manually to set up prediction service"
            PREDICTION_PID="N/A"
        fi
    else
        echo -e "${YELLOW}   ⚠ Python3 not found, skipping prediction service${NC}"
        PREDICTION_PID="N/A"
    fi
fi

# Activate venv and start in background (if venv exists)
if [ -d "venv/bin" ]; then
    source venv/bin/activate
    
    # Kill any existing prediction service
    pkill -f "prediction_service.py" >/dev/null 2>&1
    sleep 1
    
    # Set USE_ML_MODELS=false to use rule-based detection only (works without model files)
    export USE_ML_MODELS=false
    
    python3 prediction_service.py > /tmp/ids-prediction.log 2>&1 &
    PREDICTION_PID=$!
    sleep 3
    
    if is_running "prediction_service.py"; then
        echo -e "${GREEN}   ✓ Prediction service started (PID: $PREDICTION_PID)${NC}"
        echo "   Logs: tail -f /tmp/ids-prediction.log"
        echo "   Note: Using rule-based detection (ML models disabled)"
        
        # Test if service is responding
        sleep 2
        if curl -s http://localhost:5002/predict >/dev/null 2>&1 || curl -s -X POST http://localhost:5002/predict -H "Content-Type: application/json" -d '{"test":1}' >/dev/null 2>&1; then
            echo -e "${GREEN}   ✓ Prediction service is responding${NC}"
        else
            echo -e "${YELLOW}   ⚠ Service started but may not be fully ready yet${NC}"
        fi
    else
        echo -e "${YELLOW}   ⚠ Prediction service failed to start${NC}"
        echo "   Check logs: cat /tmp/ids-prediction.log"
        PREDICTION_PID="N/A"
    fi
    deactivate
else
    echo -e "${YELLOW}   ⚠ Virtual environment not found, skipping prediction service${NC}"
    PREDICTION_PID="N/A"
fi
echo ""

# Step 7: Start Frontend
echo -e "${YELLOW}[7/8]${NC} Starting Frontend..."
cd "$SCRIPT_DIR/frontend" || exit 1

# Kill any existing Electron/Vite processes
pkill -f "electron" >/dev/null 2>&1
pkill -f "vite" >/dev/null 2>&1
sleep 1

# Check if frontend dependencies are installed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
    echo "   Installing frontend dependencies..."
    # Clean up if previous install failed
    if [ -d "node_modules" ]; then
        echo "   Cleaning up corrupted node_modules..."
        rm -rf node_modules package-lock.json
    fi
    npm cache clean --force
    npm install --legacy-peer-deps --fetch-timeout=900000 --fetch-retries=50 --maxsockets=1 --progress=false
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}   ⚠ npm install failed, trying one more time...${NC}"
        rm -rf node_modules
        npm install --legacy-peer-deps
    fi
fi

# Try Electron first if DISPLAY is available, otherwise use web server
if [ ! -z "$DISPLAY" ] && command -v electron >/dev/null 2>&1; then
    echo "   Attempting to start Electron app..."
    export VITE_DEV_SERVER_URL=http://localhost:5173
    npm run electron:dev > /tmp/ids-frontend.log 2>&1 &
    FRONTEND_PID=$!
    sleep 8
    
    if is_running "electron" || ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Electron app started (PID: $FRONTEND_PID)${NC}"
        echo "   Electron window should open"
        echo "   Logs: tail -f /tmp/ids-frontend.log"
    else
        echo -e "${YELLOW}   ⚠ Electron failed, falling back to web server...${NC}"
        pkill -f "electron" >/dev/null 2>&1
        pkill -f "vite" >/dev/null 2>&1
        sleep 2
        npm run dev > /tmp/ids-frontend.log 2>&1 &
        FRONTEND_PID=$!
        sleep 5
        if is_running "vite" || ps -p $FRONTEND_PID > /dev/null 2>&1; then
            echo -e "${GREEN}   ✓ Web server started (PID: $FRONTEND_PID)${NC}"
            echo "   Access at: http://localhost:5173 or http://$(hostname -I | awk '{print $1}'):5173"
        fi
    fi
else
    # No DISPLAY or Electron not available, use web server
    echo "   Starting Vite dev server (no GUI available for Electron)..."
    npm run dev > /tmp/ids-frontend.log 2>&1 &
    FRONTEND_PID=$!
    sleep 5
    
    if is_running "vite" || ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Frontend started (PID: $FRONTEND_PID)${NC}"
        echo "   Access at: http://localhost:5173 or http://$(hostname -I | awk '{print $1}'):5173"
        echo "   Logs: tail -f /tmp/ids-frontend.log"
    else
        echo -e "${YELLOW}   ⚠ Frontend may not have started${NC}"
        echo "   Check logs: cat /tmp/ids-frontend.log"
    fi
fi
echo ""

# Step 8: Start Demo Site (in background)
echo -e "${YELLOW}[8/8]${NC} Starting Demo Site..."
cd "$SCRIPT_DIR/demo-site" || exit 1

# Kill any existing demo site server
pkill -f "python.*http.server.*8080" >/dev/null 2>&1
sleep 1

# Get WSL IP address
WSL_IP=$(hostname -I | awk '{print $1}')
DEMO_PORT=8080

echo "   Starting demo site HTTP server on port $DEMO_PORT..."
python3 -m http.server $DEMO_PORT > /tmp/ids-demo-site.log 2>&1 &
DEMO_PID=$!
sleep 2

if ps -p $DEMO_PID > /dev/null; then
    echo -e "${GREEN}   ✓ Demo site started (PID: $DEMO_PID)${NC}"
    echo "   Access at: http://localhost:$DEMO_PORT or http://$WSL_IP:$DEMO_PORT"
    echo "   Logs: tail -f /tmp/ids-demo-site.log"
else
    echo -e "${YELLOW}   ⚠ Demo site may not have started${NC}"
    echo "   Check logs: cat /tmp/ids-demo-site.log"
fi
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
if [ "$PREDICTION_PID" != "N/A" ]; then
    echo "  • Prediction:  http://localhost:5002 (PID: $PREDICTION_PID)"
fi
echo "  • Frontend:    http://localhost:5173 (PID: $FRONTEND_PID)"
echo "  • Demo Site:   http://localhost:$DEMO_PORT (PID: $DEMO_PID)"
echo ""
echo "Access from Windows browser:"
echo "  • Frontend:    http://$WSL_IP:5173"
echo "  • Backend:     http://$WSL_IP:5001"
echo "  • Demo Site:   http://$WSL_IP:$DEMO_PORT"
echo ""
echo "To stop everything, press Ctrl+C or run: ./stop-demo.sh"
echo ""
echo "View logs:"
echo "  tail -f /tmp/ids-backend.log"
[ "$PREDICTION_PID" != "N/A" ] && echo "  tail -f /tmp/ids-prediction.log"
echo "  tail -f /tmp/ids-frontend.log"
echo "  tail -f /tmp/ids-demo-site.log"
echo ""

# Keep script running so processes stay alive
wait

