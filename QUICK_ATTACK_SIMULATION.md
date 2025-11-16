# Quick Attack Simulation Guide

## How It Works

1. **Your IDS captures packets** → Backend's `packetCapture.ts` service
2. **Packets are sent to ML model** → Python `prediction_service.py` 
3. **ML model predicts** → Binary (malicious/benign) + Attack type (dos, probe, r2l, u2r)
4. **Results stored in MongoDB** → Packets marked with `is_malicious`, `attack_type`, `confidence`
5. **Auto-blocking** → If malicious, IP can be auto-blocked

## Quick Setup

### Step 1: Make sure everything is running

In your VM:
```bash
cd ~/Desktop/capstone/Firewall/IDS

# Start all services
./start-everything.sh

# Or manually:
# Backend (captures packets and sends to ML)
cd backend && npm start

# Prediction service (ML model)
cd backend && source venv/bin/activate && python3 prediction_service.py

# Frontend (to view results)
cd frontend && npm run dev
```

### Step 2: Start packet capture

Your backend should automatically start packet capture. Check logs:
```bash
tail -f /tmp/ids-backend.log | grep -i "packet\|prediction"
```

## Simulating Attacks

### Option 1: Use your existing attacker VM (if you have one)

If you have a second VM set up as attacker:

```bash
# On Attacker VM
cd ~/attacks

# Port scan (will be detected as "probe" attack)
./port_scan.sh <IDS-VM-IP>

# SYN flood (will be detected as "dos" attack)
./syn_flood.sh <IDS-VM-IP> 5001

# HTTP flood (will be detected as "dos" attack)
./http_flood.sh <IDS-VM-IP> 5001
```

### Option 2: Simulate from same VM (for testing)

You can generate traffic from the same VM:

```bash
# Generate lots of connections (simulates attack)
for i in {1..100}; do
  curl http://localhost:5001 &
done

# Or use hping3 if installed
sudo apt install -y hping3
hping3 -S -p 5001 --flood localhost
```

### Option 3: Use your frontend to trigger traffic

Just use your frontend normally - it will generate packets that get analyzed.

## Viewing ML Detection Results

### Method 1: Frontend Dashboard

1. Open `http://localhost:5173` (or your VM IP:5173)
2. Go to **Monitoring** or **Events Log** page
3. You'll see packets with:
   - **is_malicious**: true/false
   - **attack_type**: normal, dos, probe, r2l, u2r
   - **confidence**: 0.0 to 1.0

### Method 2: Backend API

```bash
# Get all packets with ML predictions
curl http://localhost:5001/api/packets

# Get only malicious packets
curl http://localhost:5001/api/packets?malicious=true
```

### Method 3: MongoDB directly

```bash
# Connect to MongoDB
sudo docker exec -it mongodb mongo mongodb://127.0.0.1:27017

# In MongoDB shell:
use ids
db.packets.find({is_malicious: true}).pretty()
db.packets.find({attack_type: "dos"}).pretty()
```

## What Gets Detected

Your ML model detects:
- **Binary**: `malicious` or `benign`
- **Attack Types**:
  - `normal` - Normal traffic
  - `dos` - Denial of Service attacks
  - `probe` - Port scanning, reconnaissance
  - `r2l` - Remote to Local attacks
  - `u2r` - User to Root attacks

## Testing ML Detection

### Test 1: Normal Traffic
```bash
# Just browse your frontend normally
# Should show: is_malicious: false, attack_type: normal
```

### Test 2: Port Scan (Probe)
```bash
# From attacker VM or same VM
nmap -p 1-1000 localhost
# Should show: attack_type: probe, is_malicious: true
```

### Test 3: Flood Attack (DoS)
```bash
# Generate many connections quickly
for i in {1..500}; do curl http://localhost:5001 & done
# Should show: attack_type: dos, is_malicious: true
```

## Viewing in Real-Time

### Watch backend logs:
```bash
tail -f /tmp/ids-backend.log | grep -E "prediction|malicious|attack_type"
```

### Watch prediction service logs:
```bash
tail -f /tmp/ids-prediction.log
```

### Check frontend
- Open Monitoring page
- Packets appear in real-time with ML predictions

## Troubleshooting

**No predictions showing?**
```bash
# Check prediction service is running
ps aux | grep prediction_service

# Check if it's receiving requests
tail -f /tmp/ids-prediction.log
```

**ML service not responding?**
```bash
# Test it directly
curl -X POST http://localhost:5002/predict \
  -H "Content-Type: application/json" \
  -d '{"packet": {"start_bytes": 100, "end_bytes": 200, "protocol": "TCP", "frequency": 10}}'
```

**Packets not being captured?**
```bash
# Check packet capture is running
ps aux | grep "node dist/index.js"

# Check backend logs
tail -f /tmp/ids-backend.log
```

## Quick Demo Flow

1. **Start everything**: `./start-everything.sh`
2. **Open frontend**: `http://localhost:5173`
3. **Go to Monitoring page**
4. **Generate attack traffic** (from attacker VM or same VM)
5. **Watch packets appear** with ML predictions in real-time
6. **Check blocked IPs** - malicious IPs get auto-blocked

That's it! Your ML model automatically analyzes every packet and marks them as malicious/benign with attack types.










