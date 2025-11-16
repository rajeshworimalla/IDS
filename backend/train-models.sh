#!/bin/bash

# Script to train new ML models for attack detection

echo "🚀 Training new ML models for attack detection..."
echo ""

# Navigate to backend directory
cd "$(dirname "$0")"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 not found. Please install Python 3.8+"
    exit 1
fi

# Check if required packages are installed
echo "📦 Checking dependencies..."
python3 -c "import sklearn, numpy, pandas, joblib" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Missing dependencies. Installing..."
    pip3 install scikit-learn numpy pandas joblib
fi

# Backup existing models
if [ -f "binary_attack_model.pkl" ]; then
    echo "💾 Backing up existing models..."
    cp binary_attack_model.pkl binary_attack_model.pkl.backup
    cp multiclass_attack_model.pkl multiclass_attack_model.pkl.backup
    echo "   Backups created: *.pkl.backup"
fi

# Run training
echo ""
echo "🎯 Starting training..."
python3 train_models.py

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Training completed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Restart the prediction service:"
    echo "      sudo pkill -f prediction_service.py"
    echo "      cd backend && python3 prediction_service.py &"
    echo ""
    echo "   2. Or restart all services:"
    echo "      ./start-and-verify.sh"
else
    echo ""
    echo "❌ Training failed. Check the error messages above."
    echo "   If you want to restore backups:"
    echo "   cp binary_attack_model.pkl.backup binary_attack_model.pkl"
    echo "   cp multiclass_attack_model.pkl.backup multiclass_attack_model.pkl"
    exit 1
fi

