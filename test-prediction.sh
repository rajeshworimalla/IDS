#!/bin/bash

# Quick test script for prediction service
# Run this to verify the prediction service is working

echo "Testing Prediction Service..."
echo ""

cd "$(dirname "${BASH_SOURCE[0]}")/backend" || exit 1

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "Run: ./setup-prediction-vm.sh first"
    exit 1
fi

# Activate venv
source venv/bin/activate

# Check if service is running
if curl -s http://localhost:5002/predict > /dev/null 2>&1; then
    echo "✓ Service is running"
else
    echo "⚠ Service not running, starting it..."
    python3 prediction_service.py > /tmp/prediction-test.log 2>&1 &
    PRED_PID=$!
    sleep 3
    
    if ps -p $PRED_PID > /dev/null 2>&1; then
        echo "✓ Service started (PID: $PRED_PID)"
    else
        echo "❌ Service failed to start"
        echo "Check logs: cat /tmp/prediction-test.log"
        deactivate
        exit 1
    fi
fi

# Test prediction
echo ""
echo "Testing prediction endpoint..."
TEST_DATA='{
  "packet": {
    "start_bytes": 100,
    "end_bytes": 200,
    "protocol": "TCP",
    "description": "192.168.1.1 -> 80",
    "frequency": 10
  }
}'

RESPONSE=$(curl -s -X POST http://localhost:5002/predict \
  -H "Content-Type: application/json" \
  -d "$TEST_DATA")

if [ $? -eq 0 ]; then
    echo "✓ Prediction successful!"
    echo "Response:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
else
    echo "❌ Prediction failed"
    deactivate
    exit 1
fi

deactivate
echo ""
echo "✅ All tests passed!"

