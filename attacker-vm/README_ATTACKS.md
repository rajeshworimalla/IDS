# IDS Attack Scripts - Usage Guide

These scripts are designed to test your IDS system by triggering various attack detections.

## Quick Start

### 1. Copy scripts to Kali Linux VM

```bash
# Copy the scripts to your Kali VM
# Option 1: Use SCP from Windows
scp attacker-vm/*.sh attacker-vm/*.py kali-user@kali-ip:~/attacks/

# Option 2: Clone repo in Kali
git clone <your-repo-url>
cd IDS/attacker-vm
```

### 2. Make scripts executable

```bash
chmod +x attack_scripts.sh
chmod +x python_attacks.py
```

### 3. Install dependencies (if needed)

```bash
# For bash scripts
sudo apt install nmap hping3 curl

# For Python scripts
pip3 install requests
```

## Usage

### Bash Script (Interactive Menu)

```bash
# Run with target IP
./attack_scripts.sh <IDS-SERVER-IP>

# Or specify port
./attack_scripts.sh <IDS-SERVER-IP> 5001

# Or run specific attack directly
./attack_scripts.sh <IDS-SERVER-IP> 5001 scan    # Port scan
./attack_scripts.sh <IDS-SERVER-IP> 5001 syn     # SYN flood
./attack_scripts.sh <IDS-SERVER-IP> 5001 http    # HTTP flood
./attack_scripts.sh <IDS-SERVER-IP> 5001 all     # All attacks
```

### Python Script

```bash
# Run all attacks
python3 python_attacks.py <IDS-SERVER-IP> 5001 all

# Run specific attack
python3 python_attacks.py <IDS-SERVER-IP> 5001 scan
python3 python_attacks.py <IDS-SERVER-IP> 5001 syn
python3 python_attacks.py <IDS-SERVER-IP> 5001 http
python3 python_attacks.py <IDS-SERVER-IP> 5001 slowloris
python3 python_attacks.py <IDS-SERVER-IP> 5001 icmp
python3 python_attacks.py <IDS-SERVER-IP> 5001 brute
```

## Attack Types and Expected Detections

| Attack | Expected Detection | Description |
|--------|-------------------|-------------|
| Port Scan | `port_scan` or `probe` | Scans multiple ports rapidly |
| SYN Flood | `dos` or `ddos` | Sends many SYN packets |
| HTTP Flood | `dos` or `ddos` | Sends many HTTP requests |
| ICMP Flood | `dos` | Sends many ping packets |
| Slowloris | `dos` | Keeps many connections open slowly |
| Brute Force | `brute_force` or `r2l` | Multiple login attempts |
| Mixed Attack | Multiple types | Combines multiple attacks |

## What to Watch in IDS Dashboard

While running attacks, check:

1. **Real-time Monitoring** - Should show spike in packets
2. **Security Alerts** - Should show attack detections
3. **Attack Type** - Should show correct classification
4. **Auto-blocking** - Your Kali IP should get blocked automatically
5. **Notifications** - Should pop up when attacks detected
6. **Blocked IPs** - Your IP should appear in blocked list

## Example Demo Flow

### Step 1: Start IDS
```bash
# On IDS Server VM
cd ~/Desktop/capstone/Firewall/IDS
./restart-all.sh
```

### Step 2: Find IDS Server IP
```bash
# On IDS Server VM
hostname -I
# Note the IP (e.g., 192.168.1.100)
```

### Step 3: Run Attack
```bash
# On Kali VM
cd ~/attacks
./attack_scripts.sh 192.168.1.100 5001 scan
```

### Step 4: Check IDS Dashboard
- Open IDS frontend in browser
- Go to Security Alerts page
- Should see "port_scan" detection
- Your Kali IP should be auto-blocked

### Step 5: Verify Blocking
```bash
# On Kali VM - try to access IDS
curl http://192.168.1.100:5001
# Should timeout or fail (you're blocked!)
```

## Troubleshooting

**Attack not detected?**
- Check IDS packet capture is running
- Check firewall rules are set up
- Check backend logs: `tail -f /tmp/ids-backend.log`
- Verify network connectivity between VMs

**Can't reach target?**
- Check both VMs are on same network (Bridged Adapter)
- Ping the target: `ping <IDS-SERVER-IP>`
- Check firewall isn't blocking you already

**Scripts not working?**
- Make sure scripts are executable: `chmod +x *.sh`
- Install required tools: `sudo apt install nmap hping3 curl python3-pip`
- Check Python version: `python3 --version` (should be 3.6+)

## Safety Notes

⚠️ **These scripts are for testing YOUR OWN IDS system only!**

- Only use on your own network/VMs
- Don't use against systems you don't own
- These attacks can cause network congestion
- Stop attacks with Ctrl+C if needed

## Quick Reference

```bash
# Quick port scan
nmap -p 1-1000 <IDS-SERVER-IP>

# Quick SYN flood (30 seconds)
timeout 30 hping3 -S -p 5001 --flood <IDS-SERVER-IP>

# Quick HTTP flood
for i in {1..1000}; do curl -s http://<IDS-SERVER-IP>:5001 > /dev/null & done

# Check if you're blocked
curl http://<IDS-SERVER-IP>:5001
# If it times out, you're blocked! ✅
```

