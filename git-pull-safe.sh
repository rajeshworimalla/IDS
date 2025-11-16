#!/bin/bash

# Hard reset git pull script - discards all local changes and resets to remote
# Use this to always match the remote repository exactly

echo "Hard resetting and updating IDS project from repository..."

cd ~/IDS || exit 1

# Fetch latest from remote
echo "Fetching latest changes from remote..."
git fetch origin main

if [ $? -ne 0 ]; then
    echo "✗ Failed to fetch from remote. Check your connection."
    exit 1
fi

# Hard reset to match remote exactly
echo "Hard resetting to match remote (discarding all local changes)..."
git reset --hard origin/main

if [ $? -eq 0 ]; then
    echo "✓ Successfully hard reset and updated!"
    echo ""
    echo "⚠ All local uncommitted changes have been discarded."
    echo "   Your repository now matches the remote exactly."
else
    echo "✗ Hard reset failed. Check the error above."
    exit 1
fi

