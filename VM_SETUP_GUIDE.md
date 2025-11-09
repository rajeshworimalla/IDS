# VM Setup Guide - Getting Python Prediction Working

This guide will help you set up the IDS project in your virtual machine, with special focus on getting the Python prediction service working.

## Prerequisites

- Linux VM (Ubuntu/Debian recommended)
- Python 3.8 or higher
- sudo/root access
- Network connectivity

## Step-by-Step Setup

### 1. Transfer Files to VM

First, copy your project to the VM. You can use:
- SCP: `scp -r IDS/ user@vm-ip:/home/user/`
- Shared folder (if using VirtualBox/VMware)
- Git clone (if using version control)

### 2. Install System Dependencies

```bash
# Update package list
sudo apt update

# Install Python and pip
sudo apt install -y python3 python3-pip python3-venv

# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
sudo apt install -y mongodb

# Install Redis
sudo apt install -y redis-server

# Install ipset (for firewall)
sudo apt install -y ipset

# Install build tools (may be needed for some Python packages)
sudo apt install -y build-essential python3-dev
```

### 3. Set Up Python Prediction Service

**This is the critical part!**

```bash
# Navigate to project directory
cd ~/IDS  # or wherever you copied the project

# Run the setup script
chmod +x setup-prediction-vm.sh
./setup-prediction-vm.sh
```

The setup script will:
- Check Python installation
- Verify model files exist
- Create virtual environment
- Install all Python dependencies
- Test model loading
- Verify service can start

**If setup fails**, manually do:

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install flask numpy pandas scikit-learn joblib requests

# Test model loading
python3 -c "
import joblib
binary_model = joblib.load('binary_attack_model.pkl')
multiclass_model = joblib.load('multiclass_attack_model.pkl')
print('Models loaded successfully!')
"
```

### 4. Test Prediction Service

```bash
# Make test script executable
chmod +x test-prediction.sh

# Run test
./test-prediction.sh
```

Or manually:

```bash
cd backend
source venv/bin/activate

# Start service
python3 prediction_service.py

# In another terminal, test it:
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

You should get a JSON response with predictions.

### 5. Install Node.js Dependencies

```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

### 6. Start Everything

```bash
# Make startup script executable
chmod +x start-demo.sh

# Start all services
./start-demo.sh
```

This will start:
- MongoDB
- Redis
- Backend server (Node.js)
- **Prediction service (Python)** - on port 5002
- Frontend (Electron or web)

### 7. Verify Everything is Running

```bash
# Check services
ps aux | grep -E "mongod|redis|node|python.*prediction"

# Check ports
netstat -tlnp | grep -E "27017|6379|5001|5002|5173"

# Test backend
curl http://localhost:5001/api/health

# Test prediction service
curl http://localhost:5002/predict -X POST \
  -H "Content-Type: application/json" \
  -d '{"packet": {"start_bytes": 100, "end_bytes": 200, "protocol": "TCP"}}'
```

## Troubleshooting

### Prediction Service Won't Start

**Error: "Module not found"**
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

**Error: "Model file not found"**
- Make sure `binary_attack_model.pkl` and `multiclass_attack_model.pkl` are in the `backend/` directory
- Check file permissions: `ls -la backend/*.pkl`

**Error: "Port 5002 already in use"**
```bash
# Find and kill process
sudo lsof -i :5002
sudo kill <PID>

# Or use different port (edit prediction_service.py)
```

**Error: "Permission denied"**
```bash
# Make sure you have execute permissions
chmod +x setup-prediction-vm.sh
chmod +x start-demo.sh
chmod +x test-prediction.sh
```

### Virtual Environment Issues

**venv not activating:**
```bash
# Make sure you're using bash (not sh)
bash
source venv/bin/activate

# Or use full path
source /full/path/to/backend/venv/bin/activate
```

**Python version mismatch:**
```bash
# Check Python version
python3 --version  # Should be 3.8+

# Recreate venv with specific Python
python3.8 -m venv venv  # or python3.9, python3.10, etc.
```

### Model Loading Errors

**"pickle.UnpicklingError" or "joblib load error":**
- Model files may be corrupted
- Try re-downloading or regenerating models
- Check file size: `ls -lh backend/*.pkl` (should be several MB)

**"AttributeError: predict method not found":**
- Models may be in wrong format
- Check model type: `python3 -c "import joblib; m=joblib.load('binary_attack_model.pkl'); print(type(m))"`

## Quick Verification Checklist

- [ ] Python 3.8+ installed
- [ ] Virtual environment created in `backend/venv/`
- [ ] All Python packages installed (`pip list` shows flask, numpy, pandas, scikit-learn, joblib)
- [ ] Model files exist (`ls backend/*.pkl`)
- [ ] Models can be loaded (run test script)
- [ ] Prediction service starts without errors
- [ ] Service responds to HTTP requests on port 5002
- [ ] Backend can connect to prediction service

## Next Steps

Once prediction service is working:
1. Run `./start-demo.sh` to start everything
2. Open the Electron app or web interface
3. Start packet capture
4. Verify predictions appear in the dashboard

## Getting Help

If you're still stuck:
1. Check logs: `tail -f /tmp/ids-prediction.log`
2. Run test script: `./test-prediction.sh`
3. Check Python environment: `cd backend && source venv/bin/activate && pip list`
4. Verify models: `cd backend && source venv/bin/activate && python3 -c "import joblib; print(joblib.load('binary_attack_model.pkl'))"`

