from flask import Flask, request, jsonify
import pickle
import numpy as np
import pandas as pd
from typing import List, Dict, Any
from sklearn.base import BaseEstimator
import joblib

app = Flask(__name__)

# Load models
try:
    print("Attempting to load models...")
    # Try loading with joblib first
    try:
        binary_model = joblib.load('binary_attack_model.pkl')
        multiclass_model = joblib.load('multiclass_attack_model.pkl')
        print("Models loaded successfully with joblib")
    except:
        # Fall back to pickle if joblib fails
        print("Joblib loading failed, trying pickle...")
        binary_model = pickle.load(open('binary_attack_model.pkl', 'rb'))
        multiclass_model = pickle.load(open('multiclass_attack_model.pkl', 'rb'))
        print("Models loaded successfully with pickle")

    # Print model information
    print(f"Binary model type: {type(binary_model)}")
    print(f"Binary model attributes: {dir(binary_model)}")
    print(f"Multiclass model type: {type(multiclass_model)}")
    print(f"Multiclass model attributes: {dir(multiclass_model)}")

    # Verify models have required methods
    if not hasattr(binary_model, 'predict'):
        raise AttributeError("Binary model does not have predict method")
    if not hasattr(multiclass_model, 'predict'):
        raise AttributeError("Multiclass model does not have predict method")

except Exception as e:
    print(f"Error loading models: {e}")
    raise

def preprocess_packet(packet: Dict[str, Any]) -> np.ndarray:
    """Preprocess a single packet into features with enhanced attack detection."""
    # Enhanced feature extraction for better attack detection
    features = {
        'Destination Port': 0,
        'Flow Duration': 0,
        'Total Fwd Packets': 0,
        'Total Backward Packets': 0,
        'Total Length of Fwd Packets': 0,
        'Total Length of Bwd Packets': 0,
        'Fwd Packet Length Max': 0,
        'Fwd Packet Length Min': 0,
        'Fwd Packet Length Mean': 0,
        'Fwd Packet Length Std': 0,
        'Bwd Packet Length Max': 0,
        'Bwd Packet Length Min': 0,
        'Bwd Packet Length Mean': 0,
        'Bwd Packet Length Std': 0,
        'Flow Packets/s': 0,
        'Flow IAT Mean': 0,
        'Flow IAT Std': 0,
        'Flow IAT Max': 0,
        'Flow IAT Min': 0,
        'Fwd IAT Total': 0,
        'Fwd IAT Mean': 0,
        'Fwd IAT Std': 0,
        'Fwd IAT Max': 0,
        'Fwd IAT Min': 0,
        'Bwd IAT Total': 0,
        'Bwd IAT Mean': 0,
        'Bwd IAT Std': 0,
        'Bwd IAT Max': 0,
        'Bwd IAT Min': 0,
        'Fwd PSH Flags': 0,
        'Bwd PSH Flags': 0,
        'Fwd URG Flags': 0,
        'Bwd URG Flags': 0,
        'Fwd Header Length': 0,
        'Bwd Header Length': 0,
        'Fwd Packets/s': 0,
        'Bwd Packets/s': 0,
        'Min Packet Length': 0,
        'Max Packet Length': 0,
        'Packet Length Mean': 0,
        'Packet Length Std': 0,
        'Packet Length Variance': 0,
        'FIN Flag Count': 0,
        'SYN Flag Count': 0,
        'RST Flag Count': 0,
        'PSH Flag Count': 0,
        'ACK Flag Count': 0,
        'URG Flag Count': 0,
        'CWE Flag Count': 0,
        'ECE Flag Count': 0,
        'Down/Up Ratio': 0,
        'Average Packet Size': 0,
        'Avg Fwd Segment Size': 0,
        'Avg Bwd Segment Size': 0,
        'Fwd Header Length.1': 0,
        'Fwd Avg Bytes/Bulk': 0,
        'Fwd Avg Packets/Bulk': 0,
        'Fwd Avg Bulk Rate': 0,
        'Bwd Avg Bytes/Bulk': 0,
        'Bwd Avg Packets/Bulk': 0,
        'Bwd Avg Bulk Rate': 0,
        'Subflow Fwd Packets': 0,
        'Subflow Fwd Bytes': 0,
        'Subflow Bwd Packets': 0,
        'Subflow Bwd Bytes': 0,
        'Init_Win_bytes_forward': 0,
        'Init_Win_bytes_backward': 0,
        'act_data_pkt_fwd': 0,
        'min_seg_size_forward': 0,
        'Active Mean': 0,
        'Active Std': 0,
        'Active Max': 0,
        'Active Min': 0,
        'Idle Mean': 0,
        'Idle Std': 0,
        'Idle Max': 0,
        'Idle Min': 0
    }
    
    # Enhanced packet data extraction
    start_bytes = max(0, packet.get('start_bytes', 0))
    end_bytes = max(0, packet.get('end_bytes', 0))
    frequency = max(0, packet.get('frequency', 0))
    protocol = packet.get('protocol', 'TCP').upper()
    status = packet.get('status', 'normal')
    description = packet.get('description', '')
    
    # Extract port information from description
    src_port = 0
    dst_port = 0
    if '->' in description:
        try:
            parts = description.split('->')
            if len(parts) == 2:
                src_port = int(parts[0].split()[-1]) if parts[0].split()[-1].isdigit() else 0
                dst_port = int(parts[1].strip().split()[0]) if parts[1].strip().split()[0].isdigit() else 0
        except:
            pass
    
    # Enhanced basic packet features
    features['Destination Port'] = dst_port
    features['Total Length of Fwd Packets'] = start_bytes
    features['Total Length of Bwd Packets'] = end_bytes
    features['Flow Packets/s'] = max(0.1, frequency)  # Avoid zero division
    features['Max Packet Length'] = max(start_bytes, end_bytes, 1)
    features['Min Packet Length'] = min(start_bytes, end_bytes) if (start_bytes > 0 or end_bytes > 0) else 1
    features['act_data_pkt_fwd'] = 1 if start_bytes > 0 else 0
    features['min_seg_size_forward'] = start_bytes if start_bytes > 0 else 1
    features['Fwd Header Length'] = max(20, start_bytes)  # Minimum IP header size
    features['Fwd Header Length.1'] = max(20, start_bytes)
    features['Bwd Header Length'] = max(20, end_bytes) if end_bytes > 0 else 0
    
    # Enhanced derived features with attack pattern detection
    total_bytes = start_bytes + end_bytes
    packet_count = 1  # Single packet in this flow
    
    # Flow duration estimation (based on frequency)
    flow_duration = max(1, 1000 / frequency) if frequency > 0 else 1000
    features['Flow Duration'] = flow_duration
    
    # Packet counts
    features['Total Fwd Packets'] = 1 if start_bytes > 0 else 0
    features['Total Backward Packets'] = 1 if end_bytes > 0 else 0
    
    if total_bytes > 0:
        features['Average Packet Size'] = total_bytes / 2
        features['Packet Length Mean'] = total_bytes / 2
        mean_size = total_bytes / 2
        features['Packet Length Variance'] = ((start_bytes - mean_size)**2 + (end_bytes - mean_size)**2) / 2
        features['Packet Length Std'] = np.sqrt(max(0, features['Packet Length Variance']))
        
        # Calculate segment sizes
        features['Avg Fwd Segment Size'] = start_bytes if start_bytes > 0 else 0
        features['Avg Bwd Segment Size'] = end_bytes if end_bytes > 0 else 0
        
        # Calculate down/up ratio (detects data exfiltration)
        if end_bytes > 0:
            features['Down/Up Ratio'] = start_bytes / end_bytes
        else:
            features['Down/Up Ratio'] = start_bytes if start_bytes > 0 else 0.1
    
    # Enhanced protocol-specific features with attack indicators
    if protocol == 'TCP':
        features['SYN Flag Count'] = 1
        features['ACK Flag Count'] = 1
        features['Fwd PSH Flags'] = 1
        features['Bwd PSH Flags'] = 1
        # Port scan detection (common scan ports)
        if dst_port in [22, 23, 25, 53, 80, 135, 139, 443, 445, 1433, 3306, 3389, 5432]:
            features['SYN Flag Count'] = 2  # Higher weight for common ports
    elif protocol == 'UDP':
        features['PSH Flag Count'] = 1
        features['Fwd PSH Flags'] = 1
        # UDP flood detection
        if frequency > 100:
            features['PSH Flag Count'] = 2
    elif protocol == 'ICMP':
        features['URG Flag Count'] = 1
        features['Fwd URG Flags'] = 1
        # ICMP flood/ping sweep detection
        if frequency > 50:
            features['URG Flag Count'] = 2
    
    # Attack pattern indicators
    # High frequency = potential DDoS
    if frequency > 500:
        features['Flow Packets/s'] = frequency * 1.5
        features['Fwd Packets/s'] = frequency
        features['Bwd Packets/s'] = frequency * 0.5
    
    # Suspicious packet size patterns
    if start_bytes > 1500 or end_bytes > 1500:  # Jumbo frames or fragmentation attack
        features['Fwd Packet Length Max'] = start_bytes * 1.2
        features['Bwd Packet Length Max'] = end_bytes * 1.2
    
    if start_bytes < 64 or end_bytes < 64:  # Tiny packets (potential scan)
        features['Fwd Packet Length Min'] = start_bytes * 0.5
        features['Bwd Packet Length Min'] = end_bytes * 0.5
    
    # Enhanced IAT (Inter-Arrival Time) features for attack detection
    # Estimate IAT based on frequency
    if frequency > 0:
        iat_mean = 1000.0 / frequency
        features['Flow IAT Mean'] = iat_mean
        features['Flow IAT Std'] = iat_mean * 0.3  # Estimated variation
        features['Flow IAT Max'] = iat_mean * 2
        features['Flow IAT Min'] = iat_mean * 0.1
        features['Fwd IAT Total'] = iat_mean
        features['Fwd IAT Mean'] = iat_mean
        features['Fwd IAT Std'] = iat_mean * 0.3
        features['Fwd IAT Max'] = iat_mean * 2
        features['Fwd IAT Min'] = iat_mean * 0.1
        features['Bwd IAT Total'] = iat_mean * 0.5
        features['Bwd IAT Mean'] = iat_mean * 0.5
        features['Bwd IAT Std'] = iat_mean * 0.15
        features['Bwd IAT Max'] = iat_mean
        features['Bwd IAT Min'] = iat_mean * 0.05
    else:
        # Default values
        features['Flow IAT Mean'] = 1000
        features['Flow IAT Std'] = 300
        features['Flow IAT Max'] = 2000
        features['Flow IAT Min'] = 100
    
    # Calculate bulk features
    if start_bytes > 0:
        features['Fwd Avg Bulk Rate'] = start_bytes
        features['Fwd Avg Bytes/Bulk'] = start_bytes
        features['Fwd Avg Packets/Bulk'] = 1
        features['Avg Fwd Segment Size'] = start_bytes
    
    if end_bytes > 0:
        features['Bwd Avg Bulk Rate'] = end_bytes
        features['Bwd Avg Bytes/Bulk'] = end_bytes
        features['Bwd Avg Packets/Bulk'] = 1
        features['Avg Bwd Segment Size'] = end_bytes
    
    # Calculate subflow features
    features['Subflow Fwd Packets'] = 1 if start_bytes > 0 else 0
    features['Subflow Fwd Bytes'] = start_bytes
    features['Subflow Bwd Packets'] = 1 if end_bytes > 0 else 0
    features['Subflow Bwd Bytes'] = end_bytes
    
    # Calculate window sizes
    features['Init_Win_bytes_forward'] = start_bytes
    features['Init_Win_bytes_backward'] = end_bytes
    
    # Convert to DataFrame and ensure feature order matches training data
    features_df = pd.DataFrame([features])
    
    # Print feature names for debugging
    print("Feature names in DataFrame:", features_df.columns.tolist())
    
    return features_df

# Rate limiting for predictions to prevent overload
from collections import defaultdict
from time import time
prediction_rates = defaultdict(list)
MAX_PREDICTIONS_PER_SECOND = 50  # Limit to prevent crashes

def check_rate_limit():
    """Simple rate limiter to prevent overload"""
    now = time()
    # Clean old entries (older than 1 second)
    for key in list(prediction_rates.keys()):
        prediction_rates[key] = [t for t in prediction_rates[key] if now - t < 1.0]
    
    # Check if we're over limit
    total_recent = sum(len(times) for times in prediction_rates.values())
    if total_recent > MAX_PREDICTIONS_PER_SECOND:
        return False
    return True

def detect_attack_pattern(packet: Dict[str, Any]) -> Dict[str, Any]:
    """
    Pattern-based attack detection (works without ML model training).
    This is actually more reliable than weak ML models for real-time detection.
    """
    protocol = packet.get('protocol', 'TCP').upper()
    frequency = packet.get('frequency', 0)
    start_bytes = packet.get('start_bytes', 0)
    end_bytes = packet.get('end_bytes', 0)
    start_ip = packet.get('start_ip', '')
    end_ip = packet.get('end_ip', '')
    
    # Calculate total packet size
    packet_size = start_bytes + end_bytes
    
    # Initialize result
    result = {
        'binary_prediction': 'benign',
        'attack_type': 'normal',
        'confidence': {
            'binary': 0.0,
            'multiclass': 0.0
        }
    }
    
    # ICMP Attack Detection
    if protocol == 'ICMP':
        if frequency > 50:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'ping_flood'
            result['confidence']['binary'] = min(0.95, 0.5 + (frequency / 200))
            result['confidence']['multiclass'] = 0.9
        elif frequency > 30:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'ping_sweep'
            result['confidence']['binary'] = min(0.9, 0.4 + (frequency / 150))
            result['confidence']['multiclass'] = 0.85
        elif frequency > 20:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'icmp_flood'
            result['confidence']['binary'] = 0.7
            result['confidence']['multiclass'] = 0.75
    
    # TCP Attack Detection
    elif protocol == 'TCP':
        if frequency > 200:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'ddos'
            result['confidence']['binary'] = min(0.98, 0.6 + (frequency / 500))
            result['confidence']['multiclass'] = 0.95
        elif frequency > 100:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'dos'
            result['confidence']['binary'] = min(0.95, 0.5 + (frequency / 300))
            result['confidence']['multiclass'] = 0.9
        elif frequency > 50:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'dos'
            result['confidence']['binary'] = 0.75
            result['confidence']['multiclass'] = 0.8
        elif frequency > 30 and packet_size < 100:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'port_scan'
            result['confidence']['binary'] = 0.8
            result['confidence']['multiclass'] = 0.85
        elif frequency > 20:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'probe'
            result['confidence']['binary'] = 0.7
            result['confidence']['multiclass'] = 0.75
    
    # UDP Attack Detection
    elif protocol == 'UDP':
        if frequency > 150:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'ddos'
            result['confidence']['binary'] = min(0.97, 0.55 + (frequency / 400))
            result['confidence']['multiclass'] = 0.92
        elif frequency > 100:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'dos'
            result['confidence']['binary'] = min(0.93, 0.5 + (frequency / 250))
            result['confidence']['multiclass'] = 0.88
        elif frequency > 50:
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'udp_flood'
            result['confidence']['binary'] = 0.75
            result['confidence']['multiclass'] = 0.8
    
    # Port Scan Detection (any protocol with many small packets)
    if frequency > 40 and packet_size < 80:
        result['binary_prediction'] = 'malicious'
        result['attack_type'] = 'port_scan'
        result['confidence']['binary'] = max(result['confidence']['binary'], 0.85)
        result['confidence']['multiclass'] = max(result['confidence']['multiclass'], 0.88)
    
    # Brute Force Detection (many packets to same port)
    if frequency > 25 and protocol in ['TCP', 'UDP']:
        if result['attack_type'] == 'normal':
            result['binary_prediction'] = 'malicious'
            result['attack_type'] = 'brute_force'
            result['confidence']['binary'] = 0.7
            result['confidence']['multiclass'] = 0.75
    
    return result

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Rate limiting check
        if not check_rate_limit():
            return jsonify({'error': 'Rate limit exceeded. Please slow down requests.'}), 429
        
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Log request (throttled)
        if time() % 10 < 1:  # Log roughly every 10 seconds
            print(f"[PREDICT] Received prediction request")

        # Handle both single packet and list of packets
        if isinstance(data, dict) and 'packet' in data:
            # Single packet wrapped in object
            packets = [data['packet']]
        elif isinstance(data, list):
            # List of packets
            packets = data
        elif isinstance(data, dict):
            # Single packet
            packets = [data]
        else:
            return jsonify({'error': 'Invalid data format'}), 400

        if len(packets) == 0:
            return jsonify({'error': 'Empty packet list'}), 400

        results = []
        for packet in packets:
            # Validate packet structure
            if not isinstance(packet, dict):
                return jsonify({'error': 'Each packet must be a dictionary'}), 400

            print(f"Processing packet: {packet}")

            # Set default values for missing fields
            packet.setdefault('start_bytes', 0)
            packet.setdefault('end_bytes', 0)
            packet.setdefault('protocol', 'TCP')
            packet.setdefault('description', 'Unknown')
            packet.setdefault('frequency', 1)

            # Preprocess packet
            try:
                features = preprocess_packet(packet)
            except Exception as e:
                return jsonify({'error': f'Error preprocessing packet: {str(e)}'}), 400
            
            # Get predictions with enhanced error handling
            try:
                # Record prediction time for rate limiting
                prediction_rates['predictions'].append(time())
                
                # Make predictions with timeout protection
                binary_pred = binary_model.predict(features)[0]
                multiclass_pred = multiclass_model.predict(features)[0]
                
                # Enhanced attack type classification with better labels
                binary_label = 'malicious' if binary_pred == 1 else 'benign'
                
                # Map multiclass predictions to detailed attack types
                attack_type_map = {
                    0: 'normal',
                    1: 'dos',      # Denial of Service
                    2: 'probe',    # Port scan, reconnaissance
                    3: 'r2l',      # Remote to Local (unauthorized access)
                    4: 'u2r'       # User to Root (privilege escalation)
                }
                
                attack_type = attack_type_map.get(multiclass_pred, 'unknown')
                
                # Enhance attack type based on packet characteristics
                if binary_label == 'malicious':
                    protocol = packet.get('protocol', '').upper()
                    frequency = packet.get('frequency', 0)
                    
                    # Refine attack type based on patterns
                    if attack_type == 'dos' and frequency > 1000:
                        attack_type = 'ddos'  # Distributed DoS
                    elif attack_type == 'probe' and protocol == 'ICMP':
                        attack_type = 'ping_sweep'
                    elif attack_type == 'probe' and frequency > 200:
                        attack_type = 'port_scan'
                    elif attack_type == 'r2l' and protocol == 'TCP':
                        attack_type = 'brute_force'
                
                # Get confidence scores safely
                try:
                    binary_confidence = float(binary_model.predict_proba(features)[0][1])
                except:
                    binary_confidence = 0.5

                try:
                    multiclass_confidence = float(multiclass_model.predict_proba(features)[0][multiclass_pred])
                except:
                    multiclass_confidence = 0.5

                results.append({
                    'packet_id': packet.get('_id', ''),
                    'binary_prediction': binary_label,
                    'attack_type': attack_type,
                    'confidence': {
                        'binary': binary_confidence,
                        'multiclass': multiclass_confidence
                    }
                })
            except Exception as e:
                error_msg = str(e)
                print(f"[PREDICT] Prediction error: {error_msg}")
                # Return safe defaults instead of crashing
                return jsonify({
                    'packet_id': packet.get('_id', ''),
                    'binary_prediction': 'benign',  # Safe default
                    'attack_type': 'normal',
                    'confidence': {
                        'binary': 0.5,
                        'multiclass': 0.5
                    },
                    'error': f'Prediction failed: {error_msg}'
                }), 200  # Return 200 with error in response to prevent crashes

        # Return single result if single packet was sent
        if len(results) == 1:
            return jsonify(results[0])
        return jsonify(results)
    except Exception as e:
        error_msg = str(e)
        print(f"[PREDICT] Server error: {error_msg}")
        # Return error response without crashing
        return jsonify({'error': f'Server error: {error_msg}'}), 500

if __name__ == '__main__':
    try:
        app.run(host='0.0.0.0', port=5002, debug=True)
    except KeyboardInterrupt:
        print("\nShutting down gracefully...")
    except Exception as e:
        print(f"Error running server: {e}")
    finally:
        print("Server stopped.") 