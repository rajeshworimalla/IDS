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
    # Extract all required features from the packet
    features = [
        packet.get('start_bytes', 0),  # 1
        packet.get('end_bytes', 0),    # 2
        # Convert IP addresses to numeric features
        sum(int(x) for x in packet.get('start_ip', '0.0.0.0').split('.')),  # 3
        sum(int(x) for x in packet.get('end_ip', '0.0.0.0').split('.')),    # 4
        # Protocol encoding (TCP=1, UDP=2, ICMP=3, others=0)
        1 if packet.get('protocol', '').upper() == 'TCP' else
        2 if packet.get('protocol', '').upper() == 'UDP' else
        3 if packet.get('protocol', '').upper() == 'ICMP' else 0,  # 5
        # Frequency
        packet.get('frequency', 0),  # 6
        # Status encoding (low=1, medium=2, high=3)
        1 if packet.get('status', '').lower() == 'low' else
        2 if packet.get('status', '').lower() == 'medium' else
        3 if packet.get('status', '').lower() == 'high' else 0,  # 7
        # Add zeros for remaining features (total 77)
        *[0] * 70  # 8-77
    ]
    
    features_array = np.array(features).reshape(1, -1)
    print(f"Preprocessed features shape: {features_array.shape}")
    return features_array

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        if not data or not isinstance(data, list):
            return jsonify({'error': 'Invalid input format'}), 400

        results = []
        for packet in data:
            # Preprocess packet
            features = preprocess_packet(packet)
            print(f"Features shape: {features.shape}")
            
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
                        'multiclass': float(max(multiclass_model.predict_proba(features)[0]))
                    }
                })
            except Exception as e:
                print(f"Error making prediction: {e}")
                print(f"Error type: {type(e)}")
                print(f"Error args: {e.args}")
                raise

        return jsonify({'predictions': results})

    except Exception as e:
        print(f"Error in predict endpoint: {e}")
        print(f"Error type: {type(e)}")
        print(f"Error args: {e.args}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True) 