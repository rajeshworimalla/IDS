#!/bin/bash

# Test if blocking is actually working

echo "========================================="
echo "Testing Domain Blocking"
echo "========================================="
echo ""

DOMAIN="facebook.com"
echo "Testing domain: $DOMAIN"
echo ""

# Step 1: Check DNS resolution
echo "[1] DNS Resolution:"
RESOLVED_IP=$(getent hosts $DOMAIN | awk '{print $1}' | head -1)
echo "   $DOMAIN resolves to: $RESOLVED_IP"

if [ "$RESOLVED_IP" = "127.0.0.1" ]; then
    echo "   ⚠ PROBLEM: Domain resolves to localhost!"
    echo "   Check /etc/hosts:"
    grep -i "$DOMAIN" /etc/hosts 2>/dev/null || echo "   (Not found in /etc/hosts)"
    echo ""
    echo "   To fix: sudo nano /etc/hosts (remove facebook.com line)"
fi
echo ""

# Step 2: Check if IPs are in blocklist
echo "[2] Checking blocklist:"
if sudo ipset list ids_blocklist 2>/dev/null | grep -q "$RESOLVED_IP"; then
    echo "   ✓ $RESOLVED_IP is in blocklist"
else
    echo "   ✗ $RESOLVED_IP is NOT in blocklist"
    echo "   (This is why blocking isn't working)"
fi

# Check for common Facebook IPs
FACEBOOK_IPS=("157.240.24.35" "31.13.64.35" "157.240.0.0")
for ip in "${FACEBOOK_IPS[@]}"; do
    if sudo ipset list ids_blocklist 2>/dev/null | grep -q "$ip"; then
        echo "   ✓ $ip is blocked"
    fi
done
echo ""

# Step 3: Check iptables rules
echo "[3] Checking iptables rules:"
if sudo iptables -L OUTPUT -n -v | grep -q "ids_blocklist"; then
    echo "   ✓ OUTPUT rule exists for ids_blocklist"
    sudo iptables -L OUTPUT -n -v | grep "ids_blocklist" | head -1
else
    echo "   ✗ OUTPUT rule NOT found (this is why blocking doesn't work!)"
fi

if sudo iptables -L INPUT -n -v | grep -q "ids_blocklist"; then
    echo "   ✓ INPUT rule exists for ids_blocklist"
else
    echo "   ⚠ INPUT rule not found"
fi
echo ""

# Step 4: Test actual blocking
echo "[4] Testing connectivity:"
if [ "$RESOLVED_IP" != "127.0.0.1" ]; then
    echo "   Testing ping to $RESOLVED_IP..."
    if timeout 2 ping -c 1 $RESOLVED_IP >/dev/null 2>&1; then
        echo "   ✗ Ping succeeded (blocking NOT working)"
    else
        echo "   ✓ Ping blocked (blocking IS working)"
    fi
else
    echo "   ⚠ Skipping ping test (resolves to localhost)"
fi
echo ""

# Step 5: Show what's actually blocked
echo "[5] Current blocklist (first 10 IPs):"
sudo ipset list ids_blocklist 2>/dev/null | grep -E "^[0-9]" | head -10
echo ""

echo "========================================="
echo "Quick Fixes:"
echo "========================================="
echo ""
echo "If blocking isn't working:"
echo "1. Check iptables rules: sudo iptables -L OUTPUT -n -v | grep ids_blocklist"
echo "2. Re-add OUTPUT rule: sudo iptables -I OUTPUT -m set --match-set ids_blocklist dst -j DROP"
echo "3. Test: ping <blocked-ip> (should fail)"
echo ""

