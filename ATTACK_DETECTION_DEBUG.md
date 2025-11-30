# Attack Detection Debugging Guide

## Quick Debug Steps

### 1. Run the Debug Script
```bash
./debug-attack-detection.sh
```

This will check:
- Backend service status
- ML prediction service status
- Network interfaces
- Recent packet capture
- Malicious packet detection

### 2. Check Backend Logs
```bash
# If running with systemd
sudo journalctl -u ids-backend -f

# If running manually, check console output for:
# - "First packet captured!"
# - "🚨 CRITICAL packet detected"
# - "📢 Emitting critical alert"
# - "✓ Critical alert emitted"
```

### 3. Check ML Service Logs
```bash
# Check if ML service is running
ps aux | grep prediction_service

# Test ML service directly
curl -X POST http://127.0.0.1:5002/predict \
  -H "Content-Type: application/json" \
  -d '{"packet": {"protocol": "TCP", "frequency": 100, "start_bytes": 60, "end_bytes": 60, "start_ip": "192.168.1.100", "end_ip": "192.168.1.1"}}'
```

### 4. Verify Packet Capture is Started
1. Open the IDS web interface
2. Go to **Events Log** page
3. Click **"Start Scanning"** button
4. You should see packets appearing in real-time

### 5. Check Browser Console
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Look for:
   - `[Dashboard] Socket connected`
   - `[Notifications] Intrusion detected:`
   - `[SecurityAlerts] Socket connected`
   - Any socket connection errors

### 6. Test Attack Detection
From your Kali VM, run:
```bash
# Quick ICMP flood (should trigger detection)
ping -f 192.168.100.4

# Or use the attack script
./attack_scripts.sh
```

## Common Issues

### Issue 1: No Packets Captured
**Symptoms:** Events Log shows no packets, backend logs show no "First packet captured!"

**Solutions:**
- Make sure packet capture is **STARTED** from Events Log page
- Check network interface: `ip addr show`
- Verify packet capture permissions: `getcap $(which node)`
- Check if running with sudo (required for firewall rules)

### Issue 2: Packets Captured but No Detection
**Symptoms:** Packets appear in Events Log but no alerts/notifications

**Solutions:**
- Check ML service is running: `ps aux | grep prediction_service`
- Check backend logs for ML prediction errors
- Verify attack frequency is high enough (see thresholds below)
- Check if packets are marked as "critical" in Events Log

### Issue 3: Detection but No Notifications
**Symptoms:** Backend logs show "Critical alert emitted" but no popup in browser

**Solutions:**
- Check browser console for socket connection errors
- Verify JWT token is valid (try logging out and back in)
- Check browser notification permissions
- Look for `[Notifications] Intrusion detected:` in browser console

### Issue 4: ML Service Not Responding
**Symptoms:** Backend logs show "ML service not available" or connection errors

**Solutions:**
- Restart ML service: `./restart-all.sh`
- Check ML service logs: `ps aux | grep prediction_service`
- Test ML service directly with curl (see step 3 above)
- Verify port 5002 is not blocked

## Detection Thresholds

The IDS uses these thresholds to mark packets as "critical":

### Internal Network (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- **TCP:** > 50 packets/minute → critical
- **UDP:** > 100 packets/minute → critical
- **ICMP:** > 30 packets/minute → critical

### External Network
- **TCP:** > 30 packets/minute → critical
- **UDP:** > 50 packets/minute → critical
- **ICMP:** > 20 packets/minute → critical

**Note:** Frequency is calculated per minute, so short bursts might not trigger if they don't reach these thresholds.

## What Happens When Attack is Detected

1. **Packet Captured** → Saved to database
2. **Status Determined** → Based on frequency/protocol
3. **ML Analysis** → Sent to prediction service (if available)
4. **Pattern Detection** → Fallback if ML unavailable
5. **Alert Emitted** → Socket.IO event `intrusion-detected`
6. **Auto-Block** → IP added to firewall (if confidence > 0.6)
7. **Notification** → Browser popup + sound alert

## Debugging Checklist

- [ ] Backend is running (`ps aux | grep node`)
- [ ] ML service is running (`ps aux | grep prediction`)
- [ ] Packet capture is STARTED (Events Log page)
- [ ] Network interface is active (`ip addr show`)
- [ ] Packets are being captured (check Events Log)
- [ ] ML service is responding (curl test)
- [ ] Socket connection is active (browser console)
- [ ] Attack frequency meets thresholds
- [ ] Browser notifications are enabled
- [ ] No firewall blocking between VMs

## Testing Attack Detection

### Quick Test (from IDS VM)
```bash
# Generate high-frequency traffic
for i in {1..100}; do
  ping -c 1 -W 1 192.168.100.5 > /dev/null 2>&1 &
done
wait
```

### Full Attack Test (from Kali VM)
```bash
# Use the attack script
cd attacker-vm
./attack_scripts.sh
# Select option 1 (Port Scan) or 3 (ICMP Flood)
```

## Expected Behavior

When an attack is detected, you should see:

1. **Backend Console:**
   ```
   [PACKET] 🚨 CRITICAL packet detected: ICMP from 192.168.100.5 (freq: 45)
   [PACKET] 📢 Emitting critical alert: {...}
   [PACKET] ✓ Critical alert emitted to user_xxx
   ```

2. **Browser Console:**
   ```
   [Notifications] Intrusion detected: {ip: "192.168.100.5", attackType: "ping_flood", ...}
   ```

3. **Browser UI:**
   - Popup notification appears
   - Sound alert plays
   - Security Alerts page updates
   - Dashboard stats update

## Still Not Working?

1. **Check all services are running:**
   ```bash
   ./restart-all.sh
   ```

2. **Verify network connectivity:**
   ```bash
   # From Kali VM
   ping 192.168.100.4
   
   # From IDS VM
   ping 192.168.100.5
   ```

3. **Check firewall rules:**
   ```bash
   sudo iptables -L -n -v
   sudo ipset list ids_blocklist
   ```

4. **Review full logs:**
   ```bash
   # Backend logs
   tail -f /var/log/ids-backend.log  # or wherever logs are
   
   # ML service logs
   tail -f /var/log/ids-ml.log  # or check console output
   ```

5. **Test with verbose logging:**
   - All critical packets now log to console
   - Check for "🚨 CRITICAL packet detected" messages
   - Verify "📢 Emitting critical alert" appears

