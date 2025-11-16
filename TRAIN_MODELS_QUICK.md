# Quick Fix: Train Models on VM

## The Problem
Ubuntu 22.04+ blocks system-wide pip installs. Use the virtual environment instead.

## Quick Solution (Copy-Paste These Commands)

```bash
# 1. Go to backend directory
cd ~/Desktop/capstone/Firewall/IDS/backend

# 2. Activate virtual environment (if it exists)
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "✅ Using virtual environment"
else
    echo "⚠️  Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install scikit-learn numpy pandas joblib
fi

# 3. Run training
python train_models.py

# 4. Deactivate when done
deactivate
```

## Alternative: If venv doesn't exist, create it first

```bash
cd ~/Desktop/capstone/Firewall/IDS/backend

# Create venv
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install packages
pip install --upgrade pip
pip install scikit-learn numpy pandas joblib

# Run training
python train_models.py

# Done!
deactivate
```

## After Training

Restart prediction service:
```bash
sudo pkill -f prediction_service.py
cd ~/Desktop/capstone/Firewall/IDS/backend
source venv/bin/activate
nohup python prediction_service.py > /tmp/ids-prediction.log 2>&1 &
disown
```

