# MongoDB Compass Setup Guide

## Option 1: Connect from Windows to VM (Recommended)

### Step 1: Install MongoDB Compass on Windows

1. Download MongoDB Compass from: https://www.mongodb.com/try/download/compass
2. Install it on your Windows machine

### Step 2: Get Your VM's IP Address

In your VM, run:
```bash
hostname -I
# OR
ip addr show
# OR
ifconfig
```

You'll get something like: `192.168.x.x` or `10.0.x.x`

### Step 3: Make MongoDB Accessible from Network

By default, MongoDB only listens on localhost. You need to configure it to accept connections from your network.

**In your VM:**

1. **Edit MongoDB configuration:**
```bash
# Find MongoDB config file
sudo find /etc -name "mongod.conf" 2>/dev/null
# OR
sudo find /etc -name "mongodb.conf" 2>/dev/null

# If found, edit it:
sudo nano /etc/mongod.conf
# OR
sudo nano /etc/mongodb.conf
```

2. **Change the bindIp setting:**
   - Find the line: `bindIp: 127.0.0.1`
   - Change it to: `bindIp: 0.0.0.0` (allows connections from any IP)
   - OR: `bindIp: 127.0.0.1,<YOUR_VM_IP>` (allows localhost + your VM IP)

3. **Restart MongoDB:**
```bash
sudo systemctl restart mongodb
# OR
sudo systemctl restart mongod
```

4. **Check if MongoDB is listening on all interfaces:**
```bash
sudo netstat -tlnp | grep 27017
# Should show: 0.0.0.0:27017 (not just 127.0.0.1:27017)
```

### Step 4: Configure VM Firewall (if needed)

If you have a firewall on your VM, allow MongoDB port:
```bash
sudo ufw allow 27017/tcp
# OR
sudo iptables -A INPUT -p tcp --dport 27017 -j ACCEPT
```

### Step 5: Connect from MongoDB Compass

1. Open MongoDB Compass on Windows
2. Use this connection string:
   ```
   mongodb://<VM_IP_ADDRESS>:27017/ids
   ```
   
   Example:
   ```
   mongodb://192.168.1.100:27017/ids
   ```

3. Click "Connect"

---

## Option 2: SSH Tunnel (More Secure)

If you can't expose MongoDB to the network, use SSH tunneling:

### Step 1: Install MongoDB Compass on Windows
(Same as Option 1, Step 1)

### Step 2: Create SSH Tunnel

**On Windows (PowerShell or Command Prompt):**
```bash
ssh -L 27017:localhost:27017 <VM_USER>@<VM_IP>
```

Example:
```bash
ssh -L 27017:localhost:27017 mausham04@192.168.1.100
```

Keep this terminal open while using Compass.

### Step 3: Connect from MongoDB Compass

1. Open MongoDB Compass
2. Use this connection string:
   ```
   mongodb://localhost:27017/ids
   ```
3. Click "Connect"

---

## Option 3: Install Compass in VM (If VM has GUI)

If your VM has a desktop environment:

```bash
# Download Compass for Linux
wget https://downloads.mongodb.com/compass/mongodb-compass_1.44.0_amd64.deb

# Install it
sudo dpkg -i mongodb-compass_1.44.0_amd64.deb

# Fix dependencies if needed
sudo apt install -f

# Run Compass
mongodb-compass
```

Then connect using:
```
mongodb://127.0.0.1:27017/ids
```

---

## Quick Connection String Reference

- **From Windows to VM (network):** `mongodb://<VM_IP>:27017/ids`
- **From Windows via SSH tunnel:** `mongodb://localhost:27017/ids`
- **From VM itself:** `mongodb://127.0.0.1:27017/ids`

---

## Troubleshooting

### Can't connect from Windows?

1. **Check if MongoDB is running in VM:**
   ```bash
   sudo systemctl status mongodb
   ```

2. **Check if MongoDB is listening:**
   ```bash
   sudo netstat -tlnp | grep 27017
   ```

3. **Test connection from VM:**
   ```bash
   mongosh mongodb://127.0.0.1:27017/ids
   ```

4. **Check VM firewall:**
   ```bash
   sudo ufw status
   ```

5. **Check if VM IP is reachable from Windows:**
   ```bash
   # On Windows PowerShell
   ping <VM_IP>
   ```

### MongoDB not accepting connections?

Make sure `bindIp` in MongoDB config is set to `0.0.0.0` or includes your VM's IP address.

---

## Security Note

⚠️ **Warning:** Exposing MongoDB to the network (bindIp: 0.0.0.0) can be a security risk. For production:
- Use authentication
- Restrict access with firewall rules
- Use SSH tunneling instead
- Or use MongoDB Atlas (cloud)

For development/testing, it's usually fine.

