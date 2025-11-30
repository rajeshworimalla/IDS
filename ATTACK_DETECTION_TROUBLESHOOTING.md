# Attack Detection Troubleshooting Guide

## ⚠️ IMPORTANT: Your IDS didn't detect the attack. Follow these steps:

### Step 1: Verify Packet Capture is Running

**In your IDS VM:**
1. Open the IDS dashboard in your browser
2. Go to **Events Log** page
3. Look for a **"Start Scanning"** or **"Start Capture"** button
4. Click it to start packet capture
5. You should see the status change to "Scanning" or "Capturing"

**Check backend logs:**
```bash
# On IDS VM
cd ~/Desktop/capstone/Firewall/IDS
tail -f backend/logs/*.log
# Or check the terminal where backend is running
# Look for: "Packet capture started, waiting for packets..."
```

### Step 2: Verify Network Connectivity

**On Kali VM:**
```bash
# Test if you can reach the IDS VM
ping 192.168.100.4

# Test if port 5001 (backend) is accessible
curl -v http://192.168.100.4:5001

# Test if port 22 (SSH) is accessible
nc -zv 192.168.100.4 22
```

**On IDS VM:**
```bash
# Check your IP address
hostname -I

# Check if you can see traffic from Kali VM
sudo tcpdump -i any host <KALI_VM_IP>
# Replace <KALI_VM_IP> with your Kali VM's IP
```

### Step 3: Fix SYN Flood Permission Issue

The SYN flood failed because it needs root privileges:

**On Kali VM:**
```bash
# Run with sudo
sudo ./attack_scripts.sh

# OR run individual attacks with sudo:
sudo hping3 -S --flood -V 192.168.100.4 -p 5001
```

### Step 4: Verify Services Are Running

**On IDS VM, check all services:**
```bash
# Check backend (should be on port 5001)
curl http://localhost:5001/api/health || echo "Backend not running"

# Check ML service (should be on port 5002)
curl http://localhost:5002/health || echo "ML service not running"

# Check MongoDB
sudo systemctl status mongod

# Check Redis
sudo systemctl status redis
```

### Step 5: Check Packet Capture Interface

The IDS might be capturing on the wrong network interface.

**On IDS VM:**
```bash
# List all network interfaces
ip addr show

# Check which interface has your VM's IP (192.168.100.4)
# It should be something like: eth0, enp0s3, ens33, etc.

# Check backend logs to see which interface it selected
# Look for: "Available network interfaces:" or "Trying interface:"
```

### Step 6: Test with Simple Attack

**On Kali VM, try a simple ping flood:**
```bash
# This should definitely be detected
ping -f 192.168.100.4
# Press Ctrl+C after 10 seconds
```

**On IDS VM, check if packets are being captured:**
- Go to Events Log page
- You should see ICMP packets appearing
- Check Dashboard - packet count should increase

### Step 7: Check ML Service

**On IDS VM:**
```bash
# Check if ML service is running
ps aux | grep python | grep prediction

# Check ML service logs
tail -f backend/logs/prediction_service.log
# Or if running in terminal, check that terminal

# Test ML service directly
curl -X POST http://localhost:5002/predict \
  -H "Content-Type: application/json" \
  -d '{"protocol":"TCP","frequency":100,"packet_size":64}'
```

### Step 8: Verify Firewall Isn't Blocking

**On IDS VM:**
```bash
# Check if iptables is blocking incoming traffic
sudo iptables -L INPUT -v -n

# Temporarily allow all traffic (for testing only!)
sudo iptables -P INPUT ACCEPT
sudo iptables -P FORWARD ACCEPT
sudo iptables -P OUTPUT ACCEPT
sudo iptables -F
```

### Step 9: Check Backend Logs for Errors

**On IDS VM:**
```bash
# Check backend terminal output for:
# - "Packet capture started successfully"
# - "Error starting packet capture"
# - "Error processing packet"
# - "ML service unavailable"

# Look for any errors related to:
# - Cap library (packet capture)
# - Network interface
# - ML service connection
```

### Step 10: Manual Test

**On IDS VM, manually test packet capture:**
```bash
# Install tcpdump if not installed
sudo apt-get install tcpdump

# Capture packets manually to verify network is working
sudo tcpdump -i any -n host <KALI_VM_IP>
# You should see packets when running attacks from Kali
```

## Common Issues:

### Issue 1: "Packet capture not running"
**Solution:** Go to Events Log page and click "Start Scanning"

### Issue 2: "No packets being captured"
**Solution:** 
- Check network interface selection in backend logs
- Verify VMs are on same network
- Check firewall rules

### Issue 3: "ML service not responding"
**Solution:**
- Restart ML service: `cd backend && python prediction_service.py`
- Check port 5002 is not blocked
- Verify Python dependencies are installed

### Issue 4: "Attacks not detected"
**Solution:**
- Make sure packet capture is running
- Verify ML service is running
- Check that attacks are actually reaching the IDS VM (use tcpdump)
- Try simpler attacks first (ping flood)

## Quick Checklist:

- [ ] Packet capture is started (Events Log page)
- [ ] Backend is running (port 5001)
- [ ] ML service is running (port 5002)
- [ ] MongoDB is running
- [ ] Redis is running
- [ ] VMs can ping each other
- [ ] Network interface is correct
- [ ] Firewall isn't blocking traffic
- [ ] Using sudo for attacks that need it

## Still Not Working?

1. **Check backend terminal** for detailed error messages
2. **Check browser console** (F12) for frontend errors
3. **Verify all services started correctly** with `./restart-all.sh`
4. **Check network connectivity** between VMs
5. **Try restarting everything**: `./restart-all.sh`

