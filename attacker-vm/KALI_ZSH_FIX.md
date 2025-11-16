# Fix Kali Linux zsh "Job Table Full" Error

## Quick Fix (Immediate)

If your terminal is unusable, switch to bash:

```bash
exec bash
```

Then you can fix the zsh configuration.

## Permanent Fix

### Option 1: Run the Fix Script

```bash
cd ~/IDS/attacker-vm
chmod +x fix-kali-zsh.sh
./fix-kali-zsh.sh
```

Then restart your terminal.

### Option 2: Manual Fix

Edit your `~/.zshrc` file:

```bash
nano ~/.zshrc
```

Add these lines at the end:

```zsh
# Fix for job table full or recursion limit exceeded
setopt SHARE_HISTORY
unsetopt SHARE_HISTORY
limit jobs 32

# Fix autosuggest recursion
if [[ -n "$ZSH_AUTOSUGGEST_STRATEGY" ]]; then
    export ZSH_AUTOSUGGEST_STRATEGY=(history completion)
fi
```

Save and restart terminal.

### Option 3: Disable Autosuggest (If It's the Problem)

```bash
# Comment out autosuggest in .zshrc
sed -i '/zsh-autosuggest/s/^/#/' ~/.zshrc

# Or remove the plugin
sed -i '/zsh-autosuggestions/d' ~/.zshrc
```

### Option 4: Use Minimal zshrc

If nothing works, use the minimal configuration:

```bash
cp ~/.zshrc.minimal ~/.zshrc
source ~/.zshrc
```

## Common Causes

1. **zsh-autosuggest plugin** - Can cause recursion loops
2. **Too many background jobs** - Job table fills up
3. **Recursive functions** - Infinite loops in .zshrc
4. **Plugin conflicts** - Multiple plugins interfering

## Prevention

- Limit background jobs: `limit jobs 32`
- Use `&!` instead of `&` for background jobs
- Avoid recursive function calls in precmd hooks
- Keep .zshrc simple and well-tested

## Switch to Bash Permanently

If zsh continues to cause issues:

```bash
chsh -s /bin/bash
```

Log out and log back in.

## Verify Fix

After applying fixes:

```bash
# Restart terminal or run:
source ~/.zshrc

# Test if it works:
echo "Test"
ls
```

If you still see errors, use bash temporarily:
```bash
exec bash
```





