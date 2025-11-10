# Quick Installation Guide

Since you already have the project cloned, just run this one command:

## 🚀 One-Command Installation

```bash
chmod +x install-all.sh
./install-all.sh
```

This script will:
- ✅ Install all system dependencies (Python, Node.js, MongoDB, **Redis**, etc.)
- ✅ Set up Python virtual environment and install ML dependencies
- ✅ Install backend Node.js dependencies
- ✅ Install frontend Node.js dependencies
- ✅ Configure firewall rules
- ✅ Start MongoDB and Redis services
- ✅ Verify everything is working

## 📋 What Gets Installed

1. **System Packages:**
   - Python 3 + pip + venv
   - Node.js 18.x
   - MongoDB
   - **Redis Server** (with auto-start)
   - ipset (for firewall)
   - Build tools

2. **Python Environment:**
   - Virtual environment in `backend/venv/`
   - All packages from `backend/requirements.txt`
   - ML model verification

3. **Node.js Dependencies:**
   - Backend: All packages from `backend/package.json`
   - Frontend: All packages from `frontend/package.json`
   - Backend TypeScript build

## 🔧 After Installation

### Start Everything:
```bash
./start-everything.sh
```

### Or Start Services Manually:

**Backend:**
```bash
cd backend
npm start
```

**Prediction Service:**
```bash
cd backend
source venv/bin/activate
python3 prediction_service.py
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## ✅ Verify Installation

```bash
# Check Redis
redis-cli ping
# Should return: PONG

# Check MongoDB
ps aux | grep mongod

# Check Python venv
ls backend/venv/bin/activate

# Check Node modules
ls backend/node_modules
ls frontend/node_modules
```

## 🐛 Troubleshooting

### Redis Not Starting?
```bash
# Check status
sudo systemctl status redis-server

# Start manually
sudo systemctl start redis-server

# Enable auto-start
sudo systemctl enable redis-server

# Check if it's listening
redis-cli ping
```

### Missing Dependencies?
```bash
# Re-run installation
./install-all.sh
```

### Port Already in Use?
```bash
# Find what's using the port
sudo lsof -i :6379  # Redis
sudo lsof -i :27017 # MongoDB
sudo lsof -i :5001  # Backend
sudo lsof -i :5002  # Prediction
sudo lsof -i :5173  # Frontend
```

## 📍 Service Ports

- **Backend:** http://localhost:5001
- **Prediction Service:** http://localhost:5002
- **Frontend:** http://localhost:5173
- **Redis:** localhost:6379
- **MongoDB:** localhost:27017

## 🎯 Quick Start After Installation

```bash
# 1. Start all services
./start-everything.sh

# 2. In another terminal, test Redis
redis-cli ping

# 3. Test backend
curl http://localhost:5001/api/health

# 4. Test prediction service
curl -X POST http://localhost:5002/predict \
  -H "Content-Type: application/json" \
  -d '{"packet": {"start_bytes": 100, "end_bytes": 200, "protocol": "TCP"}}'
```

That's it! 🎉

