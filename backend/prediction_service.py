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
    if '->' in description:
        try:
            dest_port = int(description.split('->')[1].strip())
            features['Destination Port'] = dest_port
        except:
            pass
    
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
            
        if not isinstance(data, list):
            return jsonify({'error': 'Input must be a list of packets'}), 400
            
        if len(data) == 0:
            return jsonify({'error': 'Empty packet list'}), 400

        results = []
        for packet in data:
            # Validate packet structure
            if not isinstance(packet, dict):
                return jsonify({'error': 'Each packet must be a dictionary'}), 400
                
            required_fields = ['start_bytes', 'end_bytes', 'protocol', 'description']
            for field in required_fields:
                if field not in packet:
                    return jsonify({'error': f'Missing required field: {field}'}), 400

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
                
                # Map predictions to labels
                binary_label = 'malicious' if binary_pred == 1 else 'benign'
                attack_type = {
                    0: 'normal',
                    1: 'dos',
                    2: 'probe',
                    3: 'r2l',
                    4: 'u2r'
                }.get(multiclass_pred, 'unknown')
                
                results.append({
                    'packet_id': packet.get('_id', ''),
                    'binary_prediction': binary_label,
                    'attack_type': attack_type,
                    'confidence': {
                        'binary': float(binary_model.predict_proba(features)[0][1]),
                        'multiclass': float(multiclass_model.predict_proba(features)[0][multiclass_pred])
                    }
                })
            except Exception as e:
                return jsonify({'error': f'Error making predictions: {str(e)}'}), 500

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