#!/bin/bash

# Fix Kali Linux zsh "job table full" error
# This script fixes the zsh recursion/job table issue

echo "=== Fixing Kali Linux zsh Configuration ==="
echo ""

# Backup current .zshrc
if [ -f ~/.zshrc ]; then
    echo "Backing up ~/.zshrc to ~/.zshrc.backup.$(date +%Y%m%d_%H%M%S)"
    cp ~/.zshrc ~/.zshrc.backup.$(date +%Y%m%d_%H%M%S)
fi

# Method 1: Increase job limits in .zshrc
echo "Adding job limit fixes to ~/.zshrc..."

# Check if fixes already exist
if ! grep -q "# Fix for job table full" ~/.zshrc 2>/dev/null; then
    cat >> ~/.zshrc << 'EOF'

# Fix for job table full or recursion limit exceeded
# Increase job limits
setopt SHARE_HISTORY
unsetopt SHARE_HISTORY
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS

# Limit background jobs
limit jobs 32

# Fix autosuggest recursion
if [[ -n "$ZSH_AUTOSUGGEST_STRATEGY" ]]; then
    export ZSH_AUTOSUGGEST_STRATEGY=(history completion)
fi

# Disable problematic hooks temporarily if needed
# autoload -Uz add-zsh-hook
# add-zsh-hook precmd() { true; }
EOF
    echo "✓ Added job limit fixes"
else
    echo "✓ Fixes already present"
fi

# Method 2: Temporarily disable autosuggest if causing issues
echo ""
echo "To temporarily disable zsh-autosuggest, run:"
echo "  echo 'unset ZSH_AUTOSUGGEST_USE_ASYNC' >> ~/.zshrc"
echo ""

# Method 3: Create a minimal .zshrc if current one is broken
echo "Creating emergency .zshrc.minimal as backup..."
cat > ~/.zshrc.minimal << 'EOF'
# Minimal zshrc for Kali Linux
export PATH=$HOME/bin:/usr/local/bin:$PATH
export EDITOR=nano

# Basic prompt
autoload -Uz promptinit
promptinit
prompt adam1

# History
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt appendhistory

# Basic completion
autoload -Uz compinit
compinit
EOF

echo "✓ Created ~/.zshrc.minimal"
echo ""

# Method 4: Switch to bash temporarily
echo "To switch to bash temporarily, run:"
echo "  bash"
echo ""

echo "=== Fix Applied ==="
echo ""
echo "Next steps:"
echo "1. Close and reopen your terminal"
echo "2. If still having issues, run: source ~/.zshrc.minimal"
echo "3. Or switch to bash: exec bash"
echo ""
echo "If autosuggest is the problem, you can disable it:"
echo "  sed -i '/zsh-autosuggest/s/^/#/' ~/.zshrc"
echo ""





