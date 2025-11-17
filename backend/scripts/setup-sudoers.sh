#!/bin/bash
# Setup script to configure sudoers for passwordless /etc/hosts modification
# Run this script ONCE with sudo to enable automatic DNS blocking

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE_HOSTS_SCRIPT="$SCRIPT_DIR/update-hosts.sh"

if [ ! -f "$UPDATE_HOSTS_SCRIPT" ]; then
  echo "Error: update-hosts.sh not found at $UPDATE_HOSTS_SCRIPT" >&2
  exit 1
fi

# Make script executable
chmod +x "$UPDATE_HOSTS_SCRIPT"

# Get current user
CURRENT_USER="${SUDO_USER:-$USER}"
if [ "$CURRENT_USER" = "root" ]; then
  echo "Error: Please run as a regular user with sudo, not as root" >&2
  exit 1
fi

echo "Setting up sudoers for user: $CURRENT_USER"
echo "Script path: $UPDATE_HOSTS_SCRIPT"

# Create sudoers entry
SUDOERS_ENTRY="$CURRENT_USER ALL=(ALL) NOPASSWD: $UPDATE_HOSTS_SCRIPT"

# Check if entry already exists
if sudo grep -q "$UPDATE_HOSTS_SCRIPT" /etc/sudoers.d/ids-hosts 2>/dev/null; then
  echo "✅ Sudoers entry already exists"
else
  # Create sudoers.d file (more secure than editing main sudoers)
  echo "$SUDOERS_ENTRY" | sudo tee /etc/sudoers.d/ids-hosts > /dev/null
  sudo chmod 0440 /etc/sudoers.d/ids-hosts
  echo "✅ Sudoers entry added successfully"
fi

# Verify the script works
echo ""
echo "Testing script..."
if sudo "$UPDATE_HOSTS_SCRIPT" add "test.example.com" 2>/dev/null; then
  sudo "$UPDATE_HOSTS_SCRIPT" remove "test.example.com" 2>/dev/null
  echo "✅ Script test passed!"
else
  echo "⚠️  Script test failed - check permissions"
  exit 1
fi

echo ""
echo "🎉 Setup complete! DNS blocking will now work automatically."
echo ""
echo "To test, try blocking a domain from the IDS interface."

