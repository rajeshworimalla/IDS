# Clone Project to VM - Quick Guide

## ✅ Already Done
Your code has been pushed to GitHub! Repository: `rajeshworimalla/IDS`

## 🚀 Steps to Clone in Your VM

### 1. In Your VM, Open Terminal

### 2. Clone the Repository
```bash
# Navigate to where you want the project
cd ~

# Clone the repository
git clone https://github.com/rajeshworimalla/IDS.git

# Or if you need SSH (if you have SSH keys set up):
# git clone git@github.com:rajeshworimalla/IDS.git
```

### 3. Navigate to Project
```bash
cd IDS
```

### 4. Verify Important Files Are There
```bash
# Check model files (CRITICAL!)
ls -lh backend/*.pkl

# Check setup scripts
ls -lh setup-prediction-vm.sh test-prediction.sh

# Check documentation
ls -lh VM_*.md
```

You should see:
- `backend/binary_attack_model.pkl`
- `backend/multiclass_attack_model.pkl`
- `setup-prediction-vm.sh`
- `test-prediction.sh`
- `VM_SETUP_GUIDE.md`
- `VM_QUICK_START.md`

### 5. Make Scripts Executable
```bash
chmod +x setup-prediction-vm.sh
chmod +x test-prediction.sh
chmod +x start-demo.sh
chmod +x stop-demo.sh
```

### 6. Follow Setup Guide
```bash
# Read the quick start guide
cat VM_QUICK_START.md

# Or follow the detailed guide
cat VM_SETUP_GUIDE.md
```

### 7. Run Setup
```bash
# Set up Python prediction service
./setup-prediction-vm.sh

# Test it works
./test-prediction.sh

# Start everything
./start-demo.sh
```

## 🔧 If You Need to Update Later

If you make changes on Windows and push to GitHub:

```bash
# In your VM
cd ~/IDS
git pull origin main
```

## 📝 Quick Checklist After Cloning

- [ ] Model files exist (`ls backend/*.pkl`)
- [ ] Scripts are executable (`chmod +x *.sh`)
- [ ] Python 3.8+ installed (`python3 --version`)
- [ ] Run setup script (`./setup-prediction-vm.sh`)
- [ ] Test prediction service (`./test-prediction.sh`)
- [ ] Start everything (`./start-demo.sh`)

## 🆘 Troubleshooting

**"git: command not found"**
```bash
sudo apt update
sudo apt install -y git
```

**"Permission denied" when cloning**
- Make sure you have write permissions in the directory
- Try: `sudo chown -R $USER:$USER ~/IDS`

**"Model files missing"**
- Check if they're in the repository: `git ls-files backend/*.pkl`
- If not, you may need to add them manually or use Git LFS for large files

**"Repository not found"**
- Check the repository URL is correct
- Make sure the repository is public or you have access

## 🎯 Next Steps

Once cloned, follow `VM_QUICK_START.md` for the fastest setup!

