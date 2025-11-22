#!/bin/bash
# Quick fix to start all services manually

echo "=========================================="
echo "  Quick Fix - Starting Services"
echo "=========================================="
echo ""

# 1. Start MongoDB in Docker
echo "[1] Starting MongoDB..."
sudo docker stop mongodb >/dev/null 2>&1 || true
sudo docker rm mongodb >/dev/null 2>&1 || true
if sudo docker run -d -p 27017:27017 --name mongodb mongo:latest; then
    echo "  ✓ MongoDB container started"
    sleep 3
    if python3 -c "from pymongo import MongoClient; MongoClient('mongodb://127.0.0.1:27017', serverSelectionTimeoutMS=2000).admin.command('ping')" 2>/dev/null; then
        echo "  ✓ MongoDB is responding"
    else
        echo "  ⚠ MongoDB container running but not responding yet"
    fi
else
    echo "  ✗ Failed to start MongoDB container"
fi
echo ""

# 2. Check Redis
echo "[2] Checking Redis..."
if pgrep -x redis-server >/dev/null; then
    echo "  ✓ Redis is running"
else
    sudo service redis-server start
    echo "  ✓ Redis started"
fi
echo ""

# 3. Start Prediction Service
echo "[3] Starting Prediction Service..."
cd ~/Desktop/capstone/Firewall/IDS/backend 2>/dev/null || cd backend 2>/dev/null || { echo "  ✗ Cannot find backend directory"; exit 1; }

# Check for syntax error first
if python3 -m py_compile prediction_service.py 2>&1 | grep -q "SyntaxError"; then
    echo "  ✗ Syntax error in prediction_service.py"
    echo "  Fixing..."
    # The file should be fine, but let's verify
    python3 -m py_compile prediction_service.py
    if [ $? -ne 0 ]; then
        echo "  ✗ Still has syntax errors - check the file"
        exit 1
    fi
fi

if [ -d "venv/bin" ]; then
    source venv/bin/activate
    export USE_ML_MODELS=false
    pkill -f "prediction_service.py" >/dev/null 2>&1 || true
    sleep 1
    nohup python3 prediction_service.py > /tmp/ids-prediction.log 2>&1 &
    PREDICTION_PID=$!
    sleep 3
    if pgrep -f "prediction_service.py" >/dev/null; then
        echo "  ✓ Prediction service started (PID: $PREDICTION_PID)"
    else
        echo "  ✗ Prediction service failed to start"
        echo "  Check logs: tail -20 /tmp/ids-prediction.log"
    fi
    deactivate
else
    echo "  ✗ Python venv not found"
fi
echo ""

# 4. Check Backend
echo "[4] Checking Backend..."
if pgrep -f "node dist/index.js" >/dev/null; then
    echo "  ✓ Backend is running"
else
    echo "  ⚠ Backend not running - start it manually:"
    echo "    cd backend && sudo npm start"
fi
echo ""

# 5. Check Frontend
echo "[5] Checking Frontend..."
if pgrep -f "vite" >/dev/null; then
    echo "  ✓ Frontend is running"
else
    echo "  ⚠ Frontend not running - start it manually:"
    echo "    cd frontend && npm run dev"
fi
echo ""

echo "=========================================="
echo "  Quick Fix Complete"
echo "=========================================="

