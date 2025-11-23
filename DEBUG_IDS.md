# IDS Debugging Guide

## Step-by-Step Debugging

### Step 1: Check if Packet Capture is Running

**On IDS Ubuntu VM:**
```bash
# Check if backend is running
ps aux | grep "node.*index"

# Check backend logs
tail -50 /tmp/ids-backend.log | grep -i "capture\|packet\|started"

# Should see messages like:
# "Packet capture started"
# "Starting packet capture..."
# "Processing packet"
```

**If not running:**
- Open frontend in browser
- Go to Events Log page
- It should automatically start packet capture via WebSocket
- Check browser console for WebSocket connection

### Step 2: Check Network Interface

**On IDS Ubuntu VM:**
```bash
# List network interfaces
ip addr show
# or
ifconfig

# Check which interface packet capture is using
# Look in backend logs for: "Trying interface: ..."
```

**Common issues:**
- Packet capture might be on wrong interface (loopback, virtual, etc.)
- Interface might not be receiving packets from Kali

### Step 3: Test Network Connectivity

**On Kali VM:**
```bash
# Test basic connectivity
ping -c 5 192.168.100.4

# Test if IDS port is reachable
nc -zv 192.168.100.4 5001

# Test if you can see packets
sudo tcpdump -i any -c 10 host 192.168.100.4
```

**On IDS Ubuntu VM:**
```bash
# Monitor if packets are arriving
sudo tcpdump -i any -c 50 host <KALI_IP>
# Replace <KALI_IP> with your Kali VM's IP
# Run attack from Kali, you should see packets
```

### Step 4: Test Attack Script Manually

**On Kali VM - Test each attack type:**

**1. Test Port Scan:**
```bash
# Simple test
nmap -p 1-100 192.168.100.4

# Check if it shows in IDS
# Go to Monitoring page
```

**2. Test DoS:**
```bash
# Run for 10 seconds
sudo timeout 10 hping3 -S -p 5001 --flood 192.168.100.4

# Check IDS logs immediately
```

**3. Test if packets are being sent:**
```bash
# Count packets sent
for i in {1..20}; do
  nc -zv 192.168.100.4 5001 2>&1
done
```

### Step 5: Check MongoDB for Packets

**On IDS Ubuntu VM:**
```bash
# Connect to MongoDB
mongosh

# Use IDS database
use ids

# Check recent packets
db.packets.find().sort({date: -1}).limit(10).pretty()

# Check for malicious packets
db.packets.find({is_malicious: true}).sort({date: -1}).limit(10).pretty()

# Check packet count
db.packets.countDocuments()
```

### Step 6: Check Prediction Service

**On IDS Ubuntu VM:**
```bash
# Check if running
ps aux | grep "prediction_service"

# If not running, start it:
cd ~/Desktop/capstone/Firewall/IDS/backend
python3 prediction_service.py

# Test prediction service directly
curl -X POST http://localhost:5002/predict \
  -H "Content-Type: application/json" \
  -d '{
    "start_ip": "192.168.1.100",
    "end_ip": "192.168.1.1",
    "protocol": "TCP",
    "start_bytes": 100,
    "end_bytes": 200,
    "frequency": 500
  }'
```

### Step 7: Check WebSocket Connection

**In browser (frontend):**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for:
   - "Connected to WebSocket"
   - "Starting packet capture"
   - "new-packet" messages

**If WebSocket not connected:**
- Check backend is running on port 5001
- Check firewall isn't blocking
- Check browser console for errors

### Step 8: Verify Attack is Actually Running

**On Kali VM:**
```bash
# Check if hping3 is actually sending
sudo hping3 -S -p 5001 -c 10 192.168.100.4
# Should see output showing packets sent

# Check if nmap is scanning
nmap -p 1-50 192.168.100.4
# Should show scan results
```

### Step 9: Check Backend Logs in Real-Time

**On IDS Ubuntu VM:**
```bash
# Watch logs while running attack
tail -f /tmp/ids-backend.log

# Or if running in terminal, watch that terminal
# Look for:
# - "Processing packet"
# - "Captured packet"
# - "Attack detected"
# - Any errors
```

### Step 10: Test with Simple Attack

**On Kali VM - Simplest possible test:**
```bash
# Send 50 packets rapidly
for i in {1..50}; do
  nc -zv 192.168.100.4 5001 2>&1 &
done
wait

# Wait 5 seconds, then check IDS Monitoring page
```

## Common Issues and Fixes

### Issue 1: No packets in MongoDB
**Fix:** Packet capture not started or wrong interface
- Check WebSocket connection
- Check interface selection in logs
- Restart backend

### Issue 2: Packets in MongoDB but not detected as attacks
**Fix:** Detection thresholds too high or ML model issue
- Check packet frequency values
- Check if prediction service is running
- Check attack detector scores

### Issue 3: Attack script not sending packets
**Fix:** Network issue or wrong IP
- Verify IP address
- Check network connectivity
- Use `sudo` for hping3

### Issue 4: Backend crashes during attack
**Fix:** Already fixed with packet sampling, but restart backend

## Quick Test Command

**Run this on Kali to test everything:**
```bash
# Test 1: Basic connectivity
ping -c 3 192.168.100.4

# Test 2: Port scan (should trigger probe detection)
nmap -p 1-200 192.168.100.4

# Test 3: DoS (should trigger dos detection)
sudo timeout 10 hping3 -S -p 5001 --flood 192.168.100.4

# Then check IDS Monitoring page immediately
```

