from flask import Flask, request, jsonify
import pickle
import numpy as np
import pandas as pd
from typing import List, Dict, Any
from sklearn.base import BaseEstimator
import joblib
from attack_detectors import comprehensive_detector

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
    
    # Comprehensive attack detection features
    source_ip = packet.get('start_ip', '')
    dest_ip = packet.get('end_ip', '')
    protocol = packet.get('protocol', 'TCP')
    
    # Get comprehensive attack detection results
    attack_detection = None
    if source_ip and dest_ip:
        attack_detection = comprehensive_detector.analyze_packet(packet)
        
        # Enhance ML features based on attack detection
        if attack_detection:
            # Port scan features
            if attack_detection['port_scan_features']['is_port_scan']:
                features['Flow Packets/s'] = max(features.get('Flow Packets/s', 0),
                                                attack_detection['port_scan_features']['packets_per_second'])
                features['Total Fwd Packets'] = max(features.get('Total Fwd Packets', 0),
                                                  attack_detection['port_scan_features']['unique_ports'])
            
            # DoS features
            if attack_detection['dos_features']['is_dos']:
                features['Flow Packets/s'] = max(features.get('Flow Packets/s', 0),
                                                attack_detection['dos_features']['packets_per_second'])
                features['Total Fwd Packets'] = max(features.get('Total Fwd Packets', 0),
                                                    attack_detection['dos_features']['packet_count'])
    
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

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        print(f"Received data: {data}")

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
            
            # Get predictions
            try:
                print("Making binary prediction...")
                binary_pred = binary_model.predict(features)[0]
                print(f"Binary prediction: {binary_pred}")
                
                print("Making multiclass prediction...")
                multiclass_pred = multiclass_model.predict(features)[0]
                print(f"Multiclass prediction: {multiclass_pred}")
                
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
                
                # CRITICAL: Comprehensive attack detection override
                # ALWAYS mark as malicious if ANY detector says it's an attack
                # Even if ML model can't determine the type, we still know it's an attack
                if attack_detection:
                    if attack_detection['is_malicious']:
                        # Override ML prediction with detector results
                        detected_attack_type = attack_detection['attack_type']
                        detected_confidence = attack_detection['confidence']
                        
                        print(f"🚨 ATTACK DETECTED for {source_ip}: {detected_attack_type} "
                              f"(confidence: {detected_confidence:.2f})")
                        
                        # ALWAYS mark as malicious if detector says so
                        binary_label = 'malicious'
                        attack_type = detected_attack_type
                        
                        # Use detector confidence if higher than ML
                        if detected_confidence > binary_confidence:
                            binary_confidence = detected_confidence
                        if detected_confidence > multiclass_confidence:
                            multiclass_confidence = detected_confidence
                        
                        # Log specific attack details
                        if detected_attack_type == 'probe':
                            ps_features = attack_detection['port_scan_features']
                            print(f"  Port Scan: {ps_features['unique_ports']} ports, "
                                  f"{ps_features['packets_per_second']:.2f} pps")
                        elif detected_attack_type == 'dos':
                            dos_features = attack_detection['dos_features']
                            print(f"  DoS: {dos_features['packets_per_second']:.2f} pps, "
                                  f"{dos_features['packet_count']} packets")
                        elif detected_attack_type == 'r2l':
                            r2l_features = attack_detection['r2l_features']
                            print(f"  R2L: {r2l_features['failed_logins']} failed logins, "
                                  f"{r2l_features['privilege_attempts']} privilege attempts")
                        elif detected_attack_type == 'u2r':
                            u2r_features = attack_detection['u2r_features']
                            print(f"  U2R: {u2r_features['root_commands']} root commands, "
                                  f"{u2r_features['setuid_attempts']} setuid attempts")
                        elif detected_attack_type == 'brute_force':
                            bf_features = attack_detection['brute_force_features']
                            print(f"  Brute Force: {bf_features['failed_attempts']} failed logins, "
                                  f"{bf_features['login_attempts']} total attempts")
                        elif detected_attack_type == 'unknown_attack':
                            print(f"  Unknown Attack Type - but definitely malicious!")
                            # Boost confidence for unknown attacks
                            binary_confidence = max(binary_confidence, 0.7)
                            multiclass_confidence = max(multiclass_confidence, 0.65)
                    
                    # Even if ML says benign but detector says attack, trust the detector
                    elif binary_label == 'benign' and attack_detection['is_malicious']:
                        print(f"⚠️ ML said benign but detector found attack - trusting detector!")
                        binary_label = 'malicious'
                        attack_type = attack_detection['attack_type']
                        binary_confidence = max(binary_confidence, attack_detection['confidence'])
                        multiclass_confidence = max(multiclass_confidence, attack_detection['confidence'])
                
                # Get confidence scores safely
                try:
                    binary_confidence = float(binary_model.predict_proba(features)[0][1])
                except:
                    binary_confidence = 0.5

                try:
                    multiclass_confidence = float(multiclass_model.predict_proba(features)[0][multiclass_pred])
                except:
                    multiclass_confidence = 0.5

                # Get probabilities for all attack types (6 types: normal, dos, probe, r2l, u2r, brute_force)
                attack_type_probs = {}
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
                
                # If detector found an attack, boost its probability
                if attack_detection and attack_detection['is_malicious']:
                    detected_type = attack_detection['attack_type']
                    if detected_type in attack_type_probs:
                        # Boost the detected attack type probability
                        attack_type_probs[detected_type] = max(
                            attack_type_probs[detected_type],
                            attack_detection['confidence']
                        )
                    elif detected_type == 'unknown_attack':
                        # For unknown attacks, distribute probability across all attack types
                        attack_prob = attack_detection['confidence'] / 5  # Divide among 5 known types
                        for at in ['dos', 'probe', 'r2l', 'u2r', 'brute_force']:
                            attack_type_probs[at] = max(attack_type_probs.get(at, 0), attack_prob)

                results.append({
                    'packet_id': packet.get('_id', ''),
                    'binary_prediction': binary_label,
                    'attack_type': attack_type,
                    'confidence': {
                        'binary': binary_confidence,
                        'multiclass': multiclass_confidence
                    },
                    'attack_type_probabilities': attack_type_probs
                })
            except Exception as e:
                return jsonify({'error': f'Error making predictions: {str(e)}'}), 500

        # Return single result if single packet was sent
        if len(results) == 1:
            return jsonify(results[0])
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

if __name__ == '__main__':
    try:
        app.run(host='0.0.0.0', port=5002, debug=True)
    except KeyboardInterrupt:
        print("\nShutting down gracefully...")
    except Exception as e:
        print(f"Error running server: {e}")
    finally:
        print("Server stopped.") 