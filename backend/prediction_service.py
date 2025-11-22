from flask import Flask, request, jsonify
import pickle
import numpy as np
import pandas as pd
from typing import List, Dict, Any
from sklearn.base import BaseEstimator
import joblib
import os
from attack_detectors import comprehensive_detector

app = Flask(__name__)

# Configuration: Set USE_ML_MODELS=false to disable ML models and use only rule-based detection
USE_ML_MODELS = os.getenv('USE_ML_MODELS', 'false').lower() == 'true'

binary_model = None
multiclass_model = None

# Load models only if ML models are enabled
if USE_ML_MODELS:
    try:
        print("🤖 ML MODELS ENABLED - Attempting to load models...")
        # Try loading with joblib first
        try:
            binary_model = joblib.load('binary_attack_model.pkl')
            multiclass_model = joblib.load('multiclass_attack_model.pkl')
            print("✅ Models loaded successfully with joblib")
        except:
            # Fall back to pickle if joblib fails
            print("⚠️ Joblib loading failed, trying pickle...")
            binary_model = pickle.load(open('binary_attack_model.pkl', 'rb'))
            multiclass_model = pickle.load(open('multiclass_attack_model.pkl', 'rb'))
            print("✅ Models loaded successfully with pickle")

        # Print model information
        print(f"Binary model type: {type(binary_model)}")
        print(f"Multiclass model type: {type(multiclass_model)}")

        # Verify models have required methods
        if not hasattr(binary_model, 'predict'):
            raise AttributeError("Binary model does not have predict method")
        if not hasattr(multiclass_model, 'predict'):
            raise AttributeError("Multiclass model does not have predict method")
        
        print("✅ ML models ready!")
    except Exception as e:
        print(f"❌ Error loading ML models: {e}")
        print("⚠️ Falling back to rule-based detection only")
        binary_model = None
        multiclass_model = None
        USE_ML_MODELS = False
else:
    print("🔍 ML MODELS DISABLED - Using rule-based attack detection only")
    print("   (Set USE_ML_MODELS=true to enable ML models)")

def preprocess_packet(packet: Dict[str, Any]) -> np.ndarray:
    """Preprocess a single packet into features."""
    # Create a dictionary with all features initialized to 0
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
    
    # Map packet data to features
    start_bytes = packet.get('start_bytes', 0)
    end_bytes = packet.get('end_bytes', 0)
    frequency = packet.get('frequency', 0)
    
    # Basic packet features
    features['Total Length of Fwd Packets'] = start_bytes
    features['Total Length of Bwd Packets'] = end_bytes
    features['Flow Packets/s'] = frequency
    features['Max Packet Length'] = max(start_bytes, end_bytes)
    features['Min Packet Length'] = min(start_bytes, end_bytes)
    features['act_data_pkt_fwd'] = 1 if start_bytes > 0 else 0
    features['min_seg_size_forward'] = start_bytes
    features['Fwd Header Length'] = start_bytes
    features['Fwd Header Length.1'] = start_bytes
    features['Bwd Header Length'] = end_bytes
    
    # Calculate derived features
    total_bytes = start_bytes + end_bytes
    if total_bytes > 0:
        features['Average Packet Size'] = total_bytes / 2
        features['Packet Length Mean'] = total_bytes / 2
        features['Packet Length Variance'] = ((start_bytes - features['Packet Length Mean'])**2 + 
                                           (end_bytes - features['Packet Length Mean'])**2) / 2
        features['Packet Length Std'] = np.sqrt(features['Packet Length Variance'])
        
        # Calculate segment sizes
        features['Avg Fwd Segment Size'] = start_bytes
        features['Avg Bwd Segment Size'] = end_bytes
        
        # Calculate down/up ratio
        if end_bytes > 0:
            features['Down/Up Ratio'] = start_bytes / end_bytes
    
    # Protocol specific features
    protocol = packet.get('protocol', '').upper()
    if protocol == 'TCP':
        features['SYN Flag Count'] = 1
        features['ACK Flag Count'] = 1
        features['Fwd PSH Flags'] = 1
        features['Bwd PSH Flags'] = 1
    elif protocol == 'UDP':
        features['PSH Flag Count'] = 1
        features['Fwd PSH Flags'] = 1
    elif protocol == 'ICMP':
        features['URG Flag Count'] = 1
        features['Fwd URG Flags'] = 1
    
    # Port and flow features
    description = packet.get('description', '')
    dest_port = None
    if '->' in description:
        try:
            dest_port = int(description.split('->')[1].strip())
            features['Destination Port'] = dest_port
        except:
            pass
    
    # Comprehensive attack detection features - ULTRA SHARP FEATURE EXTRACTION
    source_ip = packet.get('start_ip', '')
    dest_ip = packet.get('end_ip', '')
    protocol = packet.get('protocol', 'TCP')
    
    # Get comprehensive attack detection results with error handling
    attack_detection = None
    if source_ip and dest_ip:
        try:
            attack_detection = comprehensive_detector.analyze_packet(packet)
        except Exception as e:
            print(f"⚠️ Error in attack detector: {e}")
            attack_detection = None  # Continue without detector features
        
        # ULTRA SHARP: Use ALL attack detector features to enhance ML input
        if attack_detection and isinstance(attack_detection, dict):
            try:
                ps_features = attack_detection.get('port_scan_features', {})
                dos_features = attack_detection.get('dos_features', {})
                r2l_features = attack_detection.get('r2l_features', {})
                u2r_features = attack_detection.get('u2r_features', {})
                bf_features = attack_detection.get('brute_force_features', {})
            except Exception as e:
                print(f"⚠️ Error extracting detector features: {e}")
                ps_features = dos_features = r2l_features = u2r_features = bf_features = {}
            
            # PORT SCAN FEATURES - Map all port scan indicators (with safety checks)
            try:
                if ps_features and (ps_features.get('is_port_scan', False) or ps_features.get('port_scan_score', 0) > 0.1):
                    unique_ports = ps_features.get('unique_ports', 0) or 0
                    packets_per_sec = ps_features.get('packets_per_second', 0) or 0
                    port_scan_rate = ps_features.get('port_scan_rate', 0) or 0
                    sequential_score = ps_features.get('sequential_score', 0) or 0
                    
                    # High unique ports = port scan signature
                    features['Total Fwd Packets'] = max(features.get('Total Fwd Packets', 0),
                                                        unique_ports * 10)  # Amplify signal
                    features['Flow Packets/s'] = max(features.get('Flow Packets/s', 0),
                                                    packets_per_sec * 2)  # Amplify signal
                    features['Destination Port'] = 0  # Many ports = scan pattern
                    # Sequential ports = strong scan indicator
                    if sequential_score > 0.3:
                        features['Total Fwd Packets'] = max(features.get('Total Fwd Packets', 0), 
                                                           unique_ports * 20)
                    # Port scan rate feature
                    features['Fwd Packets/s'] = max(features.get('Fwd Packets/s', 0),
                                                  port_scan_rate * 5)
            except Exception as e:
                print(f"⚠️ Error processing port scan features: {e}")
            
            # DOS FEATURES - Map all DoS attack indicators (with safety checks and value capping)
            try:
                if dos_features and (dos_features.get('is_dos', False) or dos_features.get('dos_score', 0) > 0.1):
                    # Extract and cap values to prevent overflow
                    packets_per_sec = min(float(dos_features.get('packets_per_second', 0) or 0), 100000.0)  # Cap at 100k
                    packet_count = min(float(dos_features.get('packet_count', 0) or 0), 100000.0)  # Cap at 100k
                    avg_packet_size = min(float(dos_features.get('avg_packet_size', 0) or 0), 65535.0)  # Cap at max packet size
                    syn_packets = min(float(dos_features.get('syn_packets', 0) or 0), 10000.0)  # Cap at 10k
                    bytes_per_sec = min(float(dos_features.get('bytes_per_second', 0) or 0), 10000000.0)  # Cap at 10MB/s
                    
                    # Ensure no NaN or inf
                    if np.isnan(packets_per_sec) or np.isinf(packets_per_sec):
                        packets_per_sec = 0.0
                    if np.isnan(packet_count) or np.isinf(packet_count):
                        packet_count = 0.0
                    if np.isnan(avg_packet_size) or np.isinf(avg_packet_size):
                        avg_packet_size = 0.0
                    if np.isnan(syn_packets) or np.isinf(syn_packets):
                        syn_packets = 0.0
                    if np.isnan(bytes_per_sec) or np.isinf(bytes_per_sec):
                        bytes_per_sec = 0.0
                    
                    # Extremely high packet rate = DoS (cap amplified values)
                    amplified_pps = min(packets_per_sec * 3, 100000.0)  # Cap amplified value
                    features['Flow Packets/s'] = max(features.get('Flow Packets/s', 0) or 0, amplified_pps)
                    
                    amplified_packet_count = min(packet_count * 2, 100000.0)  # Cap amplified value
                    features['Total Fwd Packets'] = max(features.get('Total Fwd Packets', 0) or 0, amplified_packet_count)
                    
                    features['Fwd Packets/s'] = max(features.get('Fwd Packets/s', 0) or 0, amplified_pps)
                    
                    # Small packets at high rate = flood
                    if avg_packet_size > 0 and avg_packet_size < 200:
                        features['Min Packet Length'] = avg_packet_size
                        features['Packet Length Mean'] = avg_packet_size
                    
                    # SYN flood indicator (cap values)
                    if syn_packets > 20:
                        features['SYN Flag Count'] = min(100, syn_packets)  # Cap at 100
                        amplified_syn = min(syn_packets * 5, 50000.0)  # Cap amplified value
                        features['Total Fwd Packets'] = max(features.get('Total Fwd Packets', 0) or 0, amplified_syn)
                    
                    # Bytes per second = bandwidth attack (safe division)
                    if bytes_per_sec > 0:
                        normalized_bytes = min(bytes_per_sec / 10, 1000000.0)  # Cap normalized value
                        features['Total Length of Fwd Packets'] = max(
                            features.get('Total Length of Fwd Packets', 0) or 0,
                            normalized_bytes
                        )
            except Exception as e:
                print(f"⚠️ Error processing DoS features: {e}")
                import traceback
                traceback.print_exc()  # Print full traceback for debugging
            
            # R2L FEATURES - Remote to Local attack indicators (with safety checks)
            try:
                if r2l_features and (r2l_features.get('is_r2l', False) or r2l_features.get('r2l_score', 0) > 0.1):
                    failed_logins = r2l_features.get('failed_logins', 0) or 0
                    privilege_attempts = r2l_features.get('privilege_attempts', 0) or 0
                    suspicious_commands = r2l_features.get('suspicious_commands', 0) or 0
                    
                    # Failed logins = brute force attempt
                    features['Total Fwd Packets'] = max(features.get('Total Fwd Packets', 0),
                                                       failed_logins * 5)
                    # Privilege escalation attempts
                    if privilege_attempts > 0:
                        features['Total Backward Packets'] = max(
                            features.get('Total Backward Packets', 0),
                            privilege_attempts * 3
                        )
                    # Suspicious commands
                    if suspicious_commands > 0:
                        features['Fwd Header Length'] = max(features.get('Fwd Header Length', 0),
                                                          suspicious_commands * 10)
            except Exception as e:
                print(f"⚠️ Error processing R2L features: {e}")
            
            # U2R FEATURES - User to Root attack indicators (with safety checks)
            try:
                if u2r_features and (u2r_features.get('is_u2r', False) or u2r_features.get('u2r_score', 0) > 0.1):
                    root_commands = u2r_features.get('root_commands', 0) or 0
                    setuid_attempts = u2r_features.get('setuid_attempts', 0) or 0
                    
                    # Root command attempts
                    if root_commands > 0:
                        features['Total Fwd Packets'] = max(features.get('Total Fwd Packets', 0),
                                                          root_commands * 10)
                    # Setuid attempts
                    if setuid_attempts > 0:
                        features['Total Backward Packets'] = max(
                            features.get('Total Backward Packets', 0),
                            setuid_attempts * 8
                        )
            except Exception as e:
                print(f"⚠️ Error processing U2R features: {e}")
            
            # BRUTE FORCE FEATURES - Login brute force indicators (with safety checks)
            try:
                if bf_features and (bf_features.get('is_brute_force', False) or bf_features.get('brute_force_score', 0) > 0.1):
                    failed_attempts = bf_features.get('failed_attempts', 0) or 0
                    login_attempts = bf_features.get('login_attempts', 0) or 0
                    unique_dest_ips = bf_features.get('unique_dest_ips', 0) or 0
                    
                    # High failed login attempts
                    features['Total Fwd Packets'] = max(features.get('Total Fwd Packets', 0),
                                                       failed_attempts * 8)
                    # Login attempt rate
                    if login_attempts > 0:
                        features['Flow Packets/s'] = max(features.get('Flow Packets/s', 0),
                                                        login_attempts * 2)
                    # Multiple destinations = distributed brute force
                    if unique_dest_ips > 1:
                        features['Total Backward Packets'] = max(
                            features.get('Total Backward Packets', 0),
                            unique_dest_ips * 5
                        )
            except Exception as e:
                print(f"⚠️ Error processing brute force features: {e}")
            
            # OVERALL ATTACK SCORE - Boost all features if ANY attack detected (with safety checks and capping)
            try:
                if attack_detection and attack_detection.get('is_malicious', False):
                    overall_confidence = float(attack_detection.get('confidence', 0) or 0)
                    # Cap confidence to valid range
                    overall_confidence = max(0.0, min(1.0, overall_confidence))
                    
                    # If detector is very confident, significantly boost ML features (with capping)
                    if overall_confidence > 0.7:
                        current_pps = min(float(features.get('Flow Packets/s', 0) or 0), 50000.0)
                        current_fwd = min(float(features.get('Total Fwd Packets', 0) or 0), 50000.0)
                        current_fwd_pps = min(float(features.get('Fwd Packets/s', 0) or 0), 50000.0)
                        
                        features['Flow Packets/s'] = min(current_pps * 2, 100000.0)  # Cap at 100k
                        features['Total Fwd Packets'] = min(current_fwd * 2, 100000.0)  # Cap at 100k
                        features['Fwd Packets/s'] = min(current_fwd_pps * 2, 100000.0)  # Cap at 100k
                    # If detector is moderately confident, moderate boost (with capping)
                    elif overall_confidence > 0.5:
                        current_pps = min(float(features.get('Flow Packets/s', 0) or 0), 50000.0)
                        current_fwd = min(float(features.get('Total Fwd Packets', 0) or 0), 50000.0)
                        
                        features['Flow Packets/s'] = min(current_pps * 1.5, 100000.0)  # Cap at 100k
                        features['Total Fwd Packets'] = min(current_fwd * 1.5, 100000.0)  # Cap at 100k
            except Exception as e:
                print(f"⚠️ Error processing overall attack score: {e}")
                import traceback
                traceback.print_exc()  # Print full traceback for debugging
    
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
    
    # ULTRA SHARP: Clean features - replace NaN, inf, and None with 0
    for key, value in features.items():
        if value is None or (isinstance(value, float) and (np.isnan(value) or np.isinf(value))):
            features[key] = 0
        # Ensure all values are numeric
        try:
            features[key] = float(features[key])
        except (ValueError, TypeError):
            features[key] = 0
    
    # Convert to DataFrame and ensure feature order matches training data
    features_df = pd.DataFrame([features])
    
    # Replace any remaining NaN/inf in DataFrame
    features_df = features_df.fillna(0).replace([np.inf, -np.inf], 0)
    
    # Print feature names for debugging (only occasionally to avoid spam)
    # print("Feature names in DataFrame:", features_df.columns.tolist())
    
    return features_df

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Validate request
        if not request.is_json:
            return jsonify({
                'error': 'Content-Type must be application/json',
                'binary_prediction': 'benign',
                'attack_type': 'normal',
                'confidence': {'binary': 0.5, 'multiclass': 0.5},
                'attack_type_probabilities': {
                    'normal': 1.0, 'dos': 0.0, 'probe': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0
                }
            }), 400
        
        data = request.json
        if not data:
            return jsonify({
                'error': 'No data provided',
                'binary_prediction': 'benign',
                'attack_type': 'normal',
                'confidence': {'binary': 0.5, 'multiclass': 0.5},
                'attack_type_probabilities': {
                    'normal': 1.0, 'dos': 0.0, 'probe': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0
                }
            }), 400

        # Handle both single packet and list of packets
        try:
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
                return jsonify({
                    'error': 'Invalid data format',
                    'binary_prediction': 'benign',
                    'attack_type': 'normal',
                    'confidence': {'binary': 0.5, 'multiclass': 0.5},
                    'attack_type_probabilities': {
                        'normal': 1.0, 'dos': 0.0, 'probe': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0
                    }
                }), 400

            if len(packets) == 0:
                return jsonify({
                    'error': 'Empty packet list',
                    'binary_prediction': 'benign',
                    'attack_type': 'normal',
                    'confidence': {'binary': 0.5, 'multiclass': 0.5},
                    'attack_type_probabilities': {
                        'normal': 1.0, 'dos': 0.0, 'probe': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0
                    }
                }), 400
        except Exception as e:
            print(f"⚠️ Error parsing packet data: {e}")
            return jsonify({
                'error': f'Error parsing packet data: {str(e)}',
                'binary_prediction': 'benign',
                'attack_type': 'normal',
                'confidence': {'binary': 0.5, 'multiclass': 0.5},
                'attack_type_probabilities': {
                    'normal': 1.0, 'dos': 0.0, 'probe': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0
                }
            }), 400

        results = []
        for packet in packets:
            try:
                # Validate packet structure
                if not isinstance(packet, dict):
                    print(f"⚠️ Invalid packet type: {type(packet)}")
                    results.append({
                        'packet_id': '',
                        'binary_prediction': 'benign',
                        'attack_type': 'normal',
                        'confidence': {'binary': 0.5, 'multiclass': 0.5},
                        'attack_type_probabilities': {
                            'normal': 1.0, 'dos': 0.0, 'probe': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0
                        },
                        'error': 'Packet must be a dictionary'
                    })
                    continue

                # Set default values for missing fields with validation
                try:
                    packet.setdefault('start_bytes', 0)
                    packet.setdefault('end_bytes', 0)
                    packet.setdefault('protocol', 'TCP')
                    packet.setdefault('description', 'Unknown')
                    packet.setdefault('frequency', 1)
                    packet.setdefault('start_ip', '0.0.0.0')
                    packet.setdefault('end_ip', '0.0.0.0')
                    
                    # Validate and sanitize values
                    try:
                        packet['start_bytes'] = max(0, min(int(packet.get('start_bytes', 0) or 0), 65535))
                        packet['end_bytes'] = max(0, min(int(packet.get('end_bytes', 0) or 0), 65535))
                        packet['frequency'] = max(0, min(float(packet.get('frequency', 1) or 1), 1000000))
                    except (ValueError, TypeError) as e:
                        print(f"⚠️ Error validating packet numeric fields: {e}")
                        packet['start_bytes'] = 0
                        packet['end_bytes'] = 0
                        packet['frequency'] = 1
                    
                    packet['protocol'] = str(packet.get('protocol', 'TCP')).upper()
                    packet['description'] = str(packet.get('description', 'Unknown'))
                    packet['start_ip'] = str(packet.get('start_ip', '0.0.0.0'))
                    packet['end_ip'] = str(packet.get('end_ip', '0.0.0.0'))
                except Exception as e:
                    print(f"⚠️ Error setting packet defaults: {e}")
                    # Use safe defaults
                    packet = {
                        'start_bytes': 0,
                        'end_bytes': 0,
                        'protocol': 'TCP',
                        'description': 'Unknown',
                        'frequency': 1,
                        'start_ip': '0.0.0.0',
                        'end_ip': '0.0.0.0',
                        '_id': packet.get('_id', '') if isinstance(packet, dict) else ''
                    }

                # ULTRA SHARP: Get attack detection BEFORE preprocessing (needed for override logic)
                source_ip = packet.get('start_ip', '')
                dest_ip = packet.get('end_ip', '')
                attack_detection = None
                if source_ip and dest_ip:
                    try:
                        attack_detection = comprehensive_detector.analyze_packet(packet)
                    except Exception as e:
                        print(f"⚠️ Error in attack detector (override logic): {e}")
                        attack_detection = None  # Continue without detector
                
                # Preprocess packet (this also uses attack_detection internally for feature enhancement)
                try:
                    features = preprocess_packet(packet)
                    # Additional safety check - ensure features are valid
                    if features is None or features.empty:
                        print("⚠️ Warning: Empty features DataFrame, using defaults")
                        # Create minimal valid features
                        features = pd.DataFrame([{col: 0 for col in features.columns if hasattr(features, 'columns')}])
                except Exception as e:
                    print(f"❌ CRITICAL: Error preprocessing packet: {e}")
                    import traceback
                    traceback.print_exc()
                    # Return error but don't crash - return a default prediction
                    results.append({
                        'packet_id': packet.get('_id', ''),
                        'binary_prediction': 'benign',
                        'attack_type': 'normal',
                        'confidence': {'binary': 0.5, 'multiclass': 0.5},
                        'attack_type_probabilities': {
                            'normal': 1.0,
                            'dos': 0.0,
                            'probe': 0.0,
                            'r2l': 0.0,
                            'u2r': 0.0,
                            'brute_force': 0.0
                        },
                        'error': f'Error preprocessing packet: {str(e)}'
                    })
                    continue  # Skip rest of processing for this packet
            
                # Get predictions (with comprehensive error handling)
                # If ML models are disabled, skip ML prediction and use only rule-based detection
                if not USE_ML_MODELS or binary_model is None or multiclass_model is None:
                    print("🔍 Using rule-based detection only (ML models disabled)")
                    # Use rule-based detection results from comprehensive_detector
                    if attack_detection and isinstance(attack_detection, dict):
                        # Use detector results directly - THIS IS THE MAIN DETECTION LOGIC
                        is_malicious = attack_detection.get('is_malicious', False)
                        detected_type = attack_detection.get('attack_type', 'normal')
                        detected_confidence = float(attack_detection.get('confidence', 0) or 0)
                        
                        # Set labels based on detector results
                        binary_label = 'malicious' if is_malicious else 'benign'
                        attack_type = detected_type  # Always use detector's attack type
                        
                        # Set confidence based on detector confidence
                        if is_malicious:
                            binary_confidence = max(0.7, detected_confidence)  # At least 70% if malicious
                            multiclass_confidence = max(0.7, detected_confidence)
                        else:
                            binary_confidence = max(0.3, 1.0 - detected_confidence)  # Higher confidence if definitely normal
                            multiclass_confidence = max(0.5, 1.0 - detected_confidence)
                        
                        print(f"🔍 Rule-based detection: {attack_type} (malicious: {is_malicious}, confidence: {detected_confidence:.2f})")
                    else:
                        # Fallback if detector didn't run
                        print("⚠️ Warning: Rule-based detector didn't run, using defaults")
                        binary_label = 'benign'
                        attack_type = 'normal'
                        binary_confidence = 0.5
                        multiclass_confidence = 0.5
                else:
                    try:
                        # Validate features before prediction
                        if features is None or features.empty:
                            raise ValueError("Features DataFrame is empty or None")
                        
                        # Ensure features have the right shape
                        if len(features) == 0:
                            raise ValueError("Features DataFrame has no rows")
                        
                        # Ensure all feature values are finite
                        features_clean = features.fillna(0).replace([np.inf, -np.inf], 0)
                        
                        print("🤖 Making binary prediction with ML model...")
                        try:
                            binary_pred = binary_model.predict(features_clean)[0]
                            print(f"Binary prediction: {binary_pred}")
                        except Exception as e:
                            print(f"⚠️ Error in binary prediction: {e}")
                            binary_pred = 0  # Default to benign
                        
                        print("🤖 Making multiclass prediction with ML model...")
                        try:
                            multiclass_pred = multiclass_model.predict(features_clean)[0]
                            print(f"Multiclass prediction: {multiclass_pred}")
                        except Exception as e:
                            print(f"⚠️ Error in multiclass prediction: {e}")
                            multiclass_pred = 0  # Default to normal
                        
                        # Map predictions to labels (6 attack types: normal, dos, probe, r2l, u2r, brute_force)
                        binary_label = 'malicious' if binary_pred == 1 else 'benign'
                        attack_type = {
                            0: 'normal',
                            1: 'dos',
                            2: 'probe',
                            3: 'r2l',
                            4: 'u2r',
                            5: 'brute_force'  # 6th attack type
                        }.get(multiclass_pred, 'unknown')
                        
                        # Get confidence scores BEFORE override logic (so override can boost them)
                        binary_confidence = 0.5
                        multiclass_confidence = 0.5
                        
                        try:
                            binary_proba = binary_model.predict_proba(features_clean)[0]
                            if len(binary_proba) > 1:
                                binary_confidence = float(binary_proba[1])  # Probability of malicious
                            else:
                                binary_confidence = float(binary_proba[0])
                        except Exception as e:
                            print(f"⚠️ Error getting binary confidence: {e}")
                            binary_confidence = 0.5

                        try:
                            multiclass_proba = multiclass_model.predict_proba(features_clean)[0]
                            if multiclass_pred < len(multiclass_proba):
                                multiclass_confidence = float(multiclass_proba[multiclass_pred])
                            else:
                                multiclass_confidence = float(max(multiclass_proba))  # Use max probability
                        except Exception as e:
                            print(f"⚠️ Error getting multiclass confidence: {e}")
                            multiclass_confidence = 0.5
                    except Exception as e:
                        print(f"⚠️ Error in ML prediction, falling back to rule-based: {e}")
                        binary_label = 'benign'
                        attack_type = 'normal'
                        binary_confidence = 0.5
                        multiclass_confidence = 0.5
                    
                    # ULTRA SHARP: Comprehensive attack detection override - ALWAYS TRUST DETECTORS
                    # Detectors are rule-based and extremely accurate - they override ML completely
                    if attack_detection and isinstance(attack_detection, dict):
                        try:
                            detected_attack_type = attack_detection.get('attack_type', 'unknown')
                            detected_confidence = float(attack_detection.get('confidence', 0) or 0)
                            is_detector_malicious = attack_detection.get('is_malicious', False)
                        except Exception as e:
                            print(f"⚠️ Error extracting attack detection data: {e}")
                            detected_attack_type = 'unknown'
                            detected_confidence = 0.0
                            is_detector_malicious = False
                        
                        # CRITICAL: If detector found ANY attack, ALWAYS use detector's attack_type
                        # This ensures we always show the correct attack type (dos, probe, brute_force, etc.)
                        if is_detector_malicious and detected_attack_type and detected_attack_type != 'normal':
                            print(f"🚨 DETECTOR OVERRIDE: Using detector attack_type: {detected_attack_type} "
                                  f"(detector confidence: {detected_confidence:.2f})")
                            attack_type = detected_attack_type  # ALWAYS use detector's attack type
                        
                        # ULTRA SHARP RULE 1: If detector says attack, ALWAYS mark as malicious
                        # Even if ML says benign, detector is more reliable for known patterns
                        if is_detector_malicious:
                            print(f"🚨 ULTRA SHARP: ATTACK DETECTED for {source_ip}: {detected_attack_type} "
                                  f"(detector confidence: {detected_confidence:.2f}, ML binary: {binary_label})")
                            
                            # COMPLETE OVERRIDE: Detector wins, no questions asked
                            binary_label = 'malicious'
                            # CRITICAL: Always use detector's attack_type, never use ML's "normal"
                            if detected_attack_type and detected_attack_type != 'normal':
                                attack_type = detected_attack_type
                            elif attack_type == 'normal':
                                # If detector says attack but type is unclear, use unknown_attack
                                attack_type = 'unknown_attack'
                            
                            # ULTRA SHARP: Boost confidence aggressively based on detector confidence
                            if detected_confidence >= 0.8:
                                # Very high detector confidence = extremely high ML confidence
                                binary_confidence = max(0.95, detected_confidence)  # Minimum 95%
                                multiclass_confidence = max(0.90, detected_confidence)  # Minimum 90%
                            elif detected_confidence >= 0.6:
                                # High detector confidence = high ML confidence
                                binary_confidence = max(0.85, detected_confidence)  # Minimum 85%
                                multiclass_confidence = max(0.80, detected_confidence)  # Minimum 80%
                            elif detected_confidence >= 0.4:
                                # Moderate detector confidence = moderate-high ML confidence
                                binary_confidence = max(0.75, detected_confidence)  # Minimum 75%
                                multiclass_confidence = max(0.70, detected_confidence)
                            else:
                                # Low detector confidence but still detected = moderate ML confidence
                                binary_confidence = max(binary_confidence, detected_confidence + 0.2)
                                multiclass_confidence = max(multiclass_confidence, detected_confidence + 0.15)
                            
                            # Log specific attack details with ULTRA SHARP precision (with safety checks)
                            try:
                                if detected_attack_type == 'probe':
                                    ps_features = attack_detection.get('port_scan_features', {})
                                    print(f"  🔍 PORT SCAN: {ps_features.get('unique_ports', 0)} unique ports, "
                                          f"{ps_features.get('packets_per_second', 0):.2f} pps, "
                                          f"score: {ps_features.get('port_scan_score', 0):.2f}, "
                                          f"sequential: {ps_features.get('sequential_score', 0):.2f}")
                                elif detected_attack_type == 'dos':
                                    dos_features = attack_detection.get('dos_features', {})
                                    print(f"  💥 DoS ATTACK: {dos_features.get('packets_per_second', 0):.2f} pps, "
                                          f"{dos_features.get('packet_count', 0)} packets, "
                                          f"score: {dos_features.get('dos_score', 0):.2f}, "
                                          f"SYN packets: {dos_features.get('syn_packets', 0)}")
                                elif detected_attack_type == 'r2l':
                                    r2l_features = attack_detection.get('r2l_features', {})
                                    print(f"  🚪 R2L ATTACK: {r2l_features.get('failed_logins', 0)} failed logins, "
                                          f"{r2l_features.get('privilege_attempts', 0)} privilege attempts, "
                                          f"score: {r2l_features.get('r2l_score', 0):.2f}")
                                elif detected_attack_type == 'u2r':
                                    u2r_features = attack_detection.get('u2r_features', {})
                                    print(f"  ⚠️ U2R ATTACK: {u2r_features.get('root_commands', 0)} root commands, "
                                          f"{u2r_features.get('setuid_attempts', 0)} setuid attempts, "
                                          f"score: {u2r_features.get('u2r_score', 0):.2f}")
                                elif detected_attack_type == 'brute_force':
                                    bf_features = attack_detection.get('brute_force_features', {})
                                    print(f"  🔨 BRUTE FORCE: {bf_features.get('failed_attempts', 0)} failed logins, "
                                          f"{bf_features.get('login_attempts', 0)} total attempts, "
                                          f"score: {bf_features.get('brute_force_score', 0):.2f}")
                                elif detected_attack_type == 'unknown_attack':
                                    print(f"  ⚠️ UNKNOWN ATTACK TYPE - but definitely malicious!")
                                    # Boost confidence for unknown attacks - detector found something
                                    binary_confidence = max(0.80, binary_confidence)  # Minimum 80%
                                    multiclass_confidence = max(0.75, multiclass_confidence)  # Minimum 75%
                            except Exception as e:
                                print(f"⚠️ Error logging attack details: {e}")
                        
                        # ULTRA SHARP RULE 2: Even if ML says benign but detector says attack, TRUST DETECTOR
                        # This handles cases where ML model hasn't learned the pattern yet
                        elif binary_label == 'benign' and is_detector_malicious:
                            print(f"⚠️ ULTRA SHARP OVERRIDE: ML said benign but detector found attack - "
                                  f"TRUSTING DETECTOR! (detector confidence: {detected_confidence:.2f})")
                            binary_label = 'malicious'
                            attack_type = detected_attack_type
                            # Aggressively boost confidence - detector is more reliable
                            binary_confidence = max(0.80, detected_confidence + 0.15)  # Minimum 80%
                            multiclass_confidence = max(0.75, detected_confidence + 0.10)  # Minimum 75%
                        
                        # ULTRA SHARP RULE 3: If detector has moderate confidence (>0.3) but ML says benign,
                        # still boost ML confidence significantly
                        elif binary_label == 'benign' and detected_confidence > 0.3:
                            print(f"🔍 ULTRA SHARP: Detector has moderate confidence ({detected_confidence:.2f}) "
                                  f"but ML says benign - boosting ML confidence")
                            # Boost ML confidence but don't override label (let ML decide with better features)
                            binary_confidence = max(binary_confidence, detected_confidence * 0.8)
                            multiclass_confidence = max(multiclass_confidence, detected_confidence * 0.75)

                # Get probabilities for all attack types (6 types: normal, dos, probe, r2l, u2r, brute_force)
                attack_type_probs = {}
                if USE_ML_MODELS and multiclass_model is not None:
                    try:
                        multiclass_probs = multiclass_model.predict_proba(features)[0]
                        attack_type_names = ['normal', 'dos', 'probe', 'r2l', 'u2r', 'brute_force']
                        for i, prob in enumerate(multiclass_probs):
                            if i < len(attack_type_names):
                                attack_type_probs[attack_type_names[i]] = float(prob)
                        # If model only has 5 classes, add brute_force with 0
                        if len(multiclass_probs) < 6:
                            attack_type_probs['brute_force'] = 0.0
                    except:
                        # Fallback: set probability for predicted type only
                        attack_type_probs = {attack_type: multiclass_confidence}
                        for at in ['normal', 'dos', 'probe', 'r2l', 'u2r', 'brute_force']:
                            if at not in attack_type_probs:
                                attack_type_probs[at] = 0.0
                else:
                    # Rule-based only: set probabilities based on detector results
                    if attack_detection and isinstance(attack_detection, dict):
                        detected_type = attack_detection.get('attack_type', 'normal')
                        detected_confidence = float(attack_detection.get('confidence', 0) or 0)
                        all_scores = attack_detection.get('all_scores', {})
                        
                        # Use detector scores to set probabilities
                        total_score = sum([max(0, float(s)) for s in all_scores.values()])
                        if total_score > 0:
                            # Normalize scores to probabilities
                            for at in ['normal', 'dos', 'probe', 'r2l', 'u2r', 'brute_force']:
                                score = float(all_scores.get(at, 0) or 0)
                                attack_type_probs[at] = max(0.0, min(1.0, score / total_score if total_score > 0 else 0))
                        else:
                            # Default probabilities
                            attack_type_probs[detected_type] = max(0.5, detected_confidence)
                            for at in ['normal', 'dos', 'probe', 'r2l', 'u2r', 'brute_force']:
                                if at not in attack_type_probs:
                                    attack_type_probs[at] = 0.0
                        
                        # Ensure detected type has high probability
                        if detected_type in attack_type_probs:
                            attack_type_probs[detected_type] = max(attack_type_probs[detected_type], detected_confidence)
                    else:
                        # Fallback: set probability for predicted type only
                        attack_type_probs = {attack_type: multiclass_confidence}
                        for at in ['normal', 'dos', 'probe', 'r2l', 'u2r', 'brute_force']:
                            if at not in attack_type_probs:
                                attack_type_probs[at] = 0.0
                
                # ULTRA SHARP: Aggressively boost probabilities when detector finds attacks
                if attack_detection and attack_detection['is_malicious']:
                    detected_type = attack_detection['attack_type']
                    detected_confidence = attack_detection['confidence']
                    
                    # ULTRA SHARP: If detector found specific attack type, make it DOMINANT
                    if detected_type in attack_type_probs:
                        # Aggressively boost the detected attack type
                        # Minimum probability = detector confidence, but can go higher
                        attack_type_probs[detected_type] = max(
                            attack_type_probs[detected_type],
                            detected_confidence,  # At least detector confidence
                            min(0.95, detected_confidence + 0.2)  # Boost by 20% but cap at 95%
                        )
                        
                        # ULTRA SHARP: Reduce normal traffic probability when attack detected
                        if 'normal' in attack_type_probs:
                            # If detector is confident, drastically reduce normal probability
                            if detected_confidence >= 0.7:
                                attack_type_probs['normal'] = max(0.0, attack_type_probs['normal'] * 0.1)  # Reduce by 90%
                            elif detected_confidence >= 0.5:
                                attack_type_probs['normal'] = max(0.0, attack_type_probs['normal'] * 0.3)  # Reduce by 70%
                            else:
                                attack_type_probs['normal'] = max(0.0, attack_type_probs['normal'] * 0.5)  # Reduce by 50%
                        
                        # ULTRA SHARP: Slightly reduce other attack type probabilities
                        # (to make detected type more prominent)
                        for at in ['dos', 'probe', 'r2l', 'u2r', 'brute_force']:
                            if at != detected_type and at in attack_type_probs:
                                attack_type_probs[at] = attack_type_probs[at] * 0.7  # Reduce by 30%
                        
                        # Normalize probabilities to sum to 1.0 (with safety check)
                        total_prob = sum(attack_type_probs.values())
                        if total_prob > 0 and not np.isnan(total_prob) and not np.isinf(total_prob):
                            for at in attack_type_probs:
                                normalized = attack_type_probs[at] / total_prob
                                # Ensure no NaN or inf
                                if np.isnan(normalized) or np.isinf(normalized):
                                    attack_type_probs[at] = 0.0
                                else:
                                    attack_type_probs[at] = float(normalized)
                        else:
                            # If normalization fails, set equal probabilities
                            for at in attack_type_probs:
                                attack_type_probs[at] = 1.0 / len(attack_type_probs)
                    
                    elif detected_type == 'unknown_attack':
                        # ULTRA SHARP: For unknown attacks, boost ALL attack types (not normal)
                        attack_prob = detected_confidence / 5  # Divide among 5 known types
                        for at in ['dos', 'probe', 'r2l', 'u2r', 'brute_force']:
                            attack_type_probs[at] = max(
                                attack_type_probs.get(at, 0),
                                attack_prob,
                                min(0.4, attack_prob + 0.1)  # Boost but cap at 40% per type
                            )
                        
                        # ULTRA SHARP: Reduce normal probability for unknown attacks
                        if 'normal' in attack_type_probs:
                            attack_type_probs['normal'] = max(0.0, attack_type_probs['normal'] * 0.2)  # Reduce by 80%
                        
                        # Normalize (with safety check)
                        total_prob = sum(attack_type_probs.values())
                        if total_prob > 0 and not np.isnan(total_prob) and not np.isinf(total_prob):
                            for at in attack_type_probs:
                                normalized = attack_type_probs[at] / total_prob
                                # Ensure no NaN or inf
                                if np.isnan(normalized) or np.isinf(normalized):
                                    attack_type_probs[at] = 0.0
                                else:
                                    attack_type_probs[at] = float(normalized)
                        else:
                            # If normalization fails, set equal probabilities
                            for at in attack_type_probs:
                                attack_type_probs[at] = 1.0 / len(attack_type_probs)

                results.append({
                    'packet_id': packet.get('_id', ''),
                    'binary_prediction': binary_label,
                    'attack_type': attack_type,  # This will be the correct attack type from detector
                    'confidence': {
                        'binary': float(binary_confidence),
                        'multiclass': float(multiclass_confidence)
                    },
                    'attack_type_probabilities': attack_type_probs
                })
            except Exception as e:
                print(f"❌ Error processing packet: {e}")
                import traceback
                traceback.print_exc()
                # Add error result instead of crashing
                results.append({
                    'packet_id': packet.get('_id', '') if isinstance(packet, dict) else '',
                    'binary_prediction': 'benign',
                    'attack_type': 'normal',
                    'confidence': {'binary': 0.5, 'multiclass': 0.5},
                    'attack_type_probabilities': {
                        'normal': 1.0, 'dos': 0.0, 'probe': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0
                    },
                    'error': f'Error processing packet: {str(e)}'
                })

        # Return single result if single packet was sent
        if len(results) == 1:
            return jsonify(results[0])
        return jsonify(results)
    except Exception as e:
        import traceback
        print(f"❌ CRITICAL SERVER ERROR: {e}")
        traceback.print_exc()
        # Return error response instead of crashing
        return jsonify({
            'error': f'Server error: {str(e)}',
            'binary_prediction': 'benign',
            'attack_type': 'normal',
            'confidence': {'binary': 0.5, 'multiclass': 0.5},
            'attack_type_probabilities': {
                'normal': 1.0, 'dos': 0.0, 'probe': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0
            }
        }), 500

@app.errorhandler(Exception)
def handle_exception(e):
    """Global error handler to prevent crashes"""
    import traceback
    print(f"❌ UNHANDLED EXCEPTION: {e}")
    traceback.print_exc()
    return jsonify({
        'error': f'Internal server error: {str(e)}',
        'binary_prediction': 'benign',
        'attack_type': 'normal',
        'confidence': {'binary': 0.5, 'multiclass': 0.5},
        'attack_type_probabilities': {
            'normal': 1.0, 'dos': 0.0, 'probe': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0
        }
    }), 500

if __name__ == '__main__':
    try:
        app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)  # Disable debug in production
    except KeyboardInterrupt:
        print("\nShutting down gracefully...")
    except Exception as e:
        print(f"Error running server: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("Server stopped.") 