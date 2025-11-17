# How to Train New ML Models on Your VM

## Quick Steps

### 1. Pull Latest Code
```bash
cd ~/Desktop/capstone/Firewall/IDS
git pull origin main
```

### 2. Navigate to Backend
```bash
cd backend
```

### 3. Install Dependencies (if needed)
```bash
# Check if packages are installed
python3 -c "import sklearn, numpy, pandas, joblib"

# If error, install them:
pip3 install scikit-learn numpy pandas joblib
```

### 4. Make Script Executable
```bash
chmod +x train-models.sh
```

### 5. Run Training
```bash
# Option 1: Use the shell script (recommended)
./train-models.sh

# Option 2: Run Python script directly
python3 train_models.py
```

### 6. Wait for Training to Complete
The script will:
- Generate training data (takes ~30 seconds)
- Train binary model (takes ~1-2 minutes)
- Train multiclass model (takes ~1-2 minutes)
- Save new .pkl files

**Total time: ~3-5 minutes**

### 7. Restart Prediction Service
After training completes:

```bash
# Stop old prediction service
sudo pkill -f prediction_service.py

# Start new one (it will use the new models)
cd ~/Desktop/capstone/Firewall/IDS/backend
nohup python3 prediction_service.py > /tmp/ids-prediction.log 2>&1 &
disown

# Or restart everything
cd ~/Desktop/capstone/Firewall/IDS
./start-and-verify.sh
```

## What Gets Created

- `backend/binary_attack_model.pkl` - New binary model
- `backend/multiclass_attack_model.pkl` - New multiclass model
- `backend/*.pkl.backup` - Backups of old models (if they existed)

## Verify It Worked

```bash
# Check if new models exist
ls -lh backend/*.pkl

# Check prediction service is using them
tail -f /tmp/ids-prediction.log
# Should see: "Models loaded successfully with joblib"
```

## Troubleshooting

**"python3: command not found"**
```bash
sudo apt update
sudo apt install -y python3 python3-pip
```

**"ModuleNotFoundError: No module named 'sklearn'"**
```bash
pip3 install scikit-learn numpy pandas joblib
```

**"Permission denied"**
```bash
chmod +x train-models.sh
```

**Training takes too long?**
- The script generates 5400 samples and trains 2 models
- This is normal and takes 3-5 minutes
- Be patient!

## After Training

Your new models will:
- ✅ Detect DoS attacks better
- ✅ Detect Port Scans better  
- ✅ Detect Brute Force better
- ✅ Detect R2L and U2R attacks
- ✅ Work with your detector system (detectors still override when confident)

The models are trained on synthetic data that matches real attack patterns, so they should perform much better than the old models!

