# Attack Detection Guide

## How Attack Types Are Detected

The IDS uses **two methods** to detect and classify attacks:

### 1. Machine Learning Classification
- **Binary Model**: Determines if traffic is malicious or benign
- **Multiclass Model**: Classifies the specific attack type
- **Attack Types Detected**:
  - `dos` - Denial of Service
  - `ddos` - Distributed Denial of Service  
  - `probe` - Network reconnaissance/probing
  - `port_scan` - Port scanning attacks
  - `ping_sweep` - ICMP ping sweeps
  - `r2l` - Remote to Local (unauthorized access)
  - `brute_force` - Brute force login attempts
  - `u2r` - User to Root (privilege escalation)

### 2. Pattern-Based Detection (Fallback)
If ML doesn't classify, the system uses pattern matching:
- **High frequency TCP** (>50 packets/min) → `dos` or `ddos`
- **High frequency UDP** (>100 packets/min) → `dos`
- **High frequency ICMP** (>20 packets/min) → `ping_sweep`
- **Many small packets** → `port_scan`
- **Suspicious patterns** → `suspicious_traffic`

## Where Attack Types Appear

### 1. **Security Alerts Page**
- Main alert title shows attack type with emoji
- Example: "🚨 Denial of Service (85% confidence)"
- Shows confidence percentage
- Shows if IP was auto-blocked

### 2. **Monitoring Page**
- Attack type column in alert details
- Color-coded (red for attacks, green for normal)
- Shows confidence percentage

### 3. **Dashboard**
- "ATTACKS DETECTED" counter shows total malicious packets
- Real-time updates when attacks are detected

### 4. **Notifications (All Pages)**
- Pop-up notifications in top-right corner
- Shows attack type, IP, and confidence
- "BLOCKED" badge if auto-blocked

## Testing Attack Detection

### From Kali VM:
```bash
# Port Scan (should detect as "port_scan")
nmap -p 1-100 <IDS_VM_IP>

# SYN Flood (should detect as "dos")
hping3 -S --flood -p 5001 <IDS_VM_IP>

# ICMP Flood (should detect as "ping_sweep")
ping -f <IDS_VM_IP>

# HTTP Flood (should detect as "ddos")
for i in {1..1000}; do curl http://<IDS_VM_IP>:5001; done
```

### Manual Testing:
- Any high-frequency traffic will trigger detection
- System analyzes packet patterns in real-time
- ML model classifies attack type automatically

## What You Should See

1. **Immediate Detection**: Alerts appear within 1-2 seconds
2. **Attack Type Label**: Clear label like "🚨 Denial of Service"
3. **Confidence Score**: Percentage showing detection confidence
4. **Auto-Blocking**: High-confidence attacks (>60%) are auto-blocked
5. **Real-time Updates**: All pages update automatically

## Troubleshooting

### If attacks aren't detected:
1. Check VMs are on same network (ping test)
2. Verify ML service is running: `ps aux | grep prediction_service`
3. Check packet capture is active (Events Log should show packets)
4. Lower thresholds may be needed (already lowered in code)

### If attack types show as "unknown":
- ML model may need retraining
- Pattern-based detection will still work
- Check backend logs for ML errors

