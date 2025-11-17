# Kali Linux Attack Simulation Guide

## Quick Start

### Copy Script to Kali Linux

1. **Copy the script to your Kali VM:**
   ```bash
   # On your Windows machine, the script is at:
   # kali-attack-suite.sh
   
   # Copy it to Kali (use scp, shared folder, or copy-paste)
   ```

2. **Make it executable:**
   ```bash
   chmod +x kali-attack-suite.sh
   ```

## Usage

### Option 1: Interactive Menu (Easiest)
```bash
./kali-attack-suite.sh 192.168.100.4
```

This will show a menu where you can select which attack to run.

### Option 2: Run All Attacks at Once
```bash
./kali-attack-suite.sh --all 192.168.100.4
```

This runs all 6 attack types sequentially.

### Option 3: Run Specific Attack
```bash
# DoS Attack
./kali-attack-suite.sh dos 192.168.100.4 5001 10

# Port Scan (Probe)
./kali-attack-suite.sh probe 192.168.100.4 5001 15

# Brute Force
./kali-attack-suite.sh brute 192.168.100.4 5001 10

# R2L Attack
./kali-attack-suite.sh r2l 192.168.100.4 5001 10

# U2R Attack
./kali-attack-suite.sh u2r 192.168.100.4 5001 10

# Unknown/Mixed Attack
./kali-attack-suite.sh unknown 192.168.100.4 5001 10
```

## Arguments

```bash
./kali-attack-suite.sh [attack_type] [IDS_IP] [IDS_PORT] [DURATION]
```

- **attack_type**: `dos`, `probe`, `brute`, `r2l`, `u2r`, `unknown`, or `--all`
- **IDS_IP**: IP address of your IDS server (default: 192.168.100.4)
- **IDS_PORT**: Port to attack (default: 5001)
- **DURATION**: How long to run attack in seconds (default: 10)

## Examples

### Quick Test (5 seconds each)
```bash
./kali-attack-suite.sh --all 192.168.100.4 5001 5
```

### Demo Mode (15 seconds each)
```bash
./kali-attack-suite.sh --all 192.168.100.4 5001 15
```

### Stress Test (30 seconds each)
```bash
./kali-attack-suite.sh --all 192.168.100.4 5001 30
```

### Run Individual Attacks
```bash
# Just DoS
./kali-attack-suite.sh dos 192.168.100.4

# Just Port Scan
./kali-attack-suite.sh probe 192.168.100.4

# Just Brute Force
./kali-attack-suite.sh brute 192.168.100.4
```

## Attack Types

### 1. DoS (Denial of Service) - SYN Flood
- Uses `hping3` if available, otherwise Python fallback
- Sends rapid SYN packets to overwhelm target
- **Expected Detection:** `attack_type: "dos"`, `is_malicious: true`

### 2. Probe - Port Scan
- Uses `nmap` if available, otherwise `netcat` fallback
- Scans multiple ports to discover services
- **Expected Detection:** `attack_type: "probe"`, `is_malicious: true`

### 3. Brute Force
- Uses `curl` to send HTTP POST login attempts
- Multiple failed login attempts
- **Expected Detection:** `attack_type: "brute_force"`, `is_malicious: true`

### 4. R2L (Remote to Local)
- Uses `ssh` to attempt unauthorized access
- Multiple failed SSH connection attempts
- **Expected Detection:** `attack_type: "r2l"`, `is_malicious: true`

### 5. U2R (User to Root)
- Sends oversized buffers (buffer overflow simulation)
- Python-based buffer overflow attempts
- **Expected Detection:** `attack_type: "u2r"`, `is_malicious: true`

### 6. Unknown - Mixed Pattern
- Random mix of port scans, SYN packets, UDP packets
- Unpredictable attack pattern
- **Expected Detection:** `attack_type: "unknown_attack"`, `is_malicious: true`

## Prerequisites

The script will work with or without these tools, but works best with:

- **hping3** (for DoS attacks) - Usually pre-installed on Kali
- **nmap** (for port scans) - Usually pre-installed on Kali
- **netcat** (nc) - Usually pre-installed on Kali
- **curl** - Usually pre-installed on Kali
- **python3** - Usually pre-installed on Kali
- **ssh** - Usually pre-installed on Kali

If tools are missing, the script will use Python fallbacks.

## Testing Workflow

1. **Start your IDS system** (on Ubuntu VM):
   ```bash
   # Backend
   cd ~/Desktop/capstone/Firewall/IDS/backend && npm start
   
   # Prediction service (another terminal)
   cd ~/Desktop/capstone/Firewall/IDS/backend && python3 prediction_service.py
   
   # Frontend (another terminal)
   cd ~/Desktop/capstone/Firewall/IDS/frontend && npm run dev
   ```

2. **Find your IDS IP:**
   ```bash
   # On Ubuntu VM
   hostname -I
   # or
   ip addr show
   ```

3. **Run attacks from Kali:**
   ```bash
   # On Kali Linux
   ./kali-attack-suite.sh --all <IDS_IP>
   ```

4. **Check results:**
   - Open IDS frontend: `http://<IDS_IP>:5173`
   - Go to **Monitoring** page
   - You should see alerts for each attack type
   - Popups should appear instantly

## Troubleshooting

**"Cannot reach target" error:**
- Check that IDS IP is correct
- Ensure both VMs are on same network
- Try `ping <IDS_IP>` from Kali

**"Command not found" errors:**
- Script will use Python fallbacks automatically
- Or install missing tools: `sudo apt update && sudo apt install hping3 nmap netcat curl`

**No detections:**
- Check that packet capture is running on IDS
- Verify prediction service is running
- Ensure attack duration is long enough (try 15+ seconds)
- Check IDS backend logs for errors

**Script hangs:**
- Press `Ctrl+C` to stop
- Check network connectivity
- Verify target IP and port

## Tips

- **For quick tests:** Use `--duration 5`
- **For demos:** Use `--duration 10-15`
- **For stress testing:** Use `--duration 30+`
- **For presentations:** Run `--all` to show all attack types
- **For debugging:** Run individual attacks to isolate issues

