#!/bin/bash

# IDS Attack Scripts - Designed to trigger IDS detection
# Run these from Kali Linux or Attacker VM

TARGET="${1:-192.168.100.4}"  # Default IDS server IP
PORT="${2:-5001}"              # Default backend port

echo "=========================================="
echo "IDS Attack Scripts"
echo "Target: $TARGET"
echo "Port: $PORT"
echo "=========================================="
echo ""
echo "⚠️  IMPORTANT: Make sure you set the correct IDS VM IP!"
echo "   Run: ./attack_scripts.sh <IDS_VM_IP>"
echo "   Or edit the script to set TARGET variable"
echo ""

# Function to check if target is reachable
check_target() {
    echo "Testing connectivity to $TARGET..."
    if ! ping -c 3 -W 2 $TARGET >/dev/null 2>&1; then
        echo ""
        echo "❌ ERROR: Cannot reach $TARGET"
        echo ""
        echo "Troubleshooting:"
        echo "1. Make sure both VMs are on the same network"
        echo "2. Check IDS VM IP: Run 'hostname -I' on IDS VM"
        echo "3. Try: ping <IDS_VM_IP> from this VM"
        echo "4. Check firewall: sudo ufw status"
        echo ""
        exit 1
    fi
    echo "✅ Target $TARGET is reachable"
    echo ""
}

# Attack 1: Port Scan (Detected as "probe" or "port_scan")
attack_port_scan() {
    echo ""
    echo "=========================================="
    echo "ATTACK 1: Port Scan (Should trigger 'port_scan' detection)"
    echo "=========================================="
    echo "Scanning ports 1-100 on $TARGET..."
    echo "This should be detected as a port scan attack"
    echo "Watch the IDS dashboard - you should see alerts IMMEDIATELY!"
    echo ""
    
    # Fast scan to trigger detection quickly
    nmap -p 1-100 -T5 $TARGET 2>&1
    
    echo ""
    echo "✅ Port scan complete. Check IDS dashboard NOW for 'port_scan' detection."
    echo "   You should see alerts in the Security Alerts page and Dashboard!"
    echo ""
}

# Attack 2: SYN Flood (Detected as "dos" or "ddos")
attack_syn_flood() {
    echo ""
    echo "=========================================="
    echo "ATTACK 2: SYN Flood (Should trigger 'dos' detection)"
    echo "=========================================="
    echo "Starting SYN flood on $TARGET:$PORT..."
    echo "This should be detected as DoS attack IMMEDIATELY"
    echo "Watch the IDS dashboard - alerts should appear in real-time!"
    echo "Press Ctrl+C to stop after 30 seconds"
    echo ""
    
    timeout 30 hping3 -S -p $PORT --flood $TARGET 2>/dev/null || true
    
    echo ""
    echo "✅ SYN flood complete. Check IDS dashboard for 'dos' detection."
    echo ""
}

# Attack 3: HTTP Flood (Detected as "dos" or "ddos")
attack_http_flood() {
    echo ""
    echo "=========================================="
    echo "ATTACK 3: HTTP Flood (Should trigger 'dos' detection)"
    echo "=========================================="
    echo "Sending 2000 HTTP requests to $TARGET:$PORT..."
    echo "This should be detected as DoS attack"
    echo ""
    
    for i in {1..2000}; do
        curl -s -m 2 http://$TARGET:$PORT/ >/dev/null 2>&1 &
        if [ $((i % 200)) -eq 0 ]; then
            echo "  Sent $i requests..."
        fi
    done
    wait
    
    echo ""
    echo "✅ HTTP flood complete. Check IDS dashboard for 'dos' detection."
    echo ""
}

# Attack 4: ICMP Ping Flood (Detected as "dos")
attack_ping_flood() {
    echo ""
    echo "=========================================="
    echo "ATTACK 4: ICMP Ping Flood (Should trigger 'dos' detection)"
    echo "=========================================="
    echo "Sending 1000 ping packets to $TARGET..."
    echo "This should be detected as DoS attack"
    echo ""
    
    ping -f -c 1000 $TARGET 2>/dev/null || hping3 -1 --flood -c 1000 $TARGET 2>/dev/null || true
    
    echo ""
    echo "✅ Ping flood complete. Check IDS dashboard for 'dos' detection."
    echo ""
}

# Attack 5: Rapid Port Scan (Detected as "port_scan")
attack_rapid_scan() {
    echo ""
    echo "=========================================="
    echo "ATTACK 5: Rapid Port Scan (Should trigger 'port_scan' detection)"
    echo "=========================================="
    echo "Rapidly scanning common ports on $TARGET..."
    echo "This should be detected as port scan"
    echo ""
    
    # Scan common ports rapidly
    for port in 22 23 25 53 80 135 139 443 445 1433 3306 3389 5432; do
        timeout 1 bash -c "echo > /dev/tcp/$TARGET/$port" 2>/dev/null && echo "Port $port: OPEN" || echo "Port $port: closed"
    done
    
    # Also use nmap for more detection
    nmap -p 20,21,22,23,25,53,80,110,135,139,143,443,445,993,995,1433,3306,3389,5432 -T5 $TARGET
    
    echo ""
    echo "✅ Rapid scan complete. Check IDS dashboard for 'port_scan' detection."
    echo ""
}

# Attack 6: Mixed Attack (Multiple attack types)
attack_mixed() {
    echo ""
    echo "=========================================="
    echo "ATTACK 6: Mixed Attack (Multiple attack types)"
    echo "=========================================="
    echo "Running multiple attacks simultaneously..."
    echo "This should trigger multiple detections"
    echo ""
    
    # Start multiple attacks in background
    echo "  [1/3] Starting port scan..."
    nmap -p 1-500 -T5 $TARGET >/dev/null 2>&1 &
    SCAN_PID=$!
    
    sleep 2
    
    echo "  [2/3] Starting SYN flood..."
    timeout 20 hping3 -S -p $PORT --flood $TARGET >/dev/null 2>&1 &
    SYN_PID=$!
    
    sleep 2
    
    echo "  [3/3] Starting HTTP flood..."
    for i in {1..500}; do
        curl -s -m 1 http://$TARGET:$PORT/ >/dev/null 2>&1 &
    done
    
    echo ""
    echo "Attacks running... Waiting 25 seconds..."
    sleep 25
    
    # Cleanup
    kill $SCAN_PID 2>/dev/null || true
    kill $SYN_PID 2>/dev/null || true
    pkill hping3 2>/dev/null || true
    
    echo ""
    echo "✅ Mixed attack complete. Check IDS dashboard for multiple detections."
    echo ""
}

# Attack 7: Slow Port Scan (Stealth scan)
attack_stealth_scan() {
    echo ""
    echo "=========================================="
    echo "ATTACK 7: Stealth Port Scan (Should still be detected)"
    echo "=========================================="
    echo "Slow stealth scan to avoid detection..."
    echo "IDS should still detect this pattern"
    echo ""
    
    nmap -p 1-1000 -sS -T2 $TARGET
    
    echo ""
    echo "✅ Stealth scan complete. Check IDS dashboard."
    echo ""
}

# Main menu
show_menu() {
    echo ""
    echo "Select attack to run:"
    echo "  1) Port Scan (port_scan detection)"
    echo "  2) SYN Flood (dos detection)"
    echo "  3) HTTP Flood (dos detection)"
    echo "  4) ICMP Ping Flood (dos detection)"
    echo "  5) Rapid Port Scan (port_scan detection)"
    echo "  6) Mixed Attack (multiple detections)"
    echo "  7) Stealth Port Scan (port_scan detection)"
    echo "  8) Run ALL attacks sequentially"
    echo "  9) Exit"
    echo ""
    read -p "Enter choice [1-9]: " choice
    
    case $choice in
        1) attack_port_scan ;;
        2) attack_syn_flood ;;
        3) attack_http_flood ;;
        4) attack_ping_flood ;;
        5) attack_rapid_scan ;;
        6) attack_mixed ;;
        7) attack_stealth_scan ;;
        8) 
            attack_port_scan
            sleep 5
            attack_syn_flood
            sleep 5
            attack_http_flood
            sleep 5
            attack_ping_flood
            sleep 5
            attack_rapid_scan
            sleep 5
            attack_mixed
            echo ""
            echo "=========================================="
            echo "✅ All attacks completed!"
            echo "Check your IDS dashboard for all detections."
            echo "=========================================="
            ;;
        9) echo "Exiting..."; exit 0 ;;
        *) echo "Invalid choice. Try again."; show_menu ;;
    esac
}

# Check if target is provided and reachable
if [ "$1" != "" ]; then
    check_target
fi

# If running with arguments, run specific attack
if [ "$3" != "" ]; then
    case $3 in
        scan) attack_port_scan ;;
        syn) attack_syn_flood ;;
        http) attack_http_flood ;;
        ping) attack_ping_flood ;;
        rapid) attack_rapid_scan ;;
        mixed) attack_mixed ;;
        stealth) attack_stealth_scan ;;
        all)
            attack_port_scan
            sleep 5
            attack_syn_flood
            sleep 5
            attack_http_flood
            sleep 5
            attack_ping_flood
            sleep 5
            attack_rapid_scan
            sleep 5
            attack_mixed
            ;;
        *) echo "Unknown attack type: $3"; exit 1 ;;
    esac
else
    # Show interactive menu
    while true; do
        show_menu
        echo ""
        read -p "Run another attack? (y/n): " again
        if [ "$again" != "y" ] && [ "$again" != "Y" ]; then
            break
        fi
    done
fi

echo ""
echo "=========================================="
echo "Attack session complete!"
echo "Check your IDS dashboard for detections:"
echo "  - Port scans should show 'port_scan' or 'probe'"
echo "  - Floods should show 'dos' or 'ddos'"
echo "  - Your IP should be auto-blocked"
echo "  - Notifications should appear"
echo "=========================================="

