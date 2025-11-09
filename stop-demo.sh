#!/bin/bash

# Stop all IDS services

echo "Stopping IDS services..."

# Stop frontend
pkill -f "electron" >/dev/null 2>&1
pkill -f "vite" >/dev/null 2>&1

# Stop prediction service
pkill -f "prediction_service.py" >/dev/null 2>&1

# Stop backend
sudo pkill -f "node dist/index.js" >/dev/null 2>&1

# Stop Redis
sudo service redis-server stop >/dev/null 2>&1

# MongoDB will keep running (it's persistent)

echo "✓ All services stopped"
echo ""
echo "Note: MongoDB is still running (it's a persistent service)"
echo "To stop MongoDB: sudo pkill mongod"

