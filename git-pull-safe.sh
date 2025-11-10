#!/bin/bash

# Safe git pull script - automatically handles conflicts
# Use this instead of regular git pull

echo "Updating IDS project from repository..."

cd ~/IDS || exit 1

# Check if there are local changes
if ! git diff --quiet start-demo.sh 2>/dev/null; then
    echo "⚠ Local changes detected in start-demo.sh"
    echo "   Discarding local changes and pulling latest version..."
    git checkout -- start-demo.sh
fi

# Check for other uncommitted changes
if ! git diff --quiet; then
    echo "⚠ Other uncommitted changes detected"
    echo "   Stashing them..."
    git stash push -m "Auto-stash before pull $(date +%Y-%m-%d_%H:%M:%S)"
fi

# Pull latest changes
echo "Pulling latest changes..."
git pull

if [ $? -eq 0 ]; then
    echo "✓ Successfully updated!"
    echo ""
    echo "To see stashed changes (if any): git stash list"
    echo "To restore stashed changes: git stash pop"
else
    echo "✗ Pull failed. Check the error above."
    exit 1
fi

