#!/bin/bash

# Quick script to fix git merge conflicts by discarding local changes

echo "Fixing git merge conflicts..."

# First, fetch the latest changes without merging
git fetch origin main

# Discard local changes to start-demo.sh (force)
git checkout --force start-demo.sh 2>/dev/null || git checkout -- start-demo.sh

# Reset to match remote (this will discard any local commits too)
git reset --hard origin/main

echo "✅ Done! Latest changes pulled successfully."
echo ""
echo "You can now run:"
echo "   chmod +x kill-port-5001.sh"
echo "   ./kill-port-5001.sh"

