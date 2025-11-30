# Quick Start: Testing Attacks on Your IDS

## Your IDS VM IP: **192.168.100.4**

## Quick Test (From Kali VM)

### 1. Test Connectivity First
```bash
ping 192.168.100.4
```
If ping works, you're ready to attack!

### 2. Run Attack Scripts

#### Option A: Bash Scripts (Recommended)
```bash
cd attacker-vm
chmod +x attack_scripts.sh
./attack_scripts.sh 192.168.100.4
```

Then select an attack from the menu:
- `1` - Port Scan (detects as "port_scan")
- `2` - SYN Flood (detects as "dos")
- `3` - HTTP Flood (detects as "ddos")
- `4` - ICMP Flood (detects as "ping_sweep")
- `7` - Run All Attacks

#### Option B: Python Scripts
```bash
cd attacker-vm
python3 python_attacks.py 192.168.100.4
```

### 3. Watch IDS Dashboard

**Open IDS in browser:** `http://192.168.100.4:3000` (or your frontend URL)

**What to watch:**
- **Security Alerts** page - Shows attack types immediately
- **Dashboard** - "ATTACKS DETECTED" counter increases
- **Monitoring** page - Shows detailed attack information
- **Events Log** - Shows packets with attack types
- **Notifications** - Pop-up alerts in top-right corner

## Manual Attack Examples

### Port Scan
```bash
nmap -p 1-100 192.168.100.4
```
**Expected Detection:** 🔍 Port Scan

### SYN Flood
```bash
hping3 -S --flood -p 5001 192.168.100.4
```
**Expected Detection:** 🚨 Denial of Service

### ICMP Flood
```bash
ping -f 192.168.100.4
```
**Expected Detection:** 🔍 Ping Sweep

### HTTP Flood
```bash
for i in {1..1000}; do curl http://192.168.100.4:5001; done
```
**Expected Detection:** 🚨 Distributed DoS

## What You Should See

1. **Within 1-2 seconds:** Attack appears in Security Alerts
2. **Attack Type:** Clear label (e.g., "🚨 Denial of Service")
3. **Confidence:** Percentage (e.g., "85% confidence")
4. **Auto-Block:** High-confidence attacks (>60%) are blocked automatically
5. **Real-time Updates:** All pages update automatically

## Troubleshooting

### If attacks don't show:
1. **Check connectivity:**
   ```bash
   ping 192.168.100.4
   ```

2. **Check IDS is running:**
   - Events Log should show packets
   - Dashboard should show packet counts

3. **Check ML service:**
   ```bash
   # On IDS VM
   ps aux | grep prediction_service
   ```

4. **Check firewall:**
   ```bash
   # On IDS VM
   sudo ufw status
   ```

### If you see "unknown" attack type:
- Pattern-based detection will still work
- Check backend logs for ML errors
- System will detect attacks even without ML classification

## Network Configuration

Your VMs should be on the same network:
- **IDS VM:** 192.168.100.4
- **Kali VM:** Should be in 192.168.100.x range

To find Kali VM IP:
```bash
hostname -I
```

