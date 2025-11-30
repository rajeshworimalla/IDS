# Troubleshooting IDS Startup

## If restart-all.sh stops during build:

### 1. Check the build log:
```bash
cat /tmp/ids-build.log
```

### 2. Check if backend is running:
```bash
ps aux | grep "node dist/index.js"
```

### 3. Try building manually:
```bash
cd ~/Desktop/capstone/Firewall/IDS/backend
npm run build
```

### 4. Check for errors:
```bash
cd ~/Desktop/capstone/Firewall/IDS/backend
npm install  # Make sure dependencies are installed
npm run build
```

### 5. Start services manually if build succeeds:

**Backend:**
```bash
cd ~/Desktop/capstone/Firewall/IDS/backend
sudo npm start
```

**In another terminal - Prediction Service:**
```bash
cd ~/Desktop/capstone/Firewall/IDS/backend
source venv/bin/activate  # If venv exists
python3 prediction_service.py
```

**In another terminal - Frontend:**
```bash
cd ~/Desktop/capstone/Firewall/IDS/frontend
npm run dev
```

### 6. Check what's actually running:
```bash
# Check all IDS-related processes
ps aux | grep -E "node|python|vite|mongod|redis"

# Check ports
sudo netstat -tlnp | grep -E "5001|5002|5173|27017|6379"
```

### 7. View backend logs:
```bash
tail -f /tmp/ids-backend.log
```

