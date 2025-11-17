# Permanent DNS Blocking Fix

## Problem
The IDS couldn't automatically block domains via `/etc/hosts` because writing to `/etc/hosts` requires `sudo` privileges, and the backend was running without them.

## Solution
A secure, permanent fix using a dedicated script with sudoers configuration.

## Setup Instructions

### Step 1: Make the script executable
On your Ubuntu VM, run:
```bash
cd ~/Desktop/capstone/Firewall/IDS/backend/scripts
chmod +x update-hosts.sh
```

### Step 2: Configure sudoers (ONE-TIME SETUP)
Run the setup script:
```bash
cd ~/Desktop/capstone/Firewall/IDS/backend/scripts
sudo ./setup-sudoers.sh
```

This will:
- Make the script executable
- Add a secure sudoers entry that allows passwordless execution of ONLY this specific script
- Test that it works

### Step 3: Restart your backend
After setup, restart your backend:
```bash
cd ~/Desktop/capstone/Firewall/IDS/backend
npm start
```

## How It Works

1. **Helper Script** (`update-hosts.sh`):
   - Safely adds/removes domains from `/etc/hosts`
   - Creates backups before modifying
   - Handles the IDS marker section properly

2. **Firewall Service** (`firewall.ts`):
   - Calls the script with `sudo` when blocking/unblocking domains
   - Falls back gracefully if script isn't available

3. **Sudoers Configuration**:
   - Allows ONLY the specific script to run with sudo (no password)
   - More secure than running the entire backend with sudo
   - Stored in `/etc/sudoers.d/ids-hosts` (easy to remove if needed)

## Security Notes

- ✅ The sudoers entry is **restricted** to only the `update-hosts.sh` script
- ✅ The script validates inputs and creates backups
- ✅ No password required (convenient for automation)
- ✅ Can be easily removed: `sudo rm /etc/sudoers.d/ids-hosts`

## Testing

After setup, test by blocking a domain from the IDS interface:
1. Go to Monitoring page
2. Block a domain (e.g., `test.com`)
3. Check `/etc/hosts`: `sudo cat /etc/hosts | grep test.com`
4. Should see entries like:
   ```
   127.0.0.1 test.com
   0.0.0.0 test.com
   ```

## Troubleshooting

**If script fails:**
- Check permissions: `ls -l backend/scripts/update-hosts.sh` (should be executable)
- Check sudoers: `sudo cat /etc/sudoers.d/ids-hosts`
- Test manually: `sudo ./backend/scripts/update-hosts.sh add test.com`

**If you need to remove sudoers entry:**
```bash
sudo rm /etc/sudoers.d/ids-hosts
```

