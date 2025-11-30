# Fix Git Pull Error

## Problem
You have local changes to `restart-all.sh` that conflict with the remote version.

## Solution Options

### Option 1: Stash Your Changes (Recommended)
This saves your local changes temporarily, pulls the updates, then you can decide what to keep:

```bash
# Save your local changes temporarily
git stash

# Pull the latest changes
git pull origin stable-version

# If you want to see what you had locally:
git stash show

# If you want to restore your local changes:
git stash pop

# If you want to discard your local changes and keep the remote version:
git stash drop
```

### Option 2: Commit Your Local Changes First
If you want to keep your local changes:

```bash
# Add your changes
git add restart-all.sh

# Commit them
git commit -m "Local changes to restart-all.sh"

# Pull (this will create a merge commit)
git pull origin stable-version

# If there are conflicts, resolve them and then:
git add restart-all.sh
git commit -m "Merged local and remote changes"
```

### Option 3: Discard Local Changes (Use Remote Version)
If you don't need your local changes:

```bash
# Discard local changes
git checkout -- restart-all.sh

# Pull the latest changes
git pull origin stable-version
```

## Quick Fix (Copy-Paste This)
```bash
cd ~/Desktop/capstone/Firewall/IDS
git stash
git pull origin stable-version
```

If you want your local changes back after pulling:
```bash
git stash pop
```

