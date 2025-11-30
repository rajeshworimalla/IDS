#!/bin/bash

# Setup script to enable packet capture without sudo
# This sets Linux capabilities on the Node.js binary

set -e

echo "========================================="
echo "Packet Capture Permissions Setup"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ This script must be run with sudo${NC}"
    echo "Run: sudo ./setup-packet-capture-permissions.sh"
    exit 1
fi

# Find Node.js binary
echo -e "${YELLOW}[1/3]${NC} Finding Node.js binary..."

# Try common locations
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
    NODE_BIN=$(which node)
    echo "   Found: $NODE_BIN"
elif [ -f "/usr/bin/node" ]; then
    NODE_BIN="/usr/bin/node"
    echo "   Found: $NODE_BIN"
elif [ -f "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
    echo "   Found: $NODE_BIN"
else
    echo -e "${RED}   ✗ Node.js not found!${NC}"
    echo "   Please install Node.js first"
    exit 1
fi

# Verify it's a real file
if [ ! -f "$NODE_BIN" ]; then
    echo -e "${RED}   ✗ Node.js binary not found at: $NODE_BIN${NC}"
    exit 1
fi

echo -e "${GREEN}   ✓ Node.js binary: $NODE_BIN${NC}"
echo ""

# Check if setcap is available
echo -e "${YELLOW}[2/3]${NC} Checking for setcap..."

if ! command -v setcap >/dev/null 2>&1; then
    echo -e "${YELLOW}   ⚠ setcap not found, installing libcap2-bin...${NC}"
    apt-get update -qq
    apt-get install -y libcap2-bin
fi

if ! command -v setcap >/dev/null 2>&1; then
    echo -e "${RED}   ✗ setcap still not available${NC}"
    exit 1
fi

echo -e "${GREEN}   ✓ setcap available${NC}"
echo ""

# Set capabilities
echo -e "${YELLOW}[3/3]${NC} Setting capabilities on Node.js binary..."

# Remove existing capabilities first (if any)
setcap -r "$NODE_BIN" 2>/dev/null || true

# Set required capabilities for packet capture
# CAP_NET_RAW: allows raw sockets (needed for packet capture)
# CAP_NET_ADMIN: allows network administration
setcap 'cap_net_raw,cap_net_admin=eip' "$NODE_BIN"

# Verify capabilities were set
CAPS=$(getcap "$NODE_BIN" 2>/dev/null || echo "")
if echo "$CAPS" | grep -q "cap_net_raw\|cap_net_admin"; then
    echo -e "${GREEN}   ✓ Capabilities set successfully${NC}"
    echo "   Capabilities: $CAPS"
else
    echo -e "${RED}   ✗ Failed to set capabilities${NC}"
    exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}✓ Setup complete!${NC}"
echo "========================================="
echo ""
echo "You can now run packet capture without sudo!"
echo ""
echo "Note: If you update Node.js, you'll need to run this script again."
echo ""

