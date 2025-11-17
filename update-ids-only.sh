#!/bin/bash
# Update IDS Server - Pull Only Essential Files
# Run this on your Ubuntu IDS server

echo "=========================================="
echo "  Updating IDS Server - Essential Files Only"
echo "=========================================="
echo ""

# Navigate to IDS directory
cd ~/Desktop/capstone/Firewall/IDS 2>/dev/null || cd ~/IDS 2>/dev/null || {
    echo "ERROR: Cannot find IDS directory"
    echo "Please navigate to your IDS directory first"
    exit 1
}

echo "[*] Current directory: $(pwd)"
echo ""

# Pull latest changes
echo "[1/3] Pulling latest changes from GitHub..."
git pull origin main

if [ $? -ne 0 ]; then
    echo "ERROR: Git pull failed"
    exit 1
fi

echo ""
echo "[2/3] Essential files updated:"
echo "  ✓ backend/attack_detectors.py (6 attack type detectors)"
echo "  ✓ backend/prediction_service.py (enhanced ML predictions)"
echo "  ✓ backend/port_scan_detector.py (port scan detection)"
echo "  ✓ backend/src/routes/packets.ts (alert formatting)"
echo ""

# Rebuild backend
echo "[3/3] Rebuilding backend..."
cd backend
npm run build

if [ $? -ne 0 ]; then
    echo "ERROR: Backend build failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "  Update Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Restart services: ./start-and-verify.sh"
echo "2. Check logs: tail -f /tmp/ids-prediction.log"
echo ""
echo "The IDS now detects 6 attack types:"
echo "  - DoS, Probe, R2L, U2R, Brute Force, Unknown"
echo ""

