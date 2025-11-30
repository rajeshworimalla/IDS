# Quick Fix for Git Pull Error

## Problem
You have local changes to `ipController.ts` that conflict with the remote version.

## Quick Solution (Copy-Paste This):

```bash
cd ~/Desktop/capstone/Firewall/IDS
git stash
git pull origin stable-version
```

This will:
1. Save your local changes temporarily
2. Pull the latest updates
3. Your local changes are saved in stash (you can restore them later if needed)

## If You Want Your Local Changes Back:

```bash
git stash pop
```

## If You Want to Discard Local Changes:

```bash
cd ~/Desktop/capstone/Firewall/IDS
git checkout -- backend/src/controllers/ipController.ts
git pull origin stable-version
```

## Recommended: Use Stash (First Option)
This keeps your changes safe while pulling the updates.

