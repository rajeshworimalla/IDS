# Rule-Based Attack Detection (ML Models Disabled)

## Overview

The IDS system now uses **rule-based attack detection only** by default. ML models are disabled to prevent crashes and improve reliability.

## How It Works

The system uses comprehensive rule-based detectors from `attack_detectors.py`:

1. **Port Scan Detector** - Detects port scanning and reconnaissance attacks
2. **DoS Detector** - Detects Denial of Service attacks (SYN flood, UDP flood, etc.)
3. **R2L Detector** - Detects Remote to Local attacks (unauthorized access attempts)
4. **U2R Detector** - Detects User to Root attacks (privilege escalation)
5. **Brute Force Detector** - Detects brute force login attempts

## Attack Types Detected

The system can detect and classify 6 attack types:

- `normal` - Normal network traffic
- `dos` - Denial of Service attacks
- `probe` - Port scanning and reconnaissance
- `r2l` - Remote to Local attacks
- `u2r` - User to Root attacks
- `brute_force` - Brute force login attempts
- `unknown_attack` - Malicious activity that doesn't fit other categories

## Configuration

### Disable ML Models (Default)

ML models are **disabled by default**. The prediction service uses only rule-based detection.

### Enable ML Models (Optional)

If you want to use ML models, set the environment variable:

```bash
export USE_ML_MODELS=true
```

Or in your startup script:

```bash
USE_ML_MODELS=true python3 prediction_service.py
```

## Benefits of Rule-Based Detection

1. **No Crashes** - Rule-based detection is more stable and doesn't crash
2. **Fast** - No model loading or prediction overhead
3. **Accurate** - Well-tuned rules catch known attack patterns reliably
4. **Transparent** - Easy to understand why an attack was detected
5. **No Dependencies** - Doesn't require model files or sklearn

## How Detection Works

1. **Packet Capture** - Packets are captured from the network
2. **Feature Extraction** - Packet features are extracted (IPs, ports, protocols, etc.)
3. **Rule-Based Analysis** - Each detector analyzes the packet for attack patterns
4. **Attack Classification** - The system determines the attack type and confidence
5. **Alert Generation** - Alerts are generated and displayed in the UI

## Attack Detection Rules

### Port Scan Detection
- **Trigger**: 10+ unique ports scanned in 60 seconds
- **Confidence**: Based on port scan rate and sequential patterns
- **Attack Type**: `probe`

### DoS Detection
- **Trigger**: 100+ packets/second to single/multiple destinations
- **Confidence**: Based on packet rate, SYN flood patterns, packet size
- **Attack Type**: `dos`

### Brute Force Detection
- **Trigger**: 10+ failed login attempts in 5 minutes
- **Confidence**: Based on failure rate and login attempt patterns
- **Attack Type**: `brute_force`

### R2L Detection
- **Trigger**: 5+ failed logins or privilege escalation attempts
- **Confidence**: Based on failed logins and suspicious commands
- **Attack Type**: `r2l`

### U2R Detection
- **Trigger**: Root commands, setuid attempts, or buffer overflow patterns
- **Confidence**: Based on privilege escalation indicators
- **Attack Type**: `u2r`

## Testing

Run attack simulations to test detection:

```bash
cd backend
python3 simulate_attacks.py --target <YOUR_IP> --all
```

The system should detect all attack types without crashing!

## Troubleshooting

**No detections?**
- Check that packet capture is running
- Verify the target IP is correct
- Check that attacks are actually being sent

**False positives?**
- Adjust thresholds in `attack_detectors.py`
- Check network activity to verify if it's actually suspicious

**System still crashing?**
- Make sure ML models are disabled (check logs for "ML MODELS DISABLED")
- Check error logs for specific issues
- Verify all dependencies are installed

