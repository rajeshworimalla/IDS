#!/bin/bash

# IDS Attack Simulation Script
# Run this from Kali Linux to test all 6 attack types

IDS_IP="${1:-192.168.100.4}"  # Default IDS IP, or pass as argument

echo "=========================================="
echo "  IDS Attack Simulation Script"
echo "  Target: $IDS_IP"
echo "=========================================="
echo ""

# Check if target is reachable
echo "[*] Checking connectivity..."
if ! ping -c 2 -W 2 $IDS_IP > /dev/null 2>&1; then
    echo "[-] ERROR: Cannot reach $IDS_IP"
    echo "    Please check:"
    echo "    1. IDS server is running"
    echo "    2. Network connectivity"
    echo "    3. Correct IP address"
    exit 1
fi
echo "[+] Target is reachable"
echo ""

# Function to wait and show status
wait_and_check() {
    echo "    Waiting 5 seconds for detection..."
    sleep 5
    echo "    ✓ Check Monitoring tab at http://$IDS_IP:5173"
    echo ""
}

# 1. Port Scan (Probe)
echo "[1/6] Testing Port Scan Attack (Probe)..."
echo "    Scanning ports 1-500..."
nmap -p 1-500 -T4 $IDS_IP > /dev/null 2>&1
wait_and_check

# 2. DoS Attack
echo "[2/6] Testing DoS Attack..."
echo "    Sending SYN flood (5 seconds)..."
hping3 -S -p 5001 --flood $IDS_IP > /dev/null 2>&1 &
HPING_PID=$!
sleep 5
kill $HPING_PID 2>/dev/null
wait $HPING_PID 2>/dev/null
wait_and_check

# 3. Brute Force
echo "[3/6] Testing Brute Force Attack..."
echo "    Sending 15 failed login attempts..."
for i in {1..15}; do
    curl -s -X POST http://$IDS_IP:8080/login \
        -d "username=admin&password=wrongpass$i" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --max-time 2 > /dev/null 2>&1
    sleep 0.2
done
wait_and_check

# 4. R2L Attack
echo "[4/6] Testing R2L Attack (Remote to Local)..."
echo "    Attempting unauthorized SSH access..."
for i in {1..8}; do
    ssh -o ConnectTimeout=1 \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        fakeuser$i@$IDS_IP "exit" > /dev/null 2>&1
    sleep 0.5
done
wait_and_check

# 5. U2R Attack
echo "[5/6] Testing U2R Attack (User to Root)..."
echo "    Attempting directory traversal..."
for path in /root /etc/shadow /etc/passwd; do
    curl -s "http://$IDS_IP:8080/../../$path" \
        --max-time 2 > /dev/null 2>&1
    sleep 0.3
done
wait_and_check

# 6. Mixed/Unknown Attack
echo "[6/6] Testing Mixed/Unknown Attack..."
echo "    Combining port scan + DoS..."
nmap -p 1-200 -T4 $IDS_IP > /dev/null 2>&1 &
NMAP_PID=$!
hping3 -S -p 5001 -c 100 $IDS_IP > /dev/null 2>&1 &
HPING_PID=$!
wait $NMAP_PID 2>/dev/null
wait $HPING_PID 2>/dev/null
wait_and_check

echo "=========================================="
echo "  All Attacks Completed!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Open Monitoring tab: http://$IDS_IP:5173"
echo "2. Look for alerts with 🚨 ATTACK DETECTED badge"
echo "3. Check attack types: probe, dos, brute_force, r2l, u2r, unknown_attack"
echo ""
echo "To test individual attacks, see: KALI_ATTACK_SIMULATION.md"
echo ""

