#!/bin/bash

# Check if MongoDB/localhost IPs are blocked

echo "========================================="
echo "Checking Firewall Blocklist"
echo "========================================="
echo ""

echo "[1] Checking ipset blocklist for localhost IPs..."
echo ""

# Check IPv4 blocklist
echo "IPv4 Blocklist (ids_blocklist):"
if sudo ipset list ids_blocklist 2>/dev/null | grep -E "127\.0\.0\.1|localhost"; then
    echo "   ⚠ FOUND: 127.0.0.1 is blocked!"
    echo ""
    echo "   Removing 127.0.0.1 from blocklist..."
    sudo ipset del ids_blocklist 127.0.0.1 2>/dev/null && echo "   ✓ Removed 127.0.0.1" || echo "   (Already removed or not found)"
else
    echo "   ✓ 127.0.0.1 is NOT blocked"
fi

# Check for other localhost variants
LOCALHOST_IPS=("127.0.0.1" "::1" "localhost")
for ip in "${LOCALHOST_IPS[@]}"; do
    if sudo ipset list ids_blocklist 2>/dev/null | grep -q "$ip"; then
        echo "   ⚠ Found $ip in blocklist, removing..."
        sudo ipset del ids_blocklist "$ip" 2>/dev/null || true
    fi
done

echo ""
echo "[2] Full blocklist contents:"
echo ""
sudo ipset list ids_blocklist 2>/dev/null | head -20
echo ""

echo "[3] Checking iptables rules for localhost..."
if sudo iptables -L INPUT -n | grep -E "127\.0\.0\.1|DROP" | head -5; then
    echo "   (Check above for any DROP rules affecting localhost)"
else
    echo "   ✓ No obvious localhost blocking in iptables"
fi

echo ""
echo "[4] Testing MongoDB connection..."
if timeout 3 nc -zv 127.0.0.1 27017 >/dev/null 2>&1; then
    echo "   ✓ MongoDB port 27017 is accessible"
else
    echo "   ✗ MongoDB port 27017 is NOT accessible"
    echo ""
    echo "   Try:"
    echo "   1. Check if MongoDB is running: sudo docker ps | grep mongodb"
    echo "   2. Check MongoDB logs: sudo docker logs mongodb"
    echo "   3. Restart MongoDB: sudo docker restart mongodb"
fi

echo ""
echo "========================================="

