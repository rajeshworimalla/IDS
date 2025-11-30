# Fix for SYN Flood "can't open raw socket" Error

## Problem
The error `[main] can't open raw socket` occurs because `hping3` requires root privileges to create raw sockets.

## Solutions

### Option 1: Run with sudo (Recommended for hping3)
```bash
sudo ./attack_scripts.sh 192.168.100.4 5001
# Then select option 2 (SYN Flood)
```

Or run hping3 directly with sudo:
```bash
sudo hping3 -S -p 5001 --flood 192.168.100.4
```

### Option 2: Use Python Script (No root required)
The Python script uses regular TCP connections and doesn't require root:

```bash
python3 python_attacks.py 192.168.100.4 5001 syn
```

### Option 3: Use Updated Bash Script
The updated `attack_scripts.sh` now automatically falls back to Python if hping3 fails or requires sudo.

## Why This Happens
- **Raw sockets** require root/admin privileges
- `hping3` uses raw sockets for advanced packet crafting
- Regular TCP connections (Python method) don't require root

## Detection
Both methods will trigger DoS detection in the IDS:
- **hping3 method**: Sends raw SYN packets (more realistic attack)
- **Python method**: Creates many TCP connections (still triggers detection)

The IDS will detect both as DoS attacks based on packet frequency and patterns.

