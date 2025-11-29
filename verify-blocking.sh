#!/bin/bash

# Verify why blocking isn't working

echo "========================================="
echo "Verifying Blocking"
echo "========================================="
echo ""

DOMAIN="facebook.com"

# Step 1: Check what IPs facebook.com resolves to
echo "[1] DNS Resolution for $DOMAIN:"
echo "   IPv4:"
getent hosts $DOMAIN | grep -E "^\S+\s+[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | awk '{print "     " $1}'
echo "   IPv6:"
getent hosts $DOMAIN | grep -E "^\S+\s+[0-9a-fA-F:]+" | awk '{print "     " $1}'
echo ""

# Step 2: Check if those IPs are in blocklist
echo "[2] Checking if resolved IPs are blocked:"
RESOLVED_IPV4=$(getent hosts $DOMAIN | grep -oE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | head -1)
RESOLVED_IPV6=$(getent hosts $DOMAIN | grep -oE "[0-9a-fA-F:]+" | head -1)

if [ -n "$RESOLVED_IPV4" ]; then
    if sudo ipset test ids_blocklist "$RESOLVED_IPV4" 2>/dev/null; then
        echo "   ✓ IPv4 $RESOLVED_IPV4 is in blocklist"
    else
        echo "   ✗ IPv4 $RESOLVED_IPV4 is NOT in blocklist (this is the problem!)"
    fi
fi

if [ -n "$RESOLVED_IPV6" ]; then
    if sudo ipset test ids6_blocklist "$RESOLVED_IPV6" 2>/dev/null; then
        echo "   ✓ IPv6 $RESOLVED_IPV6 is in blocklist"
    else
        echo "   ✗ IPv6 $RESOLVED_IPV6 is NOT in blocklist (this is the problem!)"
    fi
fi
echo ""

# Step 3: Check iptables OUTPUT rule
echo "[3] Checking iptables OUTPUT rule:"
if sudo iptables -L OUTPUT -n --line-numbers | grep -q "ids_blocklist"; then
    echo "   ✓ OUTPUT rule exists:"
    sudo iptables -L OUTPUT -n --line-numbers | grep -B1 -A1 "ids_blocklist"
    
    # Check rule position (should be early)
    RULE_NUM=$(sudo iptables -L OUTPUT -n --line-numbers | grep "ids_blocklist" | head -1 | awk '{print $1}')
    echo "   Rule is at position: $RULE_NUM"
    if [ "$RULE_NUM" -gt 5 ]; then
        echo "   ⚠ WARNING: Rule is too far down! Other rules might allow traffic first"
        echo "   Fix: Move rule to top: sudo iptables -I OUTPUT 1 -m set --match-set ids_blocklist dst -j DROP"
    fi
else
    echo "   ✗ OUTPUT rule NOT FOUND!"
    echo "   Fix: sudo iptables -I OUTPUT -m set --match-set ids_blocklist dst -j DROP"
fi
echo ""

# Step 4: Check ip6tables OUTPUT rule
echo "[4] Checking ip6tables OUTPUT rule:"
if sudo ip6tables -L OUTPUT -n --line-numbers 2>/dev/null | grep -q "ids6_blocklist"; then
    echo "   ✓ OUTPUT rule exists:"
    sudo ip6tables -L OUTPUT -n --line-numbers 2>/dev/null | grep -B1 -A1 "ids6_blocklist"
else
    echo "   ✗ OUTPUT rule NOT FOUND!"
    echo "   Fix: sudo ip6tables -I OUTPUT -m set --match-set ids6_blocklist dst -j DROP"
fi
echo ""

# Step 5: Test actual blocking
echo "[5] Testing blocking:"
if [ -n "$RESOLVED_IPV4" ]; then
    echo "   Testing ping to $RESOLVED_IPV4..."
    if timeout 2 ping -c 1 -W 1 "$RESOLVED_IPV4" >/dev/null 2>&1; then
        echo "   ✗ Ping succeeded (blocking NOT working!)"
    else
        echo "   ✓ Ping blocked (blocking IS working)"
    fi
fi
echo ""

# Step 6: Check for conflicting rules
echo "[6] Checking for conflicting OUTPUT rules:"
echo "   All OUTPUT rules:"
sudo iptables -L OUTPUT -n --line-numbers | head -10
echo ""

echo "========================================="
echo "Quick Fixes:"
echo "========================================="
echo ""
echo "If blocking isn't working:"
echo "1. Move OUTPUT rule to top:"
echo "   sudo iptables -D OUTPUT -m set --match-set ids_blocklist dst -j DROP"
echo "   sudo iptables -I OUTPUT 1 -m set --match-set ids_blocklist dst -j DROP"
echo ""
echo "2. Ensure ip6tables rule exists:"
echo "   sudo ip6tables -I OUTPUT -m set --match-set ids6_blocklist dst -j DROP"
echo ""
echo "3. Block the actual IPs that DNS resolves to:"
if [ -n "$RESOLVED_IPV4" ]; then
    echo "   sudo ipset add ids_blocklist $RESOLVED_IPV4"
fi
if [ -n "$RESOLVED_IPV6" ]; then
    echo "   sudo ipset add ids6_blocklist $RESOLVED_IPV6"
fi
echo ""

