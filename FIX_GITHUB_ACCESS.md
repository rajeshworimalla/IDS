# Fix GitHub Access in VM

## Quick Fixes:

### 1. Check DNS Resolution
```bash
# Test if GitHub resolves
nslookup github.com
# or
ping github.com

# If it fails, try using Google DNS
sudo nano /etc/resolv.conf
# Add:
nameserver 8.8.8.8
nameserver 8.8.4.4
```

### 2. Check if GitHub IP is Blocked
```bash
# Check if GitHub IPs are in your firewall blocklist
sudo ipset list ids_blocklist | grep -i github
# If you see GitHub IPs, remove them:
sudo ipset del ids_blocklist <IP>
```

### 3. Test Direct IP Access
```bash
# GitHub's IP (may change)
ping 140.82.121.3

# If ping works but git doesn't, try:
git config --global url."https://140.82.121.3/".insteadOf "https://github.com/"
```

### 4. Use HTTPS with Token (if DNS fails)
```bash
# Generate token on Windows, then in VM:
git remote set-url origin https://<TOKEN>@github.com/rajeshworimalla/IDS.git
```

### 5. Copy Files from Windows Instead
If GitHub still doesn't work, copy the file from Windows to VM using shared folder or SCP.

