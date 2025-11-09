#!/bin/bash

# IDS Prediction Service Setup Script for VM
# This script sets up the Python prediction service with all dependencies

echo "=========================================="
echo "  IDS Prediction Service Setup"
echo "=========================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend" || exit 1

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check Python
echo -e "${YELLOW}[1/6]${NC} Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}   ✗ Python3 not found. Please install Python 3.8 or higher.${NC}"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo -e "${GREEN}   ✓ Python3 found: $(python3 --version)${NC}"
echo ""

# Step 2: Check if model files exist
echo -e "${YELLOW}[2/6]${NC} Checking model files..."
if [ ! -f "binary_attack_model.pkl" ]; then
    echo -e "${RED}   ✗ binary_attack_model.pkl not found!${NC}"
    exit 1
fi

if [ ! -f "multiclass_attack_model.pkl" ]; then
    echo -e "${RED}   ✗ multiclass_attack_model.pkl not found!${NC}"
    exit 1
fi

echo -e "${GREEN}   ✓ Model files found${NC}"
echo ""

# Step 3: Create virtual environment if it doesn't exist
echo -e "${YELLOW}[3/6]${NC} Setting up virtual environment..."
if [ ! -d "venv" ]; then
    echo "   Creating virtual environment..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo -e "${RED}   ✗ Failed to create virtual environment${NC}"
        exit 1
    fi
    echo -e "${GREEN}   ✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}   ✓ Virtual environment already exists${NC}"
fi
echo ""

# Step 4: Activate virtual environment and install dependencies
echo -e "${YELLOW}[4/6]${NC} Installing dependencies..."
source venv/bin/activate

# Upgrade pip first
echo "   Upgrading pip..."
pip install --upgrade pip --quiet

# Install requirements
echo "   Installing packages from requirements.txt..."
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo -e "${RED}   ✗ Failed to install dependencies${NC}"
        deactivate
        exit 1
    fi
else
    echo "   requirements.txt not found, installing manually..."
    pip install flask>=2.3.0 numpy>=1.24.0 pandas>=2.0.0 scikit-learn>=1.3.0 requests>=2.31.0 joblib>=1.3.0
    if [ $? -ne 0 ]; then
        echo -e "${RED}   ✗ Failed to install dependencies${NC}"
        deactivate
        exit 1
    fi
fi

echo -e "${GREEN}   ✓ Dependencies installed${NC}"
echo ""

# Step 5: Test model loading
echo -e "${YELLOW}[5/6]${NC} Testing model loading..."
python3 << 'EOF'
import sys
import os

try:
    import joblib
    import pickle
    import numpy as np
    import pandas as pd
    from sklearn.base import BaseEstimator
    
    print("   Testing model loading...")
    
    # Try loading with joblib
    try:
        binary_model = joblib.load('binary_attack_model.pkl')
        multiclass_model = joblib.load('multiclass_attack_model.pkl')
        print("   ✓ Models loaded with joblib")
    except Exception as e:
        print(f"   Joblib failed: {e}")
        # Try pickle
        try:
            binary_model = pickle.load(open('binary_attack_model.pkl', 'rb'))
            multiclass_model = pickle.load(open('multiclass_attack_model.pkl', 'rb'))
            print("   ✓ Models loaded with pickle")
        except Exception as e2:
            print(f"   ✗ Pickle also failed: {e2}")
            sys.exit(1)
    
    # Verify models have predict method
    if not hasattr(binary_model, 'predict'):
        print("   ✗ Binary model missing predict method")
        sys.exit(1)
    if not hasattr(multiclass_model, 'predict'):
        print("   ✗ Multiclass model missing predict method")
        sys.exit(1)
    
    print("   ✓ Models are valid and ready")
    sys.exit(0)
except Exception as e:
    print(f"   ✗ Error: {e}")
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
    echo -e "${RED}   ✗ Model loading test failed${NC}"
    deactivate
    exit 1
fi

echo -e "${GREEN}   ✓ Models loaded successfully${NC}"
echo ""

# Step 6: Test prediction service startup
echo -e "${YELLOW}[6/6]${NC} Testing prediction service..."
echo "   Starting service in test mode..."

# Start service in background for 5 seconds
timeout 5 python3 prediction_service.py > /tmp/prediction-test.log 2>&1 &
TEST_PID=$!
sleep 3

# Check if it started
if ps -p $TEST_PID > /dev/null 2>&1; then
    echo -e "${GREEN}   ✓ Service started successfully${NC}"
    kill $TEST_PID 2>/dev/null
    wait $TEST_PID 2>/dev/null
else
    echo -e "${YELLOW}   ⚠ Service may have issues (check logs)${NC}"
    echo "   Logs: cat /tmp/prediction-test.log"
fi

deactivate
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}  ✓ Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "To start the prediction service manually:"
echo "  cd backend"
echo "  source venv/bin/activate"
echo "  python3 prediction_service.py"
echo ""
echo "Or use the start-demo.sh script which will start it automatically."
echo ""
echo "The service will run on: http://0.0.0.0:5002"
echo ""

