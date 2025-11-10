#!/bin/bash

# Setup MongoDB Compass Connection
# This script configures MongoDB to be accessible from MongoDB Compass

echo "=========================================="
echo "  MongoDB Compass Setup"
echo "=========================================="
echo ""

# Get VM IP address
VM_IP=$(hostname -I | awk '{print $1}')
echo "Your VM IP address: $VM_IP"
echo ""

# Check if MongoDB is running in Docker
if sudo docker ps | grep -q mongodb; then
    echo "✓ MongoDB is running in Docker"
    echo ""
    echo "MongoDB is already accessible from network (Docker exposes port 27017)"
    echo ""
    echo "Connection string for MongoDB Compass:"
    echo "  mongodb://$VM_IP:27017/ids"
    echo ""
else
    echo "⚠ MongoDB doesn't appear to be running in Docker"
    echo "  Start it with: sudo docker start mongodb"
    echo ""
fi

# Check firewall
echo "Checking firewall..."
if sudo ufw status | grep -q "Status: active"; then
    echo "  Firewall is active, checking MongoDB port..."
    if sudo ufw status | grep -q "27017"; then
        echo "  ✓ Port 27017 is allowed"
    else
        echo "  ⚠ Port 27017 might be blocked"
        echo "  Allow it with: sudo ufw allow 27017/tcp"
    fi
else
    echo "  Firewall is not active (or using iptables)"
fi

echo ""
echo "=========================================="
echo "  Next Steps:"
echo "=========================================="
echo ""
echo "1. On Windows, download MongoDB Compass:"
echo "   https://www.mongodb.com/try/download/compass"
echo ""
echo "2. Install MongoDB Compass on Windows"
echo ""
echo "3. Open MongoDB Compass and connect using:"
echo "   mongodb://$VM_IP:27017/ids"
echo ""
echo "4. To view blocked IPs, navigate to:"
echo "   Database: ids"
echo "   Collection: blockedips"
echo ""
echo "=========================================="

