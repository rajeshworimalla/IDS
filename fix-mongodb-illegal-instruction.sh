#!/bin/bash

# Fix MongoDB Illegal Instruction Error
# This script helps resolve CPU compatibility issues with MongoDB

echo "=========================================="
echo "  MongoDB Compatibility Fix"
echo "=========================================="
echo ""

# Check CPU info
echo "Checking CPU information..."
echo "CPU Model:"
lscpu | grep "Model name"
echo ""
echo "CPU Flags:"
lscpu | grep "Flags" | head -1
echo ""

# Check architecture
ARCH=$(uname -m)
echo "Architecture: $ARCH"
echo ""

# Check MongoDB installation
echo "Checking MongoDB installation..."
which mongod
mongod --version 2>&1 | head -5 || echo "MongoDB version check failed"
echo ""

echo "=========================================="
echo "  Solutions to try:"
echo "=========================================="
echo ""
echo "Option 1: Install MongoDB from Ubuntu repositories (older but compatible)"
echo "  sudo apt remove mongodb-org mongodb mongodb-server"
echo "  sudo apt install -y mongodb"
echo ""
echo "Option 2: Use Docker to run MongoDB"
echo "  sudo apt install -y docker.io"
echo "  sudo systemctl start docker"
echo "  sudo docker run -d -p 27017:27017 --name mongodb mongo:latest"
echo ""
echo "Option 3: Install MongoDB Community Edition (different build)"
echo "  # Remove current MongoDB"
echo "  sudo apt remove mongodb-org*"
echo "  # Install from different source"
echo "  sudo apt install -y mongodb-org"
echo ""
echo "Option 4: Use MongoDB from snap (often more compatible)"
echo "  sudo snap install mongodb"
echo "  sudo snap start mongodb"
echo ""
echo "=========================================="

