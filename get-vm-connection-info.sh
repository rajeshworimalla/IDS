#!/bin/bash

# Get VM connection info for MongoDB Compass

echo "=========================================="
echo "  MongoDB Compass Connection Info"
echo "=========================================="
echo ""

# Get all IP addresses
echo "Your VM IP Addresses:"
hostname -I
echo ""

# Get primary IP
VM_IP=$(hostname -I | awk '{print $1}')
echo "Primary IP: $VM_IP"
echo ""

# Check MongoDB status
echo "MongoDB Status:"
if sudo docker ps | grep -q mongodb; then
    echo "  ✓ MongoDB is running"
    echo ""
    echo "Connection strings for MongoDB Compass:"
    echo ""
    echo "Option 1 - Direct connection (if on same network):"
    echo "  mongodb://$VM_IP:27017/ids"
    echo ""
    echo "Option 2 - SSH Tunnel (more reliable):"
    echo "  1. On Windows PowerShell, run:"
    echo "     ssh -L 27017:localhost:27017 mausham04@$VM_IP"
    echo ""
    echo "  2. Then in MongoDB Compass, connect to:"
    echo "     mongodb://localhost:27017/ids"
    echo ""
else
    echo "  ✗ MongoDB is not running"
    echo "  Start it with: sudo docker start mongodb"
fi

echo ""
echo "=========================================="
echo "  Network Info"
echo "=========================================="
echo ""
echo "All network interfaces:"
ip addr show | grep "inet " | grep -v "127.0.0.1"
echo ""

echo "Firewall status:"
sudo ufw status | head -5
echo ""

echo "MongoDB port status:"
ss -tlnp | grep 27017 || echo "  Port 27017 not listening"
echo ""

