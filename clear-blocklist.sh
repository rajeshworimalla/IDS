#!/bin/bash

echo "========================================="
echo "IDS Blocklist Clearing Script"
echo "========================================="

# 1. Check current blocklist
echo ""
echo "[1/5] Checking current ipset blocklist..."
if sudo ipset list ids_blocklist &>/dev/null; then
    COUNT=$(sudo ipset list ids_blocklist | grep -c "^[0-9]" || echo "0")
    echo "   Found $COUNT IPs in blocklist"
    if [ "$COUNT" -gt 0 ]; then
        echo "   Current IPs:"
        sudo ipset list ids_blocklist | grep "^[0-9]" | head -10
    fi
else
    echo "   ipset blocklist 'ids_blocklist' does not exist"
fi

# 2. Clear ipset blocklist
echo ""
echo "[2/5] Clearing ipset blocklist..."
if sudo ipset list ids_blocklist &>/dev/null; then
    # Flush all entries
    sudo ipset flush ids_blocklist
    echo "   ✓ ipset blocklist cleared"
else
    echo "   ⚠ ipset blocklist 'ids_blocklist' does not exist (nothing to clear)"
fi

# 3. Check and remove iptables rules
echo ""
echo "[3/5] Checking iptables rules..."
INPUT_RULES=$(sudo iptables -L INPUT -n --line-numbers | grep -c "ids_blocklist" || echo "0")
OUTPUT_RULES=$(sudo iptables -L OUTPUT -n --line-numbers | grep -c "ids_blocklist" || echo "0")
FORWARD_RULES=$(sudo iptables -L FORWARD -n --line-numbers | grep -c "ids_blocklist" || echo "0")

echo "   Found $INPUT_RULES INPUT rules, $OUTPUT_RULES OUTPUT rules, $FORWARD_RULES FORWARD rules"

if [ "$INPUT_RULES" -gt 0 ] || [ "$OUTPUT_RULES" -gt 0 ] || [ "$FORWARD_RULES" -gt 0 ]; then
    # Remove INPUT rules (in reverse order to preserve line numbers)
    while sudo iptables -L INPUT -n --line-numbers | grep -q "ids_blocklist"; do
        LINE=$(sudo iptables -L INPUT -n --line-numbers | grep "ids_blocklist" | head -1 | awk '{print $1}')
        sudo iptables -D INPUT $LINE 2>/dev/null
    done
    
    # Remove OUTPUT rules
    while sudo iptables -L OUTPUT -n --line-numbers | grep -q "ids_blocklist"; do
        LINE=$(sudo iptables -L OUTPUT -n --line-numbers | grep "ids_blocklist" | head -1 | awk '{print $1}')
        sudo iptables -D OUTPUT $LINE 2>/dev/null
    done
    
    # Remove FORWARD rules
    while sudo iptables -L FORWARD -n --line-numbers | grep -q "ids_blocklist"; do
        LINE=$(sudo iptables -L FORWARD -n --line-numbers | grep "ids_blocklist" | head -1 | awk '{print $1}')
        sudo iptables -D FORWARD $LINE 2>/dev/null
    done
    
    echo "   ✓ iptables rules removed"
else
    echo "   ⚠ No iptables rules found (nothing to remove)"
fi

# 4. Clear Redis temporary bans
echo ""
echo "[4/5] Clearing Redis temporary bans..."
if command -v redis-cli &>/dev/null; then
    TEMP_BANS=$(redis-cli KEYS "temp_ban:*" 2>/dev/null | wc -l)
    if [ "$TEMP_BANS" -gt 0 ]; then
        echo "   Found $TEMP_BANS temporary bans in Redis"
        redis-cli --scan --pattern "temp_ban:*" | xargs -r redis-cli DEL 2>/dev/null
        echo "   ✓ Redis temporary bans cleared"
    else
        echo "   ⚠ No temporary bans in Redis"
    fi
else
    echo "   ⚠ redis-cli not found, skipping Redis cleanup"
fi

# 5. Check MongoDB manual blocks (informational only - don't delete)
echo ""
echo "[5/5] Checking MongoDB manual blocks..."
if command -v mongosh &>/dev/null; then
    MANUAL_BLOCKS=$(mongosh ids --quiet --eval "db.blockedips.countDocuments({})" 2>/dev/null || echo "0")
    echo "   Found $MANUAL_BLOCKS manual blocks in MongoDB"
    echo "   ⚠ Manual blocks are NOT deleted (use the UI to unblock if needed)"
elif command -v mongo &>/dev/null; then
    MANUAL_BLOCKS=$(mongo ids --quiet --eval "db.blockedips.countDocuments({})" 2>/dev/null || echo "0")
    echo "   Found $MANUAL_BLOCKS manual blocks in MongoDB"
    echo "   ⚠ Manual blocks are NOT deleted (use the UI to unblock if needed)"
else
    echo "   ⚠ MongoDB client not found, skipping check"
fi

echo ""
echo "========================================="
echo "✓ Blocklist clearing complete!"
echo "========================================="
echo ""
echo "Note: Manual blocks in MongoDB were NOT deleted."
echo "      Use the IDS UI to unblock manually blocked IPs if needed."

