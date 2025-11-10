#!/bin/bash

# IDS Project - Complete Installation Script
# This script installs all dependencies and sets up the entire project

set -e  # Exit on error

echo "=========================================="
echo "  IDS Project - Complete Installation"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Fix MongoDB repository issues (if any)
echo -e "${YELLOW}[1/9]${NC} Checking for repository issues..."
# Remove ALL MongoDB repositories (they cause GPG key issues)
echo "   Removing any existing MongoDB repositories..."
sudo rm -f /etc/apt/sources.list.d/mongodb-*.list 2>/dev/null
sudo rm -f /etc/apt/sources.list.d/*mongodb*.list 2>/dev/null
# Also check in sources.list file itself
if grep -q "mongodb" /etc/apt/sources.list 2>/dev/null; then
    echo "   Found MongoDB in sources.list, commenting it out..."
    sudo sed -i 's|.*mongodb.*|# &|' /etc/apt/sources.list
fi
echo "   ✓ MongoDB repositories removed"
echo ""

# Step 2: Update system packages
echo -e "${YELLOW}[2/9]${NC} Updating system packages..."
sudo apt update
echo -e "${GREEN}   ✓ System updated${NC}"
echo ""

# Step 3: Install system dependencies
echo -e "${YELLOW}[3/9]${NC} Installing system dependencies..."

# Install Python and pip
if ! command_exists python3; then
    echo "   Installing Python3..."
    sudo apt install -y python3 python3-pip python3-venv
else
    echo -e "${GREEN}   ✓ Python3 already installed: $(python3 --version)${NC}"
fi

# Install Node.js (if not installed)
if ! command_exists node; then
    echo "   Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo -e "${GREEN}   ✓ Node.js already installed: $(node --version)${NC}"
fi

# Install MongoDB
if ! command_exists mongod; then
    echo "   Installing MongoDB..."
    # Ensure MongoDB repository is removed before installation
    sudo rm -f /etc/apt/sources.list.d/mongodb-*.list 2>/dev/null
    sudo rm -f /etc/apt/sources.list.d/*mongodb*.list 2>/dev/null
    
    # Try multiple installation methods
    MONGODB_INSTALLED=false
    
    # Method 1: Try Ubuntu repositories (mongodb package)
    if sudo apt install -y mongodb 2>/dev/null; then
        echo -e "${GREEN}   ✓ MongoDB installed from Ubuntu repositories${NC}"
        MONGODB_INSTALLED=true
    # Method 2: Try mongodb-server package
    elif sudo apt install -y mongodb-server 2>/dev/null; then
        echo -e "${GREEN}   ✓ MongoDB installed (mongodb-server package)${NC}"
        MONGODB_INSTALLED=true
    # Method 3: Try official MongoDB repository
    else
        echo "   Setting up official MongoDB repository..."
        # Get Ubuntu version
        UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null || echo "noble")
        
        # Add MongoDB GPG key
        curl -fsSL https://pgp.mongodb.com/server-6.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-6.0.gpg --dearmor
        
        # Add MongoDB repository for correct Ubuntu version
        echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${UBUNTU_CODENAME}/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
        
        sudo apt update
        if sudo apt install -y mongodb-org 2>/dev/null; then
            echo -e "${GREEN}   ✓ MongoDB installed from official repository${NC}"
            MONGODB_INSTALLED=true
        fi
    fi
    
    if [ "$MONGODB_INSTALLED" = true ] && command_exists mongod; then
        # Create necessary directories
        sudo mkdir -p /var/lib/mongodb
        sudo mkdir -p /var/log/mongodb
        sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb 2>/dev/null || \
            sudo chown -R $USER:$USER /var/lib/mongodb /var/log/mongodb 2>/dev/null || true
        
        # Create systemd service file if it doesn't exist
        if [ ! -f "/etc/systemd/system/mongodb.service" ] && [ ! -f "/lib/systemd/system/mongodb.service" ]; then
            echo "   Creating MongoDB systemd service..."
            sudo tee /etc/systemd/system/mongodb.service > /dev/null <<EOF
[Unit]
Description=MongoDB Database Server
Documentation=https://docs.mongodb.org/manual
After=network.target

[Service]
User=mongodb
Group=mongodb
ExecStart=/usr/bin/mongod --config /etc/mongod.conf
PIDFile=/var/lib/mongodb/mongod.lock
Type=forking
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
            sudo systemctl daemon-reload
        fi
    fi
else
    echo -e "${GREEN}   ✓ MongoDB already installed${NC}"
fi

# Install Redis (this is what you need!)
echo "   Installing Redis..."
if ! command_exists redis-server; then
    sudo apt install -y redis-server
    # Configure Redis to start on boot
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    echo -e "${GREEN}   ✓ Redis installed and started${NC}"
else
    echo -e "${GREEN}   ✓ Redis already installed${NC}"
    # Make sure Redis is running
    if ! pgrep -x "redis-server" > /dev/null; then
        echo "   Starting Redis server..."
        sudo systemctl start redis-server
        sudo systemctl enable redis-server
    fi
    echo -e "${GREEN}   ✓ Redis is running${NC}"
fi

# Install ipset (for firewall)
if ! command_exists ipset; then
    echo "   Installing ipset..."
    sudo apt install -y ipset
else
    echo -e "${GREEN}   ✓ ipset already installed${NC}"
fi

# Install build tools
echo "   Installing build tools..."
sudo apt install -y build-essential python3-dev git curl
echo -e "${GREEN}   ✓ Build tools installed${NC}"
echo ""

# Step 4: Verify Redis is working
echo -e "${YELLOW}[4/9]${NC} Verifying Redis..."
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}   ✓ Redis is responding${NC}"
else
    echo -e "${RED}   ✗ Redis is not responding. Starting it...${NC}"
    sudo systemctl restart redis-server
    sleep 2
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Redis is now responding${NC}"
    else
        echo -e "${RED}   ✗ Redis failed to start. Please check manually.${NC}"
        echo "   Try: sudo systemctl status redis-server"
    fi
fi
echo ""

# Step 5: Set up Python prediction service
echo -e "${YELLOW}[5/9]${NC} Setting up Python prediction service..."
if [ -f "setup-prediction-vm.sh" ]; then
    chmod +x setup-prediction-vm.sh
    ./setup-prediction-vm.sh
else
    echo "   Running manual Python setup..."
    cd backend
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi
    
    # Activate and install dependencies
    source venv/bin/activate
    pip install --upgrade pip --quiet
    pip install -r requirements.txt
    deactivate
    
    cd ..
    echo -e "${GREEN}   ✓ Python environment set up${NC}"
fi
echo ""

# Step 6: Install backend Node.js dependencies
echo -e "${YELLOW}[6/9]${NC} Installing backend dependencies..."
cd backend
if [ ! -d "node_modules" ]; then
    echo "   Running npm install..."
    npm install
else
    echo "   node_modules exists, running npm install to update..."
    npm install
fi

# Build backend
echo "   Building backend..."
npm run build
echo -e "${GREEN}   ✓ Backend dependencies installed and built${NC}"
cd ..
echo ""

# Step 7: Install frontend Node.js dependencies
echo -e "${YELLOW}[7/9]${NC} Installing frontend dependencies..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "   Running npm install..."
    npm install
else
    echo "   node_modules exists, running npm install to update..."
    npm install
fi
echo -e "${GREEN}   ✓ Frontend dependencies installed${NC}"
cd ..
echo ""

# Step 8: Set up firewall rules
echo -e "${YELLOW}[8/9]${NC} Setting up firewall rules..."
sudo ipset -exist create ids_blocklist hash:ip family inet timeout 0
sudo ipset -exist create ids6_blocklist hash:ip family inet6 timeout 0

# Add iptables rules if they don't exist
sudo iptables -C INPUT -m set --match-set ids_blocklist src -j DROP 2>/dev/null || \
  sudo iptables -I INPUT -m set --match-set ids_blocklist src -j DROP

sudo iptables -C OUTPUT -m set --match-set ids_blocklist dst -j DROP 2>/dev/null || \
  sudo iptables -I OUTPUT -m set --match-set ids_blocklist dst -j DROP

echo -e "${GREEN}   ✓ Firewall rules configured${NC}"
echo ""

# Step 9: Start MongoDB if not running
echo -e "${YELLOW}[9/9]${NC} Checking MongoDB..."
if pgrep -x "mongod" > /dev/null; then
    echo -e "${GREEN}   ✓ MongoDB is already running${NC}"
elif command_exists mongod; then
    echo "   Starting MongoDB service..."
    # Ensure directories exist
    sudo mkdir -p /var/lib/mongodb
    sudo mkdir -p /var/log/mongodb
    sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb 2>/dev/null || \
        sudo chown -R $USER:$USER /var/lib/mongodb /var/log/mongodb 2>/dev/null || true
    
    # Try different service names
    MONGODB_STARTED=false
    
    # Try systemctl with different service names
    for service_name in mongodb mongod mongodb-server; do
        if sudo systemctl start "$service_name" 2>/dev/null; then
            echo -e "${GREEN}   ✓ MongoDB started via systemctl ($service_name)${NC}"
            sudo systemctl enable "$service_name" 2>/dev/null || true
            MONGODB_STARTED=true
            break
        fi
    done
    
    # If systemctl didn't work, try starting manually
    if [ "$MONGODB_STARTED" = false ]; then
        echo "   Attempting to start MongoDB manually..."
        # Try with different user options
        if sudo -u mongodb mongod --fork --logpath /var/log/mongodb/mongod.log --dbpath /var/lib/mongodb 2>/dev/null; then
            echo -e "${GREEN}   ✓ MongoDB started manually (as mongodb user)${NC}"
            MONGODB_STARTED=true
        elif mongod --fork --logpath /var/log/mongodb/mongod.log --dbpath /var/lib/mongodb 2>/dev/null; then
            echo -e "${GREEN}   ✓ MongoDB started manually${NC}"
            MONGODB_STARTED=true
        else
            echo -e "${YELLOW}   ⚠ MongoDB installed but couldn't start automatically${NC}"
            echo "   Troubleshooting steps:"
            echo "   1. Check MongoDB binary: which mongod"
            echo "   2. Check CPU compatibility: lscpu"
            echo "   3. Try manual start: sudo mongod --dbpath /var/lib/mongodb"
            echo "   4. Check logs: cat /var/log/mongodb/mongod.log"
        fi
    fi
else
    echo -e "${YELLOW}   ⚠ MongoDB not installed${NC}"
    echo "   MongoDB installation may have failed. You can install it manually later if needed."
fi
echo ""

# Final verification
echo "=========================================="
echo -e "${GREEN}  Installation Complete!${NC}"
echo "=========================================="
echo ""
echo "Verification:"
echo ""

# Check all services
echo -e "${BLUE}Checking services...${NC}"

# Redis
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Redis: Running${NC}"
else
    echo -e "${RED}  ✗ Redis: Not running${NC}"
fi

# MongoDB
if pgrep -x "mongod" > /dev/null; then
    echo -e "${GREEN}  ✓ MongoDB: Running${NC}"
else
    echo -e "${RED}  ✗ MongoDB: Not running${NC}"
fi

# Python venv
if [ -d "backend/venv" ]; then
    echo -e "${GREEN}  ✓ Python venv: Created${NC}"
else
    echo -e "${RED}  ✗ Python venv: Missing${NC}"
fi

# Node modules
if [ -d "backend/node_modules" ]; then
    echo -e "${GREEN}  ✓ Backend dependencies: Installed${NC}"
else
    echo -e "${RED}  ✗ Backend dependencies: Missing${NC}"
fi

if [ -d "frontend/node_modules" ]; then
    echo -e "${GREEN}  ✓ Frontend dependencies: Installed${NC}"
else
    echo -e "${RED}  ✗ Frontend dependencies: Missing${NC}"
fi

# Model files
if [ -f "backend/binary_attack_model.pkl" ] && [ -f "backend/multiclass_attack_model.pkl" ]; then
    echo -e "${GREEN}  ✓ ML Models: Found${NC}"
else
    echo -e "${YELLOW}  ⚠ ML Models: Not found (may need to add manually)${NC}"
fi

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo ""
echo "1. Start all services:"
echo "   ./start-everything.sh"
echo ""
echo "2. Or start manually:"
echo "   cd backend && npm start"
echo "   cd backend && source venv/bin/activate && python3 prediction_service.py"
echo "   cd frontend && npm run dev"
echo ""
echo "3. Test Redis connection:"
echo "   redis-cli ping"
echo ""
echo "4. View logs:"
echo "   tail -f /tmp/ids-*.log"
echo ""
echo "=========================================="

