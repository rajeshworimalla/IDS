#!/bin/bash

# Script to verify if domain blocking is actually working

echo "========================================="
echo "Domain Blocking Verification"
echo "========================================="
echo ""

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <domain_or_ip>"
    echo "Example: $0 facebook.com"
    echo "Example: $0 31.13.64.35"
    exit 1
fi

TARGET=$1

echo "Checking blocking for: $TARGET"
echo ""

# Resolve domain to IPs if it's a domain
if [[ ! $TARGET =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "[1/5] Resolving domain to IPs..."
    IPS=$(getent hosts $TARGET | awk '{print $1}' | sort -u)
    if [ -z "$IPS" ]; then
        echo "   ✗ Could not resolve $TARGET"
        exit 1
    fi
    echo "   ✓ Resolved to: $IPS"
    FIRST_IP=$(echo $IPS | awk '{print $1}')
else
    IPS=$TARGET
    FIRST_IP=$TARGET
fi

echo ""
echo "[2/5] Checking if IPs are in ipset blocklist..."
for IP in $IPS; do
    if sudo ipset list ids_blocklist | grep -q "$IP"; then
        echo "   ✓ $IP is in ids_blocklist"
    else
        echo "   ✗ $IP is NOT in ids_blocklist"
    fi
done

echo ""
echo "[3/5] Checking iptables OUTPUT rules..."
OUTPUT_RULES=$(sudo iptables -L OUTPUT -n --line-numbers | grep -E "ids_blocklist|$FIRST_IP")
if [ -n "$OUTPUT_RULES" ]; then
    echo "   ✓ Found OUTPUT rules:"
    echo "$OUTPUT_RULES" | while read line; do
        echo "     $line"
    done
else
    echo "   ✗ No OUTPUT rules found for $FIRST_IP or ids_blocklist"
fi

echo ""
echo "[4/5] Checking OUTPUT chain order (first 5 rules)..."
sudo iptables -L OUTPUT -n --line-numbers | head -6
echo ""

echo "[5/5] Testing connectivity..."
echo "   Testing ping to $FIRST_IP..."
if ping -c 1 -W 2 $FIRST_IP >/dev/null 2>&1; then
    echo "   ✗ PING SUCCEEDED - Blocking is NOT working!"
    echo "   ⚠ The IP should be blocked but ping went through"
else
    echo "   ✓ PING BLOCKED - Blocking is working!"
fi

echo ""
echo "========================================="
echo "Summary"
echo "========================================="
echo ""
echo "If ping succeeded but IP is in blocklist:"
echo "  1. Check if OUTPUT rule is at position 1"
echo "  2. Check if backend is running with sudo"
echo "  3. Try: sudo iptables -I OUTPUT 1 -d $FIRST_IP -j DROP"
echo ""
echo "To check all blocked IPs:"
echo "  sudo ipset list ids_blocklist"
echo ""
echo "To check OUTPUT rules:"
echo "  sudo iptables -L OUTPUT -n --line-numbers"
