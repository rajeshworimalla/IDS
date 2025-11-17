#!/usr/bin/env python3
"""
IDS Attack Simulation Script
Simulates all 6 attack types for testing the IDS system.

Usage:
    python3 simulate_attacks.py --target <IP> --attack <type> --duration <seconds>
    python3 simulate_attacks.py --target 192.168.100.4 --all  # Run all attacks
    python3 simulate_attacks.py --target 192.168.100.4 --dos --duration 10
"""

import argparse
import socket
import time
import threading
import random
import subprocess
import sys
from typing import Optional

class AttackSimulator:
    def __init__(self, target_ip: str, target_port: int = 5001):
        self.target_ip = target_ip
        self.target_port = target_port
        self.running = False
        
    def check_connectivity(self) -> bool:
        """Check if target is reachable"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex((self.target_ip, 22))  # Try SSH port
            sock.close()
            return True  # Even if connection refused, host is reachable
        except:
            try:
                # Try ping
                subprocess.run(['ping', '-c', '1', '-W', '2', self.target_ip], 
                             capture_output=True, timeout=3)
                return True
            except:
                return False
    
    def dos_syn_flood(self, duration: int = 10):
        """Simulate SYN flood DoS attack"""
        print(f"[DoS] Starting SYN flood attack on {self.target_ip}:{self.target_port} for {duration}s...")
        self.running = True
        start_time = time.time()
        packet_count = 0
        
        def send_syn():
            nonlocal packet_count
            while self.running and (time.time() - start_time) < duration:
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(0.1)
                    sock.connect_ex((self.target_ip, self.target_port))
                    sock.close()
                    packet_count += 1
                except:
                    packet_count += 1
                time.sleep(0.001)  # Very fast rate
        
        threads = []
        for _ in range(10):  # 10 concurrent threads
            t = threading.Thread(target=send_syn, daemon=True)
            t.start()
            threads.append(t)
        
        while (time.time() - start_time) < duration:
            time.sleep(0.5)
        
        self.running = False
        for t in threads:
            t.join(timeout=1)
        
        print(f"[DoS] ✓ Sent ~{packet_count} SYN packets")
    
    def dos_udp_flood(self, duration: int = 10):
        """Simulate UDP flood DoS attack"""
        print(f"[DoS] Starting UDP flood attack on {self.target_ip} for {duration}s...")
        self.running = True
        start_time = time.time()
        packet_count = 0
        
        def send_udp():
            nonlocal packet_count
            while self.running and (time.time() - start_time) < duration:
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    sock.sendto(b'X' * 100, (self.target_ip, random.randint(1, 65535)))
                    sock.close()
                    packet_count += 1
                except:
                    pass
                time.sleep(0.001)
        
        threads = []
        for _ in range(5):
            t = threading.Thread(target=send_udp, daemon=True)
            t.start()
            threads.append(t)
        
        while (time.time() - start_time) < duration:
            time.sleep(0.5)
        
        self.running = False
        for t in threads:
            t.join(timeout=1)
        
        print(f"[DoS] ✓ Sent ~{packet_count} UDP packets")
    
    def probe_port_scan(self, duration: int = 10):
        """Simulate port scanning (Probe attack)"""
        print(f"[Probe] Starting port scan on {self.target_ip} for {duration}s...")
        start_time = time.time()
        ports_scanned = 0
        
        # Scan common ports
        common_ports = list(range(1, 1001))  # Ports 1-1000
        random.shuffle(common_ports)
        
        for port in common_ports:
            if (time.time() - start_time) >= duration:
                break
            
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.1)
                result = sock.connect_ex((self.target_ip, port))
                sock.close()
                ports_scanned += 1
            except:
                ports_scanned += 1
            
            time.sleep(0.01)  # Small delay between scans
        
        print(f"[Probe] ✓ Scanned {ports_scanned} ports")
    
    def brute_force_http(self, duration: int = 10):
        """Simulate HTTP brute force attack"""
        print(f"[Brute Force] Starting HTTP brute force on {self.target_ip} for {duration}s...")
        start_time = time.time()
        attempts = 0
        
        passwords = ['admin', 'password', '123456', 'root', 'test', 'guest', 
                    'qwerty', 'letmein', 'welcome', 'monkey', '1234567890']
        
        while (time.time() - start_time) < duration:
            try:
                # Simulate HTTP POST login attempt
                import urllib.request
                import urllib.parse
                
                data = urllib.parse.urlencode({
                    'username': 'admin',
                    'password': random.choice(passwords)
                }).encode()
                
                req = urllib.request.Request(f'http://{self.target_ip}:8080/login', data=data)
                req.add_header('Content-Type', 'application/x-www-form-urlencoded')
                
                try:
                    urllib.request.urlopen(req, timeout=1)
                except:
                    pass  # Expected to fail
                
                attempts += 1
            except Exception as e:
                attempts += 1
            
            time.sleep(0.5)  # 2 attempts per second
        
        print(f"[Brute Force] ✓ Made {attempts} login attempts")
    
    def r2l_ssh_attempts(self, duration: int = 10):
        """Simulate R2L (Remote to Local) attack - SSH attempts"""
        print(f"[R2L] Starting SSH access attempts on {self.target_ip} for {duration}s...")
        start_time = time.time()
        attempts = 0
        
        usernames = ['admin', 'root', 'user', 'test', 'guest', 'administrator', 
                    'ubuntu', 'debian', 'centos', 'oracle']
        
        while (time.time() - start_time) < duration:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)
                result = sock.connect_ex((self.target_ip, 22))
                sock.close()
                attempts += 1
            except:
                attempts += 1
            
            time.sleep(0.8)  # ~1 attempt per second
        
        print(f"[R2L] ✓ Made {attempts} SSH connection attempts")
    
    def u2r_buffer_overflow(self, duration: int = 10):
        """Simulate U2R (User to Root) attack - buffer overflow attempt"""
        print(f"[U2R] Starting buffer overflow attempts on {self.target_ip} for {duration}s...")
        start_time = time.time()
        attempts = 0
        
        while (time.time() - start_time) < duration:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)
                sock.connect((self.target_ip, self.target_port))
                
                # Send oversized buffer (simulating buffer overflow attempt)
                large_buffer = b'A' * 10000
                sock.send(large_buffer)
                sock.close()
                attempts += 1
            except:
                attempts += 1
            
            time.sleep(1)  # 1 attempt per second
        
        print(f"[U2R] ✓ Made {attempts} buffer overflow attempts")
    
    def unknown_mixed_attack(self, duration: int = 10):
        """Simulate mixed/unknown attack pattern"""
        print(f"[Unknown] Starting mixed attack pattern on {self.target_ip} for {duration}s...")
        start_time = time.time()
        
        # Mix of different activities
        def random_activity():
            activity = random.choice(['port_scan', 'syn_flood', 'udp_flood'])
            if activity == 'port_scan':
                try:
                    port = random.randint(1, 65535)
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(0.1)
                    sock.connect_ex((self.target_ip, port))
                    sock.close()
                except:
                    pass
            elif activity == 'syn_flood':
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(0.1)
                    sock.connect_ex((self.target_ip, random.randint(1, 65535)))
                    sock.close()
                except:
                    pass
            else:  # udp_flood
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    sock.sendto(b'X' * 50, (self.target_ip, random.randint(1, 65535)))
                    sock.close()
                except:
                    pass
        
        count = 0
        while (time.time() - start_time) < duration:
            random_activity()
            count += 1
            time.sleep(0.05)  # Fast random activity
        
        print(f"[Unknown] ✓ Generated {count} mixed attack packets")


def main():
    parser = argparse.ArgumentParser(description='Simulate IDS attacks for testing')
    parser.add_argument('--target', '-t', required=True, help='Target IP address')
    parser.add_argument('--port', '-p', type=int, default=5001, help='Target port (default: 5001)')
    parser.add_argument('--duration', '-d', type=int, default=10, help='Attack duration in seconds (default: 10)')
    
    # Attack type options
    parser.add_argument('--all', action='store_true', help='Run all attack types sequentially')
    parser.add_argument('--dos', action='store_true', help='DoS attack (SYN flood)')
    parser.add_argument('--udp', action='store_true', help='UDP flood attack')
    parser.add_argument('--probe', action='store_true', help='Port scan (Probe) attack')
    parser.add_argument('--brute', action='store_true', help='Brute force attack')
    parser.add_argument('--r2l', action='store_true', help='R2L (Remote to Local) attack')
    parser.add_argument('--u2r', action='store_true', help='U2R (User to Root) attack')
    parser.add_argument('--unknown', action='store_true', help='Mixed/Unknown attack')
    
    args = parser.parse_args()
    
    simulator = AttackSimulator(args.target, args.port)
    
    print("=" * 60)
    print("  IDS Attack Simulation Script")
    print("=" * 60)
    print(f"Target: {args.target}:{args.port}")
    print(f"Duration: {args.duration}s per attack")
    print()
    
    # Check connectivity
    print("[*] Checking connectivity...")
    if not simulator.check_connectivity():
        print("[-] ERROR: Cannot reach target. Check IP address and network.")
        sys.exit(1)
    print("[+] Target is reachable")
    print()
    
    # Run attacks
    if args.all:
        print("Running ALL attack types sequentially...")
        print()
        attacks = [
            ('DoS (SYN Flood)', simulator.dos_syn_flood),
            ('Probe (Port Scan)', simulator.probe_port_scan),
            ('Brute Force', simulator.brute_force_http),
            ('R2L (SSH Attempts)', simulator.r2l_ssh_attempts),
            ('U2R (Buffer Overflow)', simulator.u2r_buffer_overflow),
            ('Unknown (Mixed)', simulator.unknown_mixed_attack),
        ]
        
        for name, attack_func in attacks:
            print(f"\n{'='*60}")
            print(f"  {name}")
            print(f"{'='*60}")
            attack_func(args.duration)
            print(f"✓ {name} completed")
            time.sleep(2)  # Pause between attacks
        
        print("\n" + "=" * 60)
        print("  All attacks completed!")
        print("=" * 60)
        print("\nCheck your IDS Monitoring page to see detections.")
        
    else:
        # Run individual attacks
        if args.dos:
            simulator.dos_syn_flood(args.duration)
        if args.udp:
            simulator.dos_udp_flood(args.duration)
        if args.probe:
            simulator.probe_port_scan(args.duration)
        if args.brute:
            simulator.brute_force_http(args.duration)
        if args.r2l:
            simulator.r2l_ssh_attempts(args.duration)
        if args.u2r:
            simulator.u2r_buffer_overflow(args.duration)
        if args.unknown:
            simulator.unknown_mixed_attack(args.duration)
        
        if not any([args.dos, args.udp, args.probe, args.brute, args.r2l, args.u2r, args.unknown]):
            print("No attack type specified. Use --all to run all attacks, or specify individual attacks.")
            parser.print_help()


if __name__ == '__main__':
    main()

