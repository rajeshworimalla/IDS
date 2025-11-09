# How to Check IP Address

## In Linux VM (Ubuntu/Debian)

### Method 1: Using `ip` command (Recommended)
```bash
ip addr show
# or shorter:
ip a
```
Look for the line with `inet` - that's your IP address (e.g., `inet 192.168.1.100/24`)

### Method 2: Quick IP only
```bash
hostname -I
```
Shows just the IP addresses, space-separated.

### Method 3: Using `ifconfig` (if installed)
```bash
ifconfig
# If not installed:
sudo apt install net-tools
ifconfig
```

### Method 4: Show default route IP
```bash
ip route get 8.8.8.8 | awk '{print $7}'
```
Shows the IP address used for external connections.

---

## On Windows Host

### Method 1: Command Prompt
```cmd
ipconfig
```

### Method 2: PowerShell
```powershell
ipconfig
# or
Get-NetIPAddress
```

### Method 3: Find specific adapter
```cmd
ipconfig /all
```

---

## For Your IDS Project

### Check IDS Server VM IP:
```bash
# On IDS Server VM
hostname -I
# Note this IP - you'll need it for the attacker VM
```

### Check Attacker VM IP:
```bash
# On Attacker VM
hostname -I
# Note this IP - useful for testing
```

### Verify VMs can communicate:
```bash
# From Attacker VM, ping IDS Server
ping <IDS-SERVER-IP>

# From IDS Server, ping Attacker
ping <ATTACKER-VM-IP>
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `ip addr show` | Show all network interfaces (Linux) |
| `hostname -I` | Show IP addresses only (Linux) |
| `ipconfig` | Show IP configuration (Windows) |
| `ping <IP>` | Test connectivity between VMs |

---

## Troubleshooting

**If you don't see an IP address:**
1. Check network adapter is enabled in VM settings
2. Ensure VM is using "Bridged Adapter" mode (not NAT)
3. Restart network service: `sudo systemctl restart networking`
4. Check VM network settings in VirtualBox/VMware

**If VMs can't ping each other:**
1. Verify both VMs are on the same network (Bridged Adapter)
2. Check firewall: `sudo ufw status`
3. Verify IPs are on same subnet (e.g., both 192.168.1.x)

