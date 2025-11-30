# 🎯 IDS Attack Simulation Guide

## 📋 Overview

This guide explains how to simulate attacks for your IDS demo and when it's safe to unblock IPs for new attack simulations.

---

## 🚨 Attack Types & Detection Thresholds

### 1. **DoS (Denial of Service) Attack**
- **Threshold**: ≥ 200 packets/minute from same IP
- **Detection**: High frequency TCP/UDP packets
- **How to simulate**:
  ```bash
  # On attacker VM (192.168.100.5)
  # Option 1: Using hping3
  hping3 -S --flood -V 192.168.100.4
  
  # Option 2: Using simple script
  while true; do curl -s http://192.168.100.4 > /dev/null; done &
  ```

- **Expected**: 
  - 1 notification popup for "dos" attack type
  - IP gets auto-blocked after detection
  - System continues capturing packets

### 2. **DDoS (Distributed Denial of Service) Attack**
- **Threshold**: ≥ 500 packets/minute from same IP
- **Detection**: Extremely high frequency
- **How to simulate**:
  ```bash
  # On attacker VM
  # Multiple parallel connections
  for i in {1..10}; do
    while true; do curl -s http://192.168.100.4 > /dev/null; done &
  done
  ```

- **Expected**:
  - 1 notification popup for "ddos" attack type
  - IP gets auto-blocked
  - System handles high traffic without lag

### 3. **Port Scan Attack**
- **Threshold**: 10-100 packets/minute with small packets (< 150 bytes)
- **Detection**: Moderate frequency TCP packets to different ports
- **How to simulate**:
  ```bash
  # On attacker VM
  # Using nmap
  nmap -sS -T4 192.168.100.4
  
  # Or using simple script
  for port in {1..100}; do
    timeout 0.1 bash -c "echo > /dev/tcp/192.168.100.4/$port" 2>/dev/null
  done
  ```

- **Expected**:
  - 1 notification popup for "port_scan" attack type
  - IP may get auto-blocked if confidence > 0.7

### 4. **ICMP Ping Flood**
- **Threshold**: ≥ 30 ICMP packets/minute
- **Detection**: High frequency ICMP packets
- **How to simulate**:
  ```bash
  # On attacker VM
  ping -f 192.168.100.4
  ```

- **Expected**:
  - 1 notification popup for "ping_flood" attack type
  - IP gets auto-blocked

---

## ⏱️ When is it Safe to Unblock an IP?

### **For DoS/DDoS Attacks:**
1. **Wait 5-10 seconds** after blocking
2. **Check logs** - ensure blocking completed:
   ```
   [BLOCKING-WORKER] ✓ Blocked IP: 192.168.100.5
   ```
3. **Unblock via UI** or API:
   ```bash
   curl -X POST http://localhost:5000/api/ips/unblock \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"ip": "192.168.100.5"}'
   ```
4. **Wait 5 minutes** (grace period) before simulating new attack
   - System has a 5-minute grace period after manual unblock
   - This prevents immediate re-blocking

### **For Port Scan Attacks:**
1. **Wait 2-3 seconds** after blocking
2. **Unblock immediately** - port scans are less aggressive
3. **Wait 1 minute** before new scan

### **Quick Unblock for Demo:**
If you need to quickly test multiple attacks:

1. **Unblock the IP** via UI
2. **Wait for grace period message**:
   ```
   [THROTTLE] 🛡️ Grace period set for 192.168.100.5 (5 minutes - auto-blocking disabled)
   ```
3. **For immediate testing**, you can:
   - Use a **different IP address** (e.g., 192.168.100.6)
   - Or wait 5 minutes for grace period to expire

---

## 🔔 Notification System

### **One Notification Per Attack Type Per IP**

The system ensures:
- ✅ **1 notification** for port scan (even if 100 packets detected)
- ✅ **1 notification** for DoS (even if 1000 packets detected)
- ✅ **1 notification** for DDoS (even if 5000 packets detected)
- ✅ **New notification** if same IP does **different attack type**
  - Example: Port scan → DoS = 2 notifications (one for each type)

### **Notification Flow:**
1. First packet triggers detection
2. System checks: "Have we notified for this attack type from this IP?"
3. If NO → Send notification + mark as notified
4. If YES → Skip notification (already sent)
5. If IP unblocked → Clear notification flags → New attack type = new notification

---

## 🎬 Demo Checklist

### **Before Demo:**
- [ ] Start packet capture from Events Log page
- [ ] Verify system is running: Check logs for `[PACKET] ✅ Packet capture is ACTIVE`
- [ ] Have attacker VM ready (192.168.100.5 or similar)
- [ ] Test unblock functionality works

### **During Demo:**

1. **Port Scan Demo** (2 minutes)
   - Start port scan on attacker VM
   - Show notification popup appears
   - Show IP gets blocked
   - Unblock IP
   - Wait 1 minute

2. **DoS Attack Demo** (3 minutes)
   - Start DoS attack
   - Show notification popup
   - Show system continues working (no lag)
   - Show IP blocked
   - Unblock IP
   - Wait 5 minutes (or use different IP)

3. **DDoS Attack Demo** (3 minutes)
   - Start DDoS attack
   - Show notification popup
   - Show system handles high traffic
   - Show dashboard updates in real-time
   - Show IP blocked

### **Key Points to Highlight:**
- ✅ **Multi-threaded architecture** - no lag during attacks
- ✅ **One notification per attack type** - clean UI
- ✅ **Real-time detection** - fast response
- ✅ **Auto-blocking** - automatic protection
- ✅ **Grace period** - prevents false positives after unblock

---

## 🐛 Troubleshooting

### **No Notifications Appearing:**
1. Check packet capture is running: `[PACKET] ✅ Packet capture is ACTIVE`
2. Check attack thresholds are met (see thresholds above)
3. Check IP is not local IP (system skips localhost)
4. Check logs for: `[NOTIFICATION-WORKER] 📢 Sending intrusion alert`

### **Too Many False Positives:**
- System uses improved thresholds (see `packetAnalysisWorker.ts`)
- Only medium/critical status packets trigger alerts
- Minimum packet counts required per attack type

### **IP Not Getting Blocked:**
1. Check confidence > 0.6 (required for auto-block)
2. Check IP is not in grace period
3. Check logs: `[BLOCKING-WORKER] ✓ Blocked IP`
4. Check firewall rules: `sudo ipset list ids-blocklist-v4`

### **System Lagging During Attack:**
- Should NOT happen with multi-threaded architecture
- Check worker threads are running:
  ```
  [ANALYSIS-WORKER] ✅ Started packet analysis worker thread
  [BLOCKING-WORKER] ✅ Started blocking worker
  [DASHBOARD-WORKER] ✅ Updated stats cache
  ```
- If lagging, check MongoDB connection and Redis connection

---

## 📊 Expected Performance

- **Packet Capture**: Handles 5000+ packets/minute without lag
- **Analysis**: Processes packets in separate thread (non-blocking)
- **Notifications**: One per attack type per IP (no spam)
- **Blocking**: Completes in < 100ms (queued, non-blocking)
- **Dashboard**: Updates every 2 seconds (cached, fast)

---

## ✅ Summary

1. **Attack Simulation**: Use commands above for each attack type
2. **Unblock Timing**: Wait 5 minutes after unblock for DoS/DDoS, 1 minute for port scan
3. **Notifications**: One per attack type per IP (automatic)
4. **Demo Flow**: Port scan → DoS → DDoS (with unblocks between)
5. **Key Feature**: Multi-threaded = no lag, even during heavy attacks

**Good luck with your demo! 🚀**

