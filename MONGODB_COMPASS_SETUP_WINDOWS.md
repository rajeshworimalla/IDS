# MongoDB Compass - Always Connected Setup (Windows)

## Option 1: Quick Start Script (Easiest)

1. **Edit `mongodb-tunnel.bat`** and replace `192.168.100.4` with your VM's IP
2. **Double-click `mongodb-tunnel.bat`** whenever you want to use MongoDB Compass
3. **Minimize the window** (don't close it)
4. **Open MongoDB Compass** and connect to: `mongodb://localhost:27017/ids`

## Option 2: Auto-Start on Windows Boot (Always Available)

### Method A: Using Task Scheduler (Recommended)

1. **Press `Win + R`**, type `taskschd.msc`, press Enter
2. **Click "Create Basic Task"** in the right panel
3. **Name it**: "MongoDB Tunnel"
4. **Trigger**: "When I log on"
5. **Action**: "Start a program"
6. **Program/script**: Browse to `mongodb-tunnel.bat`
7. **Start in**: (leave empty or put the folder path)
8. **Check "Hidden"** checkbox (runs in background)
9. **Click Finish**

Now the tunnel will start automatically when you log in!

### Method B: Using Startup Folder

1. **Press `Win + R`**, type `shell:startup`, press Enter
2. **Copy `mongodb-tunnel-vbs.vbs`** to this folder
3. **Edit the .vbs file** and make sure the path to `mongodb-tunnel.bat` is correct

The tunnel will start automatically when Windows boots.

## Option 3: Direct Connection (No SSH Tunnel)

If you want to connect directly without SSH tunnel:

### In your VM:
```bash
# Allow MongoDB port through firewall
sudo ufw allow 27017/tcp
sudo iptables -I INPUT -p tcp --dport 27017 -j ACCEPT
```

### In MongoDB Compass:
Connect to: `mongodb://<VM_IP>:27017/ids`

Replace `<VM_IP>` with your VM's IP (e.g., `192.168.100.4`)

**Note:** This is less secure but more convenient. Only use on trusted networks.

## Troubleshooting

### Tunnel won't start?
- Make sure SSH is working: `ssh mausham04@<VM_IP>`
- Check if port 27017 is already in use: `netstat -an | findstr 27017`
- Try a different local port: `ssh -L 27018:localhost:27017 mausham04@<VM_IP>`
  - Then connect to: `mongodb://localhost:27018/ids`

### Connection times out?
- Verify VM IP hasn't changed: `hostname -I` (in VM)
- Check if MongoDB is running: `sudo docker ps | grep mongodb` (in VM)
- Test SSH connection: `ssh mausham04@<VM_IP>` (on Windows)

### Want to stop the tunnel?
- Close the command window
- Or find the process: `tasklist | findstr ssh`
- Kill it: `taskkill /F /IM ssh.exe`

## Quick Reference

**SSH Tunnel Command:**
```powershell
ssh -L 27017:localhost:27017 mausham04@<VM_IP>
```

**MongoDB Compass Connection:**
```
mongodb://localhost:27017/ids
```

**VM IP Check (in VM):**
```bash
hostname -I
```

