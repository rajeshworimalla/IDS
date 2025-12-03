#!/bin/bash

# Quick script to start just the demo site in VM/WSL

echo "=========================================="
echo "  Starting IDS Demo Site"
echo "=========================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Navigate to demo-site directory
cd "$SCRIPT_DIR/demo-site" || exit 1

# Kill any existing demo site server
pkill -f "python.*http.server.*8080" >/dev/null 2>&1
sleep 1

# Get VM/WSL IP address
VM_IP=$(hostname -I | awk '{print $1}')
DEMO_PORT=8080

echo "Starting demo site HTTP server on port $DEMO_PORT..."
python3 -m http.server $DEMO_PORT > /tmp/ids-demo-site.log 2>&1 &
DEMO_PID=$!
sleep 2

if ps -p $DEMO_PID > /dev/null; then
    echo "✅ Demo site started (PID: $DEMO_PID)"
    echo ""
    echo "Access the demo site at:"
    echo "  • http://localhost:$DEMO_PORT"
    echo "  • http://$VM_IP:$DEMO_PORT"
    echo ""
    echo "From Windows browser (if using WSL):"
    echo "  • http://$VM_IP:$DEMO_PORT"
    echo ""
    echo "Logs: tail -f /tmp/ids-demo-site.log"
    echo ""
    echo "To stop: pkill -f 'python.*http.server.*8080'"
else
    echo "❌ Demo site failed to start"
    echo "Check logs: cat /tmp/ids-demo-site.log"
    exit 1
fi

