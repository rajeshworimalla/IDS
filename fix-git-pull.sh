#!/bin/bash
# Quick fix script to resolve git pull conflict

echo "Resolving git pull conflict..."
echo ""

# Discard local changes to startup scripts (use remote version)
git checkout -- start-demo.sh start-everything.sh

# Pull latest changes
git pull origin main

echo ""
echo "✅ Done! Latest changes pulled successfully."

