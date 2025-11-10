#!/bin/bash

# Quick fix for MongoDB repository GPG key issue

echo "Fixing MongoDB repository issue..."

# Remove ALL MongoDB repositories
echo "Removing all MongoDB repositories..."
sudo rm -f /etc/apt/sources.list.d/mongodb-*.list 2>/dev/null
sudo rm -f /etc/apt/sources.list.d/*mongodb*.list 2>/dev/null

# Also check in sources.list file itself
if grep -q "mongodb" /etc/apt/sources.list 2>/dev/null; then
    echo "Found MongoDB in sources.list, commenting it out..."
    sudo sed -i 's|.*mongodb.*|# &|' /etc/apt/sources.list
fi

# Update package list
echo "Updating package list..."
sudo apt update

echo ""
echo "✓ MongoDB repository issue fixed!"
echo ""
echo "You can now run: ./install-all.sh"

