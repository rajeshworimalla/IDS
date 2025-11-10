#!/bin/bash

# Quick fix for MongoDB repository GPG key issue

echo "Fixing MongoDB repository issue..."

# Remove problematic MongoDB repository
if [ -f "/etc/apt/sources.list.d/mongodb-org-6.0.list" ]; then
    echo "Removing old MongoDB repository..."
    sudo rm -f /etc/apt/sources.list.d/mongodb-org-*.list
fi

# Update package list
echo "Updating package list..."
sudo apt update

echo "✓ MongoDB repository issue fixed!"
echo ""
echo "You can now run: ./install-all.sh"

