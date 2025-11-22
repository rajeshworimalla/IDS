#!/bin/bash

# Quick script to kill any process using port 5001

echo "Killing processes on port 5001..."

# Method 1: Use lsof to find and kill
if command -v lsof >/dev/null 2>&1; then
    PIDS=$(sudo lsof -ti:5001 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo "Found processes: $PIDS"
        sudo kill -9 $PIDS 2>/dev/null
        echo "✓ Killed processes using port 5001"
    else
        echo "No processes found on port 5001"
    fi
fi

# Method 2: Kill by process name (more aggressive)
pkill -9 -f "node.*dist/index.js" 2>/dev/null || true
pkill -9 -f "node.*index.js" 2>/dev/null || true

# Method 3: Use fuser if available
if command -v fuser >/dev/null 2>&1; then
    sudo fuser -k 5001/tcp 2>/dev/null || true
fi

sleep 1

# Verify port is free
if command -v lsof >/dev/null 2>&1; then
    if sudo lsof -ti:5001 >/dev/null 2>&1; then
        echo "⚠ Port 5001 is still in use. Trying more aggressive kill..."
        sudo lsof -ti:5001 | xargs sudo kill -9 2>/dev/null || true
        sleep 1
    fi
    
    if ! sudo lsof -ti:5001 >/dev/null 2>&1; then
        echo "✅ Port 5001 is now free"
    else
        echo "❌ Port 5001 is still in use. You may need to manually check:"
        echo "   sudo lsof -i:5001"
    fi
fi

