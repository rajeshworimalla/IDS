# VM Quick Start - Python Prediction Service

## 🚀 Fast Setup (Copy-Paste These Commands)

### 1. Initial Setup (One-time)
```bash
# Install system dependencies
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs mongodb redis-server ipset build-essential python3-dev

# Navigate to project
cd ~/IDS  # or your project path

# Set up prediction service
chmod +x setup-prediction-vm.sh
./setup-prediction-vm.sh
```

### 2. Start Everything
```bash
chmod +x start-demo.sh
./start-demo.sh
```

### 3. Test Prediction Service
```bash
chmod +x test-prediction.sh
./test-prediction.sh
```

## 🔧 Manual Commands (If Scripts Don't Work)

### Set up Python environment manually:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Start prediction service manually:
```bash
cd backend
source venv/bin/activate
python3 prediction_service.py
```

### Test prediction service:
```bash
curl -X POST http://localhost:5002/predict \
  -H "Content-Type: application/json" \
  -d '{
    "packet": {
      "start_bytes": 100,
      "end_bytes": 200,
      "protocol": "TCP",
      "description": "192.168.1.1 -> 80",
      "frequency": 10
    }
  }'
```

## ✅ Verification Checklist

```bash
# Check Python
python3 --version  # Should be 3.8+

# Check venv exists
ls backend/venv/bin/activate

# Check models exist
ls backend/*.pkl

# Check packages installed
cd backend && source venv/bin/activate && pip list | grep -E "flask|numpy|pandas|scikit|joblib"

# Check service running
ps aux | grep prediction_service

# Check port
netstat -tlnp | grep 5002

# Test endpoint
curl http://localhost:5002/predict
```

## 🐛 Quick Fixes

**Service won't start?**
```bash
cd backend
source venv/bin/activate
python3 prediction_service.py
# Look for error messages
```

**Missing packages?**
```bash
cd backend
source venv/bin/activate
pip install flask numpy pandas scikit-learn joblib requests
```

**Port in use?**
```bash
sudo lsof -i :5002
sudo kill <PID>
```

**Models not loading?**
```bash
cd backend
source venv/bin/activate
python3 -c "import joblib; print(joblib.load('binary_attack_model.pkl'))"
```

## 📝 Key Files

- `setup-prediction-vm.sh` - Sets up Python environment
- `test-prediction.sh` - Tests prediction service
- `start-demo.sh` - Starts all services
- `backend/prediction_service.py` - Prediction service code
- `backend/requirements.txt` - Python dependencies
- `backend/*.pkl` - ML model files

## 📍 Service URLs

- Backend: http://localhost:5001
- Prediction: http://localhost:5002
- Frontend: http://localhost:5173

## 🔍 View Logs

```bash
# Prediction service logs
tail -f /tmp/ids-prediction.log

# Backend logs
tail -f /tmp/ids-backend.log

# All logs
tail -f /tmp/ids-*.log
```

