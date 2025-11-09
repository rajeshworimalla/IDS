#!/bin/bash

# IDS Project - Complete Startup Script
# Run this script to start everything in the correct order

echo "=== Starting IDS Project ==="
echo ""

# Step 1: Setup Firewall (create sets if they don't exist)
echo "1. Setting up firewall..."
sudo ipset -exist create ids_blocklist hash:ip family inet timeout 0
sudo ipset -exist create ids6_blocklist hash:ip family inet6 timeout 0

# Add iptables rules if they don't exist
sudo iptables -C INPUT -m set --match-set ids_blocklist src -j DROP 2>/dev/null || \
  sudo iptables -I INPUT -m set --match-set ids_blocklist src -j DROP

sudo iptables -C OUTPUT -m set --match-set ids_blocklist dst -j DROP 2>/dev/null || \
  sudo iptables -I OUTPUT -m set --match-set ids_blocklist dst -j DROP

sudo iptables -C FORWARD -m set --match-set ids_blocklist src -j DROP 2>/dev/null || \
  sudo iptables -I FORWARD -m set --match-set ids_blocklist src -j DROP

sudo iptables -C FORWARD -m set --match-set ids_blocklist dst -j DROP 2>/dev/null || \
  sudo iptables -I FORWARD -m set --match-set ids_blocklist dst -j DROP

echo "   ✅ Firewall setup complete"
echo ""

# Step 2: Check/Start MongoDB
echo "2. Checking MongoDB..."
if ps aux | grep -q "[m]ongod"; then
    echo "   ✅ MongoDB is already running"
else
    echo "   Starting MongoDB..."
    sudo mongod --fork --logpath /var/log/mongodb/mongod.log --dbpath /var/lib/mongodb
    echo "   ✅ MongoDB started"
fi
echo ""

# Step 3: Check/Start Redis
echo "3. Checking Redis..."
if ps aux | grep -q "[r]edis-server"; then
    echo "   ✅ Redis is already running"
else
    echo "   Starting Redis..."
    sudo service redis-server start
    echo "   ✅ Redis started"
fi
echo ""

# Step 4: Navigate to backend
echo "4. Starting Backend..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend" || exit 1

# Step 5: Start Backend with sudo (for firewall access)
echo "   Starting backend server..."
echo "   (Keep this terminal open!)"
echo ""
sudo npm start

