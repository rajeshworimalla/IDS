# Attack Simulation Guide

## Quick Start

### Option 1: Run All Attacks (Recommended)
```bash
cd backend
python3 simulate_attacks.py --target 192.168.100.4 --all
```

This will run all 6 attack types sequentially:
1. DoS (SYN Flood)
2. Probe (Port Scan)
3. Brute Force
4. R2L (SSH Attempts)
5. U2R (Buffer Overflow)
6. Unknown (Mixed Attack)

### Option 2: Run Individual Attacks
```bash
# DoS Attack (10 seconds)
python3 simulate_attacks.py --target 192.168.100.4 --dos --duration 10

# Port Scan (Probe)
python3 simulate_attacks.py --target 192.168.100.4 --probe --duration 15

# Brute Force
python3 simulate_attacks.py --target 192.168.100.4 --brute --duration 10

# R2L Attack
python3 simulate_attacks.py --target 192.168.100.4 --r2l --duration 10

# U2R Attack
python3 simulate_attacks.py --target 192.168.100.4 --u2r --duration 10

# UDP Flood
python3 simulate_attacks.py --target 192.168.100.4 --udp --duration 10

# Mixed/Unknown Attack
python3 simulate_attacks.py --target 192.168.100.4 --unknown --duration 10
```

## Usage Examples

### Run All Attacks with Custom Duration
```bash
python3 simulate_attacks.py --target 192.168.100.4 --all --duration 15
```

### Run Multiple Specific Attacks
```bash
# Run DoS and Probe attacks
python3 simulate_attacks.py --target 192.168.100.4 --dos --probe --duration 10
```

### Run on Different Port
```bash
python3 simulate_attacks.py --target 192.168.100.4 --port 8080 --dos --duration 10
```

## Attack Types Explained

### 1. DoS (Denial of Service)
- **What it does:** Sends rapid SYN packets to overwhelm the target
- **Detection:** Should be detected as `attack_type: "dos"`, `is_malicious: true`
- **Command:** `--dos`

### 2. Probe (Port Scan)
- **What it does:** Scans multiple ports to discover open services
- **Detection:** Should be detected as `attack_type: "probe"`, `is_malicious: true`
- **Command:** `--probe`

### 3. Brute Force
- **What it does:** Multiple failed HTTP login attempts
- **Detection:** Should be detected as `attack_type: "brute_force"`, `is_malicious: true`
- **Command:** `--brute`

### 4. R2L (Remote to Local)
- **What it does:** Attempts unauthorized SSH access
- **Detection:** Should be detected as `attack_type: "r2l"`, `is_malicious: true`
- **Command:** `--r2l`

### 5. U2R (User to Root)
- **What it does:** Sends oversized buffers (buffer overflow attempt)
- **Detection:** Should be detected as `attack_type: "u2r"`, `is_malicious: true`
- **Command:** `--u2r`

### 6. Unknown (Mixed Attack)
- **What it does:** Random mix of different attack patterns
- **Detection:** Should be detected as `attack_type: "unknown_attack"`, `is_malicious: true`
- **Command:** `--unknown`

## Testing Workflow

1. **Start your IDS system:**
   ```bash
   # Backend
   cd backend && npm start
   
   # Prediction service (in another terminal)
   cd backend && python3 prediction_service.py
   
   # Frontend (in another terminal)
   cd frontend && npm run dev
   ```

2. **Run attack simulation:**
   ```bash
   cd backend
   python3 simulate_attacks.py --target <YOUR_IDS_IP> --all
   ```

3. **Check results:**
   - Open your IDS frontend (usually `http://localhost:5173`)
   - Go to **Monitoring** page
   - You should see alerts with correct attack types
   - Popup should appear for each attack type

## Tips

- **For testing:** Use `--duration 5` for quick tests
- **For demos:** Use `--duration 10-15` for visible effects
- **For stress testing:** Use `--duration 30+` to test system under load
- **Multiple attacks:** Run `--all` to test all detection types at once

## Troubleshooting

**"Cannot reach target" error:**
- Check that the target IP is correct
- Ensure network connectivity (try `ping <target_ip>`)
- Make sure target is on the same network

**No detections:**
- Check that packet capture is running
- Verify prediction service is running
- Check backend logs for errors
- Ensure attack duration is long enough (try `--duration 15`)

**Script hangs:**
- Press `Ctrl+C` to stop
- Check network connectivity
- Verify target IP and port are correct

