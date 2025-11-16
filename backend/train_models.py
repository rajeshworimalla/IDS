"""
Train new ML models for attack detection
This script creates training data from attack patterns and trains binary/multiclass models
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
import joblib
import pickle
from attack_detectors import comprehensive_detector
import random
from datetime import datetime, timedelta

# Feature names that the model expects (from preprocess_packet)
FEATURE_NAMES = [
    'Destination Port', 'Flow Duration', 'Total Fwd Packets', 'Total Backward Packets',
    'Total Length of Fwd Packets', 'Total Length of Bwd Packets', 'Fwd Packet Length Max',
    'Fwd Packet Length Min', 'Fwd Packet Length Mean', 'Fwd Packet Length Std',
    'Bwd Packet Length Max', 'Bwd Packet Length Min', 'Bwd Packet Length Mean',
    'Bwd Packet Length Std', 'Flow Packets/s', 'Flow IAT Mean', 'Flow IAT Std',
    'Flow IAT Max', 'Flow IAT Min', 'Fwd IAT Total', 'Fwd IAT Mean', 'Fwd IAT Std',
    'Fwd IAT Max', 'Fwd IAT Min', 'Bwd IAT Total', 'Bwd IAT Mean', 'Bwd IAT Std',
    'Bwd IAT Max', 'Bwd IAT Min', 'Fwd PSH Flags', 'Bwd PSH Flags', 'Fwd URG Flags',
    'Bwd URG Flags', 'Fwd Header Length', 'Bwd Header Length', 'Fwd Packets/s',
    'Bwd Packets/s', 'Min Packet Length', 'Max Packet Length', 'Packet Length Mean',
    'Packet Length Std', 'Packet Length Variance', 'FIN Flag Count', 'SYN Flag Count',
    'RST Flag Count', 'PSH Flag Count', 'ACK Flag Count', 'URG Flag Count',
    'CWE Flag Count', 'ECE Flag Count', 'Down/Up Ratio', 'Average Packet Size',
    'Avg Fwd Segment Size', 'Avg Bwd Segment Size', 'Fwd Header Length.1',
    'Fwd Avg Bytes/Bulk', 'Fwd Avg Packets/Bulk', 'Fwd Avg Bulk Rate',
    'Bwd Avg Bytes/Bulk', 'Bwd Avg Packets/Bulk', 'Bwd Avg Bulk Rate',
    'Subflow Fwd Packets', 'Subflow Fwd Bytes', 'Subflow Bwd Packets',
    'Subflow Bwd Bytes', 'Init_Win_bytes_forward', 'Init_Win_bytes_backward',
    'act_data_pkt_fwd', 'min_seg_size_forward', 'Active Mean', 'Active Std',
    'Active Max', 'Active Min', 'Idle Mean', 'Idle Std', 'Idle Max', 'Idle Min'
]

def generate_normal_traffic_features(n_samples=1000):
    """Generate features for normal network traffic"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    for _ in range(n_samples):
        features = {
            'Destination Port': random.choice([80, 443, 22, 53, 3306, 5432]),
            'Flow Duration': random.uniform(1, 60),
            'Total Fwd Packets': random.randint(1, 50),
            'Total Backward Packets': random.randint(1, 50),
            'Total Length of Fwd Packets': random.randint(100, 10000),
            'Total Length of Bwd Packets': random.randint(100, 10000),
            'Flow Packets/s': random.uniform(0.1, 10),
            'Fwd Packets/s': random.uniform(0.1, 10),
            'Bwd Packets/s': random.uniform(0.1, 10),
            'Packet Length Mean': random.randint(100, 1500),
            'Packet Length Std': random.randint(10, 200),
            'SYN Flag Count': random.randint(0, 5),
            'ACK Flag Count': random.randint(1, 10),
            'PSH Flag Count': random.randint(0, 5),
        }
        
        # Fill remaining features with defaults
        for feat in FEATURE_NAMES:
            if feat not in features:
                features[feat] = 0
        
        # Ensure all features are present
        feature_vector = [features.get(name, 0) for name in FEATURE_NAMES]
        data.append(feature_vector)
        labels_binary.append(0)  # benign
        labels_multiclass.append(0)  # normal
    
    return np.array(data), np.array(labels_binary), np.array(labels_multiclass)

def generate_dos_attack_features(n_samples=500):
    """Generate features for DoS attacks"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    for _ in range(n_samples):
        # DoS attacks have high packet rates
        packets_per_sec = random.uniform(50, 1000)
        packet_count = random.randint(100, 10000)
        
        features = {
            'Destination Port': random.choice([80, 443, 22]),
            'Flow Duration': random.uniform(1, 10),
            'Total Fwd Packets': packet_count,
            'Total Backward Packets': random.randint(0, 10),
            'Total Length of Fwd Packets': random.randint(50, 200),  # Small packets
            'Total Length of Bwd Packets': random.randint(0, 100),
            'Flow Packets/s': packets_per_sec,
            'Fwd Packets/s': packets_per_sec,
            'Bwd Packets/s': random.uniform(0, 5),
            'Packet Length Mean': random.randint(40, 100),  # Small packets
            'Packet Length Std': random.randint(5, 50),
            'SYN Flag Count': random.randint(50, 500),  # SYN flood
            'ACK Flag Count': random.randint(0, 10),
            'PSH Flag Count': random.randint(0, 5),
            'Min Packet Length': random.randint(40, 80),
            'Max Packet Length': random.randint(80, 150),
        }
        
        # Fill remaining features
        for feat in FEATURE_NAMES:
            if feat not in features:
                features[feat] = 0
        
        feature_vector = [features.get(name, 0) for name in FEATURE_NAMES]
        data.append(feature_vector)
        labels_binary.append(1)  # malicious
        labels_multiclass.append(1)  # dos
    
    return np.array(data), np.array(labels_binary), np.array(labels_multiclass)

def generate_probe_attack_features(n_samples=500):
    """Generate features for port scan/probe attacks"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    for _ in range(n_samples):
        # Port scans have many unique ports
        unique_ports = random.randint(10, 1000)
        packets_per_sec = random.uniform(5, 100)
        
        features = {
            'Destination Port': 0,  # Many ports scanned
            'Flow Duration': random.uniform(1, 60),
            'Total Fwd Packets': unique_ports * 10,  # Amplified signal
            'Total Backward Packets': random.randint(0, 50),
            'Total Length of Fwd Packets': random.randint(100, 500),
            'Total Length of Bwd Packets': random.randint(0, 200),
            'Flow Packets/s': packets_per_sec * 2,  # Amplified
            'Fwd Packets/s': packets_per_sec * 5,
            'Bwd Packets/s': random.uniform(0, 5),
            'Packet Length Mean': random.randint(60, 200),
            'Packet Length Std': random.randint(10, 100),
            'SYN Flag Count': random.randint(10, 100),
            'ACK Flag Count': random.randint(0, 20),
            'PSH Flag Count': random.randint(0, 10),
        }
        
        # Fill remaining features
        for feat in FEATURE_NAMES:
            if feat not in features:
                features[feat] = 0
        
        feature_vector = [features.get(name, 0) for name in FEATURE_NAMES]
        data.append(feature_vector)
        labels_binary.append(1)  # malicious
        labels_multiclass.append(2)  # probe
    
    return np.array(data), np.array(labels_binary), np.array(labels_multiclass)

def generate_brute_force_features(n_samples=300):
    """Generate features for brute force attacks"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    for _ in range(n_samples):
        failed_attempts = random.randint(5, 100)
        
        features = {
            'Destination Port': random.choice([22, 23, 3306, 5432, 3389]),  # Login ports
            'Flow Duration': random.uniform(10, 300),
            'Total Fwd Packets': failed_attempts * 8,  # Amplified
            'Total Backward Packets': random.randint(0, 20),
            'Total Length of Fwd Packets': random.randint(200, 2000),
            'Total Length of Bwd Packets': random.randint(0, 500),
            'Flow Packets/s': failed_attempts * 2,
            'Fwd Packets/s': random.uniform(1, 20),
            'Bwd Packets/s': random.uniform(0, 5),
            'Packet Length Mean': random.randint(100, 500),
            'Packet Length Std': random.randint(20, 200),
            'SYN Flag Count': random.randint(1, 10),
            'ACK Flag Count': random.randint(1, 20),
            'PSH Flag Count': random.randint(0, 10),
        }
        
        # Fill remaining features
        for feat in FEATURE_NAMES:
            if feat not in features:
                features[feat] = 0
        
        feature_vector = [features.get(name, 0) for name in FEATURE_NAMES]
        data.append(feature_vector)
        labels_binary.append(1)  # malicious
        labels_multiclass.append(5)  # brute_force
    
    return np.array(data), np.array(labels_binary), np.array(labels_multiclass)

def generate_r2l_features(n_samples=200):
    """Generate features for R2L attacks"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    for _ in range(n_samples):
        failed_logins = random.randint(5, 50)
        
        features = {
            'Destination Port': random.choice([22, 23, 80, 443]),
            'Flow Duration': random.uniform(30, 600),
            'Total Fwd Packets': failed_logins * 5,
            'Total Backward Packets': random.randint(0, 30),
            'Total Length of Fwd Packets': random.randint(300, 3000),
            'Total Length of Bwd Packets': random.randint(0, 1000),
            'Flow Packets/s': random.uniform(0.5, 10),
            'Fwd Packets/s': random.uniform(0.5, 10),
            'Bwd Packets/s': random.uniform(0, 5),
            'Packet Length Mean': random.randint(200, 800),
            'Packet Length Std': random.randint(50, 300),
            'SYN Flag Count': random.randint(1, 20),
            'ACK Flag Count': random.randint(1, 30),
            'PSH Flag Count': random.randint(0, 15),
        }
        
        # Fill remaining features
        for feat in FEATURE_NAMES:
            if feat not in features:
                features[feat] = 0
        
        feature_vector = [features.get(name, 0) for name in FEATURE_NAMES]
        data.append(feature_vector)
        labels_binary.append(1)  # malicious
        labels_multiclass.append(3)  # r2l
    
    return np.array(data), np.array(labels_binary), np.array(labels_multiclass)

def generate_u2r_features(n_samples=200):
    """Generate features for U2R attacks"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    for _ in range(n_samples):
        root_commands = random.randint(3, 30)
        
        features = {
            'Destination Port': random.choice([22, 23]),
            'Flow Duration': random.uniform(60, 1200),
            'Total Fwd Packets': root_commands * 10,
            'Total Backward Packets': random.randint(0, 50),
            'Total Length of Fwd Packets': random.randint(500, 5000),
            'Total Length of Bwd Packets': random.randint(0, 2000),
            'Flow Packets/s': random.uniform(0.2, 5),
            'Fwd Packets/s': random.uniform(0.2, 5),
            'Bwd Packets/s': random.uniform(0, 3),
            'Packet Length Mean': random.randint(300, 1000),
            'Packet Length Std': random.randint(100, 500),
            'SYN Flag Count': random.randint(1, 10),
            'ACK Flag Count': random.randint(1, 20),
            'PSH Flag Count': random.randint(0, 10),
        }
        
        # Fill remaining features
        for feat in FEATURE_NAMES:
            if feat not in features:
                features[feat] = 0
        
        feature_vector = [features.get(name, 0) for name in FEATURE_NAMES]
        data.append(feature_vector)
        labels_binary.append(1)  # malicious
        labels_multiclass.append(4)  # u2r
    
    return np.array(data), np.array(labels_binary), np.array(labels_multiclass)

def train_models():
    """Train binary and multiclass models"""
    print("🚀 Starting model training...")
    print("=" * 60)
    
    # Generate training data for all attack types
    print("\n📊 Generating training data...")
    normal_X, normal_y_bin, normal_y_multi = generate_normal_traffic_features(2000)
    dos_X, dos_y_bin, dos_y_multi = generate_dos_attack_features(1000)
    probe_X, probe_y_bin, probe_y_multi = generate_probe_attack_features(1000)
    brute_X, brute_y_bin, brute_y_multi = generate_brute_force_features(600)
    r2l_X, r2l_y_bin, r2l_y_multi = generate_r2l_features(400)
    u2r_X, u2r_y_bin, u2r_y_multi = generate_u2r_features(400)
    
    # Combine all data
    print("\n📦 Combining training data...")
    X_all = np.vstack([normal_X, dos_X, probe_X, brute_X, r2l_X, u2r_X])
    y_binary_all = np.hstack([normal_y_bin, dos_y_bin, probe_y_bin, brute_y_bin, r2l_y_bin, u2r_y_bin])
    y_multiclass_all = np.hstack([normal_y_multi, dos_y_multi, probe_y_multi, brute_y_multi, r2l_y_multi, u2r_y_multi])
    
    print(f"Total samples: {len(X_all)}")
    print(f"  - Normal: {len(normal_X)}")
    print(f"  - DoS: {len(dos_X)}")
    print(f"  - Probe: {len(probe_X)}")
    print(f"  - Brute Force: {len(brute_X)}")
    print(f"  - R2L: {len(r2l_X)}")
    print(f"  - U2R: {len(u2r_X)}")
    
    # Convert to DataFrame with proper feature names
    X_df = pd.DataFrame(X_all, columns=FEATURE_NAMES)
    
    # Split data
    print("\n✂️ Splitting data (80% train, 20% test)...")
    X_train, X_test, y_bin_train, y_bin_test = train_test_split(
        X_df, y_binary_all, test_size=0.2, random_state=42, stratify=y_binary_all
    )
    _, _, y_multi_train, y_multi_test = train_test_split(
        X_df, y_multiclass_all, test_size=0.2, random_state=42, stratify=y_multiclass_all
    )
    
    # Train binary model
    print("\n🎯 Training BINARY model (benign vs malicious)...")
    binary_model = RandomForestClassifier(
        n_estimators=200,
        max_depth=25,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
        class_weight='balanced'
    )
    binary_model.fit(X_train, y_bin_train)
    
    # Evaluate binary model
    y_bin_pred = binary_model.predict(X_test)
    print("\n📊 Binary Model Results:")
    print(f"Accuracy: {accuracy_score(y_bin_test, y_bin_pred):.4f}")
    print(classification_report(y_bin_test, y_bin_pred, target_names=['Benign', 'Malicious']))
    
    # Train multiclass model
    print("\n🎯 Training MULTICLASS model (6 attack types)...")
    multiclass_model = RandomForestClassifier(
        n_estimators=200,
        max_depth=25,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
        class_weight='balanced'
    )
    multiclass_model.fit(X_train, y_multi_train)
    
    # Evaluate multiclass model
    y_multi_pred = multiclass_model.predict(X_test)
    print("\n📊 Multiclass Model Results:")
    print(f"Accuracy: {accuracy_score(y_multi_test, y_multi_pred):.4f}")
    print(classification_report(
        y_multi_test, y_multi_pred,
        target_names=['Normal', 'DoS', 'Probe', 'R2L', 'U2R', 'Brute Force']
    ))
    
    # Save models
    print("\n💾 Saving models...")
    joblib.dump(binary_model, 'binary_attack_model.pkl')
    joblib.dump(multiclass_model, 'multiclass_attack_model.pkl')
    
    # Also save with pickle as backup
    with open('binary_attack_model.pkl', 'wb') as f:
        pickle.dump(binary_model, f)
    with open('multiclass_attack_model.pkl', 'wb') as f:
        pickle.dump(multiclass_model, f)
    
    print("✅ Models saved successfully!")
    print("   - binary_attack_model.pkl")
    print("   - multiclass_attack_model.pkl")
    print("\n🎉 Training complete! Your models are ready to use.")
    print("\n⚠️  IMPORTANT: Restart the prediction service after replacing the model files!")

if __name__ == '__main__':
    try:
        train_models()
    except Exception as e:
        print(f"\n❌ Error during training: {e}")
        import traceback
        traceback.print_exc()

