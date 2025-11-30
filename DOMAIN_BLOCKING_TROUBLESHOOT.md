# Domain Blocking Troubleshooting Guide

## Problem: Domain shows as blocked but website still accessible

### Quick Checks:

**1. Verify backend is running with sudo:**
```bash
ps aux | grep "node dist/index.js"
# Should show it's running (ideally with sudo or root)
```

**2. Check if IPs are actually in ipset:**
```bash
sudo ipset list ids_blocklist | grep <IP>
# Example: sudo ipset list ids_blocklist | grep 31.13.64.35
```

**3. Check OUTPUT rules:**
```bash
sudo iptables -L OUTPUT -n --line-numbers | head -10
# Should show ids_blocklist rule at position 1
# Should also show direct rules for blocked IPs
```

**4. Test if blocking works:**
```bash
# Try to ping a blocked IP
ping -c 1 <BLOCKED_IP>
# Should fail if blocking is working
```

## Common Issues:

### Issue 1: Backend not running with sudo

**Solution:**
```bash
# Stop current backend
sudo pkill -f "node dist/index.js"

# Start with sudo
cd ~/Desktop/capstone/Firewall/IDS/backend
sudo npm start
```

Or modify `restart-all.sh` to use `sudo npm start` instead of `npm start`.

### Issue 2: OUTPUT rule not at position 1

**Check:**
```bash
sudo iptables -L OUTPUT -n --line-numbers
```

**Fix manually:**
```bash
# Remove existing rule
sudo iptables -D OUTPUT -m set --match-set ids_blocklist dst -j DROP

# Insert at position 1
sudo iptables -I OUTPUT 1 -m set --match-set ids_blocklist dst -j DROP
```

### Issue 3: DNS caching

**Browser cache:**
- Clear browser cache
- Use incognito/private mode
- Restart browser

**System DNS cache:**
```bash
# Flush DNS cache
sudo systemd-resolve --flush-caches
# OR
sudo resolvectl flush-caches
```

### Issue 4: IPv6 blocking not working

**Check IPv6 rules:**
```bash
sudo ip6tables -L OUTPUT -n --line-numbers | head -10
```

**Fix:**
```bash
sudo ip6tables -I OUTPUT 1 -m set --match-set ids6_blocklist dst -j DROP
```

## Manual Fix for Specific Domain:

If blocking isn't working automatically, manually add rules:

```bash
# Resolve domain to IPs
getent hosts facebook.com

# Block each IP manually
sudo iptables -I OUTPUT 1 -d <IP> -j DROP
sudo ipset add ids_blocklist <IP>
```

## Verification Script:

Use the verification script:
```bash
chmod +x verify-blocking.sh
./verify-blocking.sh facebook.com
```

This will show:
- If IPs are in blocklist
- If OUTPUT rules exist
- If ping is blocked

## Expected Behavior:

After blocking facebook.com:
1. ✅ IPs should be in `ids_blocklist` (check with `sudo ipset list ids_blocklist`)
2. ✅ OUTPUT rule should be at position 1 (check with `sudo iptables -L OUTPUT -n --line-numbers`)
3. ✅ Direct OUTPUT rules should exist for each IP
4. ✅ Ping should fail: `ping <IP>` should timeout
5. ✅ Browser should not be able to access the website

## If Still Not Working:

1. **Check backend logs** for errors:
   ```bash
   tail -f /tmp/ids-backend.log
   ```

2. **Check if backend has permissions:**
   ```bash
   # Backend needs to run with sudo to modify iptables
   sudo npm start
   ```

3. **Manually verify firewall:**
   ```bash
   # List all OUTPUT rules
   sudo iptables -L OUTPUT -n -v --line-numbers
   
   # Check if specific IP is blocked
   sudo iptables -C OUTPUT -d <IP> -j DROP && echo "Blocked" || echo "Not blocked"
   ```

4. **Test with direct rule:**
   ```bash
   # Manually add rule
   sudo iptables -I OUTPUT 1 -d <IP> -j DROP
   # Test if it works
   ping -c 1 <IP>
   # If ping fails, blocking works - the issue is with the IDS code
   # If ping succeeds, there's a system-level issue
   ```

