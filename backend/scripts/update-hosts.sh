#!/bin/bash
# Script to safely add/remove domain blocks from /etc/hosts
# Usage: sudo ./update-hosts.sh [add|remove] <domain>

set -e

ACTION="$1"
DOMAIN="$2"

if [ -z "$ACTION" ] || [ -z "$DOMAIN" ]; then
  echo "Usage: $0 [add|remove] <domain>" >&2
  exit 1
fi

if [ "$ACTION" != "add" ] && [ "$ACTION" != "remove" ]; then
  echo "Action must be 'add' or 'remove'" >&2
  exit 1
fi

HOSTS_FILE="/etc/hosts"
MARKER="# IDS_BLOCKED_DOMAINS"
NORMALIZED_DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]' | xargs)

# Create backup
cp "$HOSTS_FILE" "${HOSTS_FILE}.bak.$(date +%s)"

if [ "$ACTION" = "add" ]; then
  # Check if already blocked
  if grep -q "127.0.0.1 $NORMALIZED_DOMAIN" "$HOSTS_FILE" || grep -q "0.0.0.0 $NORMALIZED_DOMAIN" "$HOSTS_FILE"; then
    echo "Domain $NORMALIZED_DOMAIN is already blocked"
    exit 0
  fi
  
  # Find marker or add at end
  if grep -q "$MARKER" "$HOSTS_FILE"; then
    # Insert after marker
    sed -i "/$MARKER/a 127.0.0.1 $NORMALIZED_DOMAIN\n0.0.0.0 $NORMALIZED_DOMAIN" "$HOSTS_FILE"
  else
    # Add marker and domain at end
    echo "" >> "$HOSTS_FILE"
    echo "$MARKER" >> "$HOSTS_FILE"
    echo "127.0.0.1 $NORMALIZED_DOMAIN" >> "$HOSTS_FILE"
    echo "0.0.0.0 $NORMALIZED_DOMAIN" >> "$HOSTS_FILE"
  fi
  echo "Added $NORMALIZED_DOMAIN to $HOSTS_FILE"
  
elif [ "$ACTION" = "remove" ]; then
  # Remove lines containing this domain
  sed -i "/127.0.0.1 $NORMALIZED_DOMAIN/d" "$HOSTS_FILE"
  sed -i "/0.0.0.0 $NORMALIZED_DOMAIN/d" "$HOSTS_FILE"
  echo "Removed $NORMALIZED_DOMAIN from $HOSTS_FILE"
fi

# Clean up empty marker section if no domains left
if grep -q "$MARKER" "$HOSTS_FILE"; then
  # Check if there are any blocked domains after the marker
  MARKER_LINE=$(grep -n "$MARKER" "$HOSTS_FILE" | cut -d: -f1)
  NEXT_NON_EMPTY=$(tail -n +$((MARKER_LINE + 1)) "$HOSTS_FILE" | grep -n -v "^$" | head -1 | cut -d: -f1)
  if [ -z "$NEXT_NON_EMPTY" ] || ! tail -n +$((MARKER_LINE + 1)) "$HOSTS_FILE" | head -n $NEXT_NON_EMPTY | grep -q "127.0.0.1\|0.0.0.0"; then
    # No blocked domains, remove marker and blank line
    sed -i "/$MARKER/d" "$HOSTS_FILE"
    # Remove trailing blank lines
    sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$HOSTS_FILE"
  fi
fi

exit 0

