#!/bin/bash

echo "========================================="
echo "IDS Attack Detection Debug Script"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}[1/8] Checking if backend is running...${NC}"
if pgrep -f "node.*backend" > /dev/null; then
    echo -e "${GREEN}✓ Backend is running${NC}"
    BACKEND_PID=$(pgrep -f "node.*backend" | head -1)
    echo "  PID: $BACKEND_PID"
else
    echo -e "${RED}✗ Backend is NOT running${NC}"
    echo "  Run: ./restart-all.sh"
    exit 1
fi

echo ""
echo -e "${YELLOW}[2/8] Checking if ML prediction service is running...${NC}"
if pgrep -f "python.*prediction_service" > /dev/null; then
    echo -e "${GREEN}✓ ML prediction service is running${NC}"
    ML_PID=$(pgrep -f "python.*prediction_service" | head -1)
    echo "  PID: $ML_PID"
else
    echo -e "${RED}✗ ML prediction service is NOT running${NC}"
    echo "  Run: ./restart-all.sh"
    exit 1
fi

echo ""
echo -e "${YELLOW}[3/8] Testing ML service connectivity...${NC}"
ML_RESPONSE=$(curl -s -X POST http://127.0.0.1:5002/predict \
    -H "Content-Type: application/json" \
    -d '{"packet": {"protocol": "TCP", "frequency": 100, "start_bytes": 60, "end_bytes": 60, "start_ip": "192.168.1.100", "end_ip": "192.168.1.1"}}' \
    -w "\nHTTP_CODE:%{http_code}" 2>&1)

if echo "$ML_RESPONSE" | grep -q "HTTP_CODE:200"; then
    echo -e "${GREEN}✓ ML service is responding${NC}"
    echo "$ML_RESPONSE" | grep -v "HTTP_CODE" | head -5
else
    echo -e "${RED}✗ ML service is NOT responding correctly${NC}"
    echo "  Response: $ML_RESPONSE"
fi

echo ""
echo -e "${YELLOW}[4/8] Checking if packet capture is active...${NC}"
# Check backend logs for packet capture activity
if journalctl -u ids-backend 2>/dev/null | tail -20 | grep -q "Packet capture\|First packet"; then
    echo -e "${GREEN}✓ Packet capture appears active (checking logs)${NC}"
else
    echo -e "${YELLOW}⚠ Cannot verify packet capture from systemd logs${NC}"
    echo "  Check backend console output for: 'First packet captured!'"
fi

echo ""
echo -e "${YELLOW}[5/8] Checking network interfaces...${NC}"
INTERFACES=$(ip -4 addr show | grep -E "inet " | grep -v "127.0.0.1" | awk '{print $2}' | cut -d/ -f1)
if [ -n "$INTERFACES" ]; then
    echo -e "${GREEN}✓ Network interfaces found:${NC}"
    for ip in $INTERFACES; do
        echo "  - $ip"
    done
else
    echo -e "${RED}✗ No network interfaces found${NC}"
fi

echo ""
echo -e "${YELLOW}[6/8] Checking if packets are being captured (last 30 seconds)...${NC}"
# Try to query MongoDB for recent packets
RECENT_PACKETS=$(mongosh --quiet --eval "db.packets.countDocuments({date: {\$gte: new Date(Date.now() - 30000)}})" ids 2>/dev/null)
if [ -n "$RECENT_PACKETS" ] && [ "$RECENT_PACKETS" != "null" ]; then
    if [ "$RECENT_PACKETS" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $RECENT_PACKETS packets in last 30 seconds${NC}"
    else
        echo -e "${YELLOW}⚠ No packets captured in last 30 seconds${NC}"
        echo "  Make sure packet capture is started in the Events Log page"
    fi
else
    echo -e "${YELLOW}⚠ Cannot query MongoDB (might need sudo)${NC}"
fi

echo ""
echo -e "${YELLOW}[7/8] Checking for malicious packets (last 5 minutes)...${NC}"
MALICIOUS_COUNT=$(mongosh --quiet --eval "db.packets.countDocuments({is_malicious: true, date: {\$gte: new Date(Date.now() - 300000)}})" ids 2>/dev/null)
if [ -n "$MALICIOUS_COUNT" ] && [ "$MALICIOUS_COUNT" != "null" ]; then
    if [ "$MALICIOUS_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $MALICIOUS_COUNT malicious packets in last 5 minutes${NC}"
    else
        echo -e "${YELLOW}⚠ No malicious packets detected in last 5 minutes${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Cannot query MongoDB for malicious packets${NC}"
fi

echo ""
echo -e "${YELLOW}[8/8] Testing attack simulation locally...${NC}"
echo "  Sending test attack packets..."
# Send some high-frequency ICMP packets (should trigger detection)
for i in {1..50}; do
    ping -c 1 -W 1 127.0.0.1 > /dev/null 2>&1 &
done
wait
echo -e "${GREEN}✓ Sent 50 test packets${NC}"
echo "  Check the Events Log page to see if they were captured"
echo "  Wait 5 seconds and check for notifications"

echo ""
echo "========================================="
echo "Debug Summary"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Make sure packet capture is STARTED in Events Log page"
echo "2. Run attack script from Kali VM targeting this IDS VM IP"
echo "3. Check backend console logs for:"
echo "   - 'First packet captured!'"
echo "   - 'intrusion-detected' emissions"
echo "   - ML prediction responses"
echo "4. Check browser console (F12) for socket connection and 'intrusion-detected' events"
echo ""
echo "Common issues:"
echo "- If no packets: Check network interface, firewall, and packet capture permissions"
echo "- If packets but no detection: Check ML service logs and pattern detection thresholds"
echo "- If detection but no notifications: Check socket connection in browser console"
echo ""

