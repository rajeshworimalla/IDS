#!/bin/bash

# Setup MongoDB to auto-start on VM boot
# This ensures MongoDB is always available for the backend

echo "=========================================="
echo "  MongoDB Auto-Start Setup"
echo "=========================================="
echo ""

# Create systemd service for MongoDB Docker container
echo "Creating systemd service for MongoDB..."

sudo tee /etc/systemd/system/mongodb-docker.service > /dev/null <<EOF
[Unit]
Description=MongoDB Docker Container
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/docker start mongodb
ExecStop=/usr/bin/docker stop mongodb
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable the service
sudo systemctl enable mongodb-docker.service

# Start it now
sudo systemctl start mongodb-docker.service

# Check status
echo ""
echo "Checking MongoDB status..."
sudo systemctl status mongodb-docker.service --no-pager -l

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "MongoDB will now:"
echo "  ✓ Start automatically when VM boots"
echo "  ✓ Restart if it crashes"
echo "  ✓ Be available at: mongodb://127.0.0.1:27017/ids"
echo ""
echo "Your backend connects to: mongodb://127.0.0.1:27017/ids"
echo "This will always work because it's localhost (same machine)"
echo ""
echo "To check MongoDB status:"
echo "  sudo systemctl status mongodb-docker.service"
echo ""
echo "To view MongoDB logs:"
echo "  sudo docker logs mongodb"
echo ""

