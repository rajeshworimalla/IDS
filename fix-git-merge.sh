#!/bin/bash

# Quick script to fix git merge conflicts by discarding local changes

echo "Fixing git merge conflicts..."

# Discard local changes to start-demo.sh
git checkout -- start-demo.sh

# Now pull the latest changes
git pull origin main

echo "✅ Done! You can now run:"
echo "   chmod +x kill-port-5001.sh"
echo "   ./kill-port-5001.sh"

