#!/bin/bash

# Test connectivity between Kali VM and IDS VM
# Run this on BOTH VMs to verify they can communicate

echo "=========================================="
echo "VM Connectivity Test"
echo "=========================================="
echo ""

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "📍 Your VM IP: $LOCAL_IP"
echo ""

# Test if we can reach common network ranges
echo "Testing network connectivity..."
echo ""

# Test common VM network ranges
for range in "192.168.1" "192.168.56" "10.0.2" "172.16"; do
    echo "Scanning $range.0/24..."
    for i in {1..10}; do
        IP="${range}.${i}"
        if [ "$IP" != "$LOCAL_IP" ]; then
            if ping -c 1 -W 1 "$IP" >/dev/null 2>&1; then
                echo "✅ Found reachable host: $IP"
                # Try to identify if it's the IDS server
                if curl -s --connect-timeout 2 "http://${IP}:5001" >/dev/null 2>&1; then
                    echo "   🎯 This appears to be the IDS server (port 5001 is open)!"
                fi
            fi
        fi
    done
done

echo ""
echo "=========================================="
echo "To find your IDS VM IP:"
echo "1. Run this script on IDS VM"
echo "2. Note the IP address shown"
echo "3. Use that IP in attack scripts"
echo ""
echo "To find Kali VM IP:"
echo "1. Run this script on Kali VM"
echo "2. Note the IP address shown"
echo "3. Make sure IDS VM can reach it"
echo "=========================================="

