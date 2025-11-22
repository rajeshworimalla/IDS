#!/bin/bash
# Debug script for IDS startup issues

echo "=========================================="
echo "  IDS Startup Debug Script"
echo "=========================================="
echo ""

# Check MongoDB
echo "[1] Checking MongoDB..."
if command -v docker >/dev/null 2>&1; then
    echo "  ✓ Docker is installed"
    if sudo docker ps | grep -q mongodb; then
        echo "  ✓ MongoDB container is running"
        if python3 -c "from pymongo import MongoClient; MongoClient('mongodb://127.0.0.1:27017', serverSelectionTimeoutMS=2000).admin.command('ping')" 2>/dev/null; then
            echo "  ✓ MongoDB is responding"
        else
            echo "  ✗ MongoDB container running but not responding"
            echo "    Try: sudo docker logs mongodb"
        fi
    else
        echo "  ✗ MongoDB container not running"
        echo "    Try: sudo docker run -d -p 27017:27017 --name mongodb mongo:latest"
    fi
else
    echo "  ✗ Docker not installed"
    echo "    Install: sudo apt install -y docker.io"
fi
echo ""

# Check Redis
echo "[2] Checking Redis..."
if pgrep -x redis-server >/dev/null; then
    echo "  ✓ Redis is running"
    if redis-cli ping >/dev/null 2>&1; then
        echo "  ✓ Redis is responding"
    else
        echo "  ✗ Redis running but not responding"
    fi
else
    echo "  ✗ Redis not running"
    echo "    Start: sudo service redis-server start"
fi
echo ""

# Check Backend
echo "[3] Checking Backend..."
cd ~/Desktop/capstone/Firewall/IDS/backend 2>/dev/null || cd backend 2>/dev/null || { echo "  ✗ Cannot find backend directory"; exit 1; }
if [ -d "dist" ]; then
    echo "  ✓ Backend is built (dist/ exists)"
else
    echo "  ✗ Backend not built"
    echo "    Build: npm run build"
fi
if pgrep -f "node dist/index.js" >/dev/null; then
    echo "  ✓ Backend process is running"
    if curl -s http://localhost:5001 >/dev/null 2>&1; then
        echo "  ✓ Backend is responding on port 5001"
    else
        echo "  ✗ Backend running but not responding on port 5001"
        echo "    Check logs: tail -20 /tmp/ids-backend.log"
    fi
else
    echo "  ✗ Backend process not running"
    echo "    Check logs: cat /tmp/ids-backend.log"
fi
echo ""

# Check Prediction Service
echo "[4] Checking Prediction Service..."
if [ -d "venv/bin" ]; then
    echo "  ✓ Python venv exists"
    if pgrep -f "prediction_service.py" >/dev/null; then
        echo "  ✓ Prediction service process is running"
        if curl -s -X POST http://localhost:5002/predict -H "Content-Type: application/json" -d '{"test":1}' >/dev/null 2>&1; then
            echo "  ✓ Prediction service is responding on port 5002"
        else
            echo "  ✗ Prediction service running but not responding"
            echo "    Check logs: tail -20 /tmp/ids-prediction.log"
        fi
    else
        echo "  ✗ Prediction service not running"
        echo "    Check logs: cat /tmp/ids-prediction.log"
    fi
else
    echo "  ✗ Python venv not found"
    echo "    Create: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
fi
echo ""

# Check Frontend
echo "[5] Checking Frontend..."
cd ../frontend 2>/dev/null || { echo "  ✗ Cannot find frontend directory"; exit 1; }
if [ -d "node_modules" ]; then
    echo "  ✓ Frontend dependencies installed"
else
    echo "  ✗ Frontend dependencies not installed"
    echo "    Install: npm install"
fi
if pgrep -f "vite" >/dev/null; then
    echo "  ✓ Frontend (Vite) is running"
    if curl -s http://localhost:5173 >/dev/null 2>&1; then
        echo "  ✓ Frontend is responding on port 5173"
    else
        echo "  ✗ Frontend running but not responding"
    fi
else
    echo "  ✗ Frontend not running"
fi
echo ""

# Check Ports
echo "[6] Checking Ports..."
echo "  Port 27017 (MongoDB): $(sudo netstat -tlnp 2>/dev/null | grep :27017 || echo 'NOT LISTENING')"
echo "  Port 6379 (Redis): $(sudo netstat -tlnp 2>/dev/null | grep :6379 || echo 'NOT LISTENING')"
echo "  Port 5001 (Backend): $(sudo netstat -tlnp 2>/dev/null | grep :5001 || echo 'NOT LISTENING')"
echo "  Port 5002 (Prediction): $(sudo netstat -tlnp 2>/dev/null | grep :5002 || echo 'NOT LISTENING')"
echo "  Port 5173 (Frontend): $(sudo netstat -tlnp 2>/dev/null | grep :5173 || echo 'NOT LISTENING')"
echo ""

# Check Logs
echo "[7] Recent Errors in Logs..."
echo "  Backend errors:"
tail -5 /tmp/ids-backend.log 2>/dev/null | grep -i error || echo "    (no recent errors)"
echo "  Prediction errors:"
tail -5 /tmp/ids-prediction.log 2>/dev/null | grep -i error || echo "    (no recent errors)"
echo ""

echo "=========================================="
echo "  Debug Complete"
echo "=========================================="

