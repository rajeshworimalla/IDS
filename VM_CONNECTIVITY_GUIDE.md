# VM Connectivity Guide

## Problem: Attacks from Kali VM not showing in IDS

If attacks aren't being detected, the VMs might not be on the same network.

## Step 1: Find Your VM IPs

### On IDS VM:
```bash
hostname -I
# Example output: 192.168.56.101
```

### On Kali VM:
```bash
hostname -I
# Example output: 192.168.56.102
```

## Step 2: Test Connectivity

### On Kali VM:
```bash
ping <IDS_VM_IP>
# Example: ping 192.168.56.101
```

### On IDS VM:
```bash
ping <KALI_VM_IP>
# Example: ping 192.168.56.102
```

If ping fails, the VMs are NOT on the same network.

## Step 3: Fix Network Settings

### Option A: Use NAT Network (Recommended for VirtualBox)
1. In VirtualBox, go to **File > Preferences > Network**
2. Create a new NAT Network (e.g., `10.0.2.0/24`)
3. Set both VMs to use this NAT Network in **Settings > Network**

### Option B: Use Bridged Adapter
1. In VirtualBox, set both VMs to **Bridged Adapter**
2. Both VMs will get IPs from your router (e.g., `192.168.1.x`)

### Option C: Use Internal Network
1. In VirtualBox, create an Internal Network (e.g., `intnet`)
2. Set both VMs to use this Internal Network
3. They'll be on a private network (e.g., `192.168.56.x`)

## Step 4: Run Attack Scripts

### On Kali VM:
```bash
cd attacker-vm
chmod +x attack_scripts.sh
./attack_scripts.sh <IDS_VM_IP>
# Example: ./attack_scripts.sh 192.168.100.4
# Or just run without arguments (defaults to 192.168.100.4)
./attack_scripts.sh
```

## Step 5: Watch IDS Dashboard

1. Open IDS dashboard in browser
2. Go to **Dashboard** or **Security Alerts** page
3. Run attack from Kali VM
4. **You should see alerts IMMEDIATELY** in real-time!

## Troubleshooting

### If attacks still don't show:

1. **Check IDS is capturing packets:**
   - Look at Events Log page - should show packets
   - If no packets, check network interface in IDS

2. **Check ML service is running:**
   ```bash
   # On IDS VM
   ps aux | grep prediction_service
   # Should show Python process
   ```

3. **Check firewall isn't blocking:**
   ```bash
   # On IDS VM
   sudo ufw status
   # Should allow traffic from Kali VM
   ```

4. **Check socket connection:**
   - Open browser console (F12)
   - Look for "[Dashboard] Socket connected" message
   - If not connected, check backend is running

5. **Test with simple ping flood:**
   ```bash
   # On Kali VM
   ping -f <IDS_VM_IP>
   # Should trigger ICMP flood detection
   ```

## Quick Test Script

Run this on both VMs to find each other:

```bash
chmod +x test-vm-connectivity.sh
./test-vm-connectivity.sh
```

This will scan common VM network ranges and find reachable hosts.

