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

def generate_normal_traffic_features(n_samples=200000):
    """Generate features for normal network traffic - MORE DIVERSE SAMPLES"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    for _ in range(n_samples):
        # More diverse normal traffic patterns
        port = random.choice([80, 443, 22, 53, 3306, 5432, 8080, 8443, 25, 110, 143])
        duration = random.uniform(0.1, 300)
        fwd_packets = random.randint(1, 100)
        bwd_packets = random.randint(1, 100)
        
        features = {
            'Destination Port': port,
            'Flow Duration': duration,
            'Total Fwd Packets': fwd_packets,
            'Total Backward Packets': bwd_packets,
            'Total Length of Fwd Packets': random.randint(50, 50000),
            'Total Length of Bwd Packets': random.randint(50, 50000),
            'Flow Packets/s': (fwd_packets + bwd_packets) / max(duration, 0.1),
            'Fwd Packets/s': fwd_packets / max(duration, 0.1),
            'Bwd Packets/s': bwd_packets / max(duration, 0.1),
            'Fwd Packet Length Max': random.randint(100, 1500),
            'Fwd Packet Length Min': random.randint(40, 200),
            'Fwd Packet Length Mean': random.randint(100, 1200),
            'Fwd Packet Length Std': random.randint(10, 300),
            'Bwd Packet Length Max': random.randint(100, 1500),
            'Bwd Packet Length Min': random.randint(40, 200),
            'Bwd Packet Length Mean': random.randint(100, 1200),
            'Bwd Packet Length Std': random.randint(10, 300),
            'Packet Length Mean': random.randint(100, 1500),
            'Packet Length Std': random.randint(10, 300),
            'Packet Length Variance': random.randint(100, 90000),
            'Min Packet Length': random.randint(40, 200),
            'Max Packet Length': random.randint(500, 1500),
            'Average Packet Size': random.randint(100, 1500),
            'SYN Flag Count': random.randint(0, 10),
            'ACK Flag Count': random.randint(1, 20),
            'PSH Flag Count': random.randint(0, 10),
            'FIN Flag Count': random.randint(0, 5),
            'RST Flag Count': random.randint(0, 2),
            'Fwd PSH Flags': random.randint(0, 5),
            'Bwd PSH Flags': random.randint(0, 5),
            'Down/Up Ratio': random.uniform(0.1, 10),
            'Avg Fwd Segment Size': random.randint(100, 1200),
            'Avg Bwd Segment Size': random.randint(100, 1200),
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

def generate_dos_attack_features(n_samples=100000):
    """Generate features for DoS attacks - MORE DIVERSE PATTERNS"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    attack_types = ['syn_flood', 'udp_flood', 'icmp_flood', 'http_flood', 'slowloris']
    
    for _ in range(n_samples):
        attack_type = random.choice(attack_types)
        
        if attack_type == 'syn_flood':
            # SYN flood: Many SYN packets, no ACK responses
            packets_per_sec = random.uniform(100, 5000)
            packet_count = random.randint(500, 50000)
            features = {
                'Destination Port': random.choice([80, 443, 22, 53]),
                'Flow Duration': random.uniform(1, 30),
                'Total Fwd Packets': packet_count,
                'Total Backward Packets': random.randint(0, 50),  # Few responses
                'Total Length of Fwd Packets': random.randint(40, 100),  # Small SYN packets
                'Total Length of Bwd Packets': random.randint(0, 200),
                'Flow Packets/s': packets_per_sec,
                'Fwd Packets/s': packets_per_sec,
                'Bwd Packets/s': random.uniform(0, 10),
                'Packet Length Mean': random.randint(40, 80),
                'Packet Length Std': random.randint(5, 30),
                'SYN Flag Count': random.randint(100, 10000),  # High SYN count
                'ACK Flag Count': random.randint(0, 20),
                'RST Flag Count': random.randint(0, 100),
                'Min Packet Length': random.randint(40, 60),
                'Max Packet Length': random.randint(60, 100),
            }
        elif attack_type == 'udp_flood':
            # UDP flood: High packet rate, small packets
            packets_per_sec = random.uniform(200, 3000)
            packet_count = random.randint(1000, 20000)
            features = {
                'Destination Port': random.choice([53, 123, 161]),
                'Flow Duration': random.uniform(1, 20),
                'Total Fwd Packets': packet_count,
                'Total Backward Packets': random.randint(0, 100),
                'Total Length of Fwd Packets': random.randint(30, 150),
                'Flow Packets/s': packets_per_sec,
                'Fwd Packets/s': packets_per_sec,
                'Packet Length Mean': random.randint(30, 100),
                'SYN Flag Count': 0,  # UDP has no SYN
                'PSH Flag Count': random.randint(0, 10),
            }
        else:
            # Generic DoS: High packet rate
            packets_per_sec = random.uniform(50, 2000)
            packet_count = random.randint(200, 20000)
            features = {
                'Destination Port': random.choice([80, 443, 22]),
                'Flow Duration': random.uniform(1, 15),
                'Total Fwd Packets': packet_count,
                'Total Backward Packets': random.randint(0, 20),
                'Total Length of Fwd Packets': random.randint(50, 300),
                'Flow Packets/s': packets_per_sec,
                'Fwd Packets/s': packets_per_sec,
                'Packet Length Mean': random.randint(50, 200),
                'SYN Flag Count': random.randint(10, 1000),
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

def generate_probe_attack_features(n_samples=100000):
    """Generate features for port scan/probe attacks - MORE DIVERSE PATTERNS"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    scan_types = ['stealth_scan', 'full_scan', 'syn_scan', 'udp_scan', 'xmas_scan']
    
    for _ in range(n_samples):
        scan_type = random.choice(scan_types)
        
        if scan_type == 'stealth_scan':
            # Stealth scan: Slow, many ports
            unique_ports = random.randint(50, 2000)
            packets_per_sec = random.uniform(1, 20)
            features = {
                'Destination Port': 0,  # Many ports
                'Flow Duration': random.uniform(10, 600),
                'Total Fwd Packets': unique_ports * 15,
                'Total Backward Packets': random.randint(0, unique_ports),
                'Flow Packets/s': packets_per_sec * 3,
                'Fwd Packets/s': packets_per_sec * 8,
                'Packet Length Mean': random.randint(60, 150),
                'SYN Flag Count': random.randint(20, 500),
                'RST Flag Count': random.randint(0, 100),
            }
        elif scan_type == 'full_scan':
            # Full scan: Fast, many ports
            unique_ports = random.randint(100, 5000)
            packets_per_sec = random.uniform(20, 200)
            features = {
                'Destination Port': 0,
                'Flow Duration': random.uniform(5, 120),
                'Total Fwd Packets': unique_ports * 20,
                'Flow Packets/s': packets_per_sec * 5,
                'Fwd Packets/s': packets_per_sec * 10,
                'SYN Flag Count': random.randint(50, 2000),
            }
        else:
            # Generic port scan
            unique_ports = random.randint(20, 2000)
            packets_per_sec = random.uniform(5, 150)
            features = {
                'Destination Port': 0,
                'Flow Duration': random.uniform(1, 300),
                'Total Fwd Packets': unique_ports * 12,
                'Total Backward Packets': random.randint(0, unique_ports // 2),
                'Flow Packets/s': packets_per_sec * 4,
                'Fwd Packets/s': packets_per_sec * 7,
                'Packet Length Mean': random.randint(60, 200),
                'SYN Flag Count': random.randint(15, 1000),
                'ACK Flag Count': random.randint(0, 100),
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

def generate_brute_force_features(n_samples=50000):
    """Generate features for brute force attacks - MORE DIVERSE PATTERNS"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    attack_types = ['ssh_brute', 'ftp_brute', 'mysql_brute', 'rdp_brute', 'http_brute']
    
    for _ in range(n_samples):
        attack_type = random.choice(attack_types)
        failed_attempts = random.randint(5, 500)
        
        if attack_type == 'ssh_brute':
            # SSH brute force: Many failed login attempts
            features = {
                'Destination Port': 22,
                'Flow Duration': random.uniform(10, 600),
                'Total Fwd Packets': failed_attempts * 10,
                'Total Backward Packets': random.randint(0, failed_attempts),
                'Total Length of Fwd Packets': random.randint(200, 2000) * failed_attempts,
                'Total Length of Bwd Packets': random.randint(0, 500),
                'Flow Packets/s': failed_attempts * 2,
                'Fwd Packets/s': failed_attempts * 1.5,
                'Bwd Packets/s': random.uniform(0, 10),
                'Packet Length Mean': random.randint(100, 600),
                'Packet Length Std': random.randint(20, 300),
                'SYN Flag Count': random.randint(1, 50),
                'ACK Flag Count': random.randint(1, 100),
                'PSH Flag Count': random.randint(0, 30),
                'RST Flag Count': random.randint(0, 20),
            }
        elif attack_type == 'ftp_brute':
            # FTP brute force
            features = {
                'Destination Port': 21,
                'Flow Duration': random.uniform(15, 500),
                'Total Fwd Packets': failed_attempts * 8,
                'Total Backward Packets': random.randint(0, failed_attempts // 2),
                'Flow Packets/s': failed_attempts * 1.8,
                'Fwd Packets/s': failed_attempts * 1.2,
                'Packet Length Mean': random.randint(80, 400),
                'SYN Flag Count': random.randint(1, 30),
                'ACK Flag Count': random.randint(1, 80),
            }
        elif attack_type == 'mysql_brute':
            # MySQL brute force
            features = {
                'Destination Port': 3306,
                'Flow Duration': random.uniform(20, 800),
                'Total Fwd Packets': failed_attempts * 12,
                'Total Backward Packets': random.randint(0, failed_attempts),
                'Flow Packets/s': failed_attempts * 1.5,
                'Packet Length Mean': random.randint(100, 500),
                'SYN Flag Count': random.randint(1, 40),
                'ACK Flag Count': random.randint(1, 90),
            }
        else:
            # Generic brute force
            features = {
                'Destination Port': random.choice([22, 23, 3306, 5432, 3389, 80, 443]),
                'Flow Duration': random.uniform(10, 400),
                'Total Fwd Packets': failed_attempts * 9,
                'Total Backward Packets': random.randint(0, failed_attempts // 3),
                'Flow Packets/s': failed_attempts * 1.7,
                'Fwd Packets/s': failed_attempts * 1.3,
                'Packet Length Mean': random.randint(100, 500),
                'SYN Flag Count': random.randint(1, 35),
                'ACK Flag Count': random.randint(1, 70),
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

def generate_r2l_features(n_samples=50000):
    """Generate features for R2L (Remote to Local) attacks - MORE DIVERSE PATTERNS"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    attack_types = ['buffer_overflow', 'sql_injection', 'xss', 'path_traversal', 'command_injection']
    
    for _ in range(n_samples):
        attack_type = random.choice(attack_types)
        exploit_attempts = random.randint(5, 200)
        
        if attack_type == 'buffer_overflow':
            # Buffer overflow: Large payloads, unusual packet sizes
            features = {
                'Destination Port': random.choice([80, 443, 22, 21]),
                'Flow Duration': random.uniform(30, 800),
                'Total Fwd Packets': exploit_attempts * 8,
                'Total Backward Packets': random.randint(0, 50),
                'Total Length of Fwd Packets': random.randint(5000, 50000),  # Large payloads
                'Total Length of Bwd Packets': random.randint(0, 2000),
                'Flow Packets/s': random.uniform(1, 15),
                'Fwd Packets/s': random.uniform(1, 12),
                'Bwd Packets/s': random.uniform(0, 8),
                'Packet Length Mean': random.randint(500, 2000),  # Large packets
                'Packet Length Std': random.randint(100, 800),
                'Max Packet Length': random.randint(1000, 5000),
                'SYN Flag Count': random.randint(1, 30),
                'ACK Flag Count': random.randint(1, 50),
                'PSH Flag Count': random.randint(0, 25),
            }
        elif attack_type == 'sql_injection':
            # SQL injection: HTTP-based, medium packets
            features = {
                'Destination Port': random.choice([80, 443, 8080, 8443]),
                'Flow Duration': random.uniform(20, 600),
                'Total Fwd Packets': exploit_attempts * 6,
                'Total Backward Packets': random.randint(0, 40),
                'Total Length of Fwd Packets': random.randint(500, 5000),
                'Total Length of Bwd Packets': random.randint(0, 1500),
                'Flow Packets/s': random.uniform(0.5, 12),
                'Fwd Packets/s': random.uniform(0.5, 10),
                'Packet Length Mean': random.randint(300, 1200),
                'Packet Length Std': random.randint(50, 400),
                'SYN Flag Count': random.randint(1, 25),
                'ACK Flag Count': random.randint(1, 45),
                'PSH Flag Count': random.randint(0, 20),
            }
        elif attack_type == 'xss':
            # XSS: Web-based, smaller payloads
            features = {
                'Destination Port': random.choice([80, 443]),
                'Flow Duration': random.uniform(15, 400),
                'Total Fwd Packets': exploit_attempts * 5,
                'Total Backward Packets': random.randint(0, 30),
                'Total Length of Fwd Packets': random.randint(400, 3000),
                'Flow Packets/s': random.uniform(0.5, 10),
                'Packet Length Mean': random.randint(200, 800),
                'SYN Flag Count': random.randint(1, 20),
                'ACK Flag Count': random.randint(1, 35),
            }
        else:
            # Generic R2L
            features = {
                'Destination Port': random.choice([22, 23, 80, 443, 21, 25]),
                'Flow Duration': random.uniform(30, 700),
                'Total Fwd Packets': exploit_attempts * 7,
                'Total Backward Packets': random.randint(0, 35),
                'Total Length of Fwd Packets': random.randint(400, 4000),
                'Total Length of Bwd Packets': random.randint(0, 1200),
                'Flow Packets/s': random.uniform(0.5, 11),
                'Fwd Packets/s': random.uniform(0.5, 9),
                'Bwd Packets/s': random.uniform(0, 6),
                'Packet Length Mean': random.randint(250, 1000),
                'Packet Length Std': random.randint(50, 350),
                'SYN Flag Count': random.randint(1, 25),
                'ACK Flag Count': random.randint(1, 40),
                'PSH Flag Count': random.randint(0, 18),
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

def generate_u2r_features(n_samples=50000):
    """Generate features for U2R (User to Root) attacks - MORE DIVERSE PATTERNS"""
    data = []
    labels_binary = []
    labels_multiclass = []
    
    attack_types = ['privilege_escalation', 'rootkit', 'trojan', 'backdoor', 'exploit']
    
    for _ in range(n_samples):
        attack_type = random.choice(attack_types)
        root_commands = random.randint(3, 200)
        
        if attack_type == 'privilege_escalation':
            # Privilege escalation: Suspicious command patterns
            features = {
                'Destination Port': random.choice([22, 23, 80, 443]),
                'Flow Duration': random.uniform(60, 1500),
                'Total Fwd Packets': root_commands * 12,
                'Total Backward Packets': random.randint(0, 80),
                'Total Length of Fwd Packets': random.randint(800, 8000),
                'Total Length of Bwd Packets': random.randint(0, 3000),
                'Flow Packets/s': random.uniform(0.2, 8),
                'Fwd Packets/s': random.uniform(0.2, 7),
                'Bwd Packets/s': random.uniform(0, 5),
                'Packet Length Mean': random.randint(400, 1500),
                'Packet Length Std': random.randint(100, 600),
                'Max Packet Length': random.randint(800, 3000),
                'SYN Flag Count': random.randint(1, 25),
                'ACK Flag Count': random.randint(1, 40),
                'PSH Flag Count': random.randint(0, 20),
            }
        elif attack_type == 'rootkit':
            # Rootkit: Stealthy, low packet rate
            features = {
                'Destination Port': random.choice([22, 23, 80]),
                'Flow Duration': random.uniform(120, 2000),
                'Total Fwd Packets': root_commands * 8,
                'Total Backward Packets': random.randint(0, 60),
                'Total Length of Fwd Packets': random.randint(600, 6000),
                'Flow Packets/s': random.uniform(0.1, 4),
                'Fwd Packets/s': random.uniform(0.1, 3.5),
                'Bwd Packets/s': random.uniform(0, 2.5),
                'Packet Length Mean': random.randint(350, 1200),
                'Packet Length Std': random.randint(80, 500),
                'SYN Flag Count': random.randint(1, 15),
                'ACK Flag Count': random.randint(1, 30),
            }
        elif attack_type == 'trojan':
            # Trojan: Medium activity, persistent connection
            features = {
                'Destination Port': random.choice([22, 443, 80, 8080]),
                'Flow Duration': random.uniform(90, 1800),
                'Total Fwd Packets': root_commands * 10,
                'Total Backward Packets': random.randint(0, 70),
                'Total Length of Fwd Packets': random.randint(700, 7000),
                'Total Length of Bwd Packets': random.randint(0, 2500),
                'Flow Packets/s': random.uniform(0.2, 6),
                'Fwd Packets/s': random.uniform(0.2, 5),
                'Packet Length Mean': random.randint(380, 1300),
                'SYN Flag Count': random.randint(1, 20),
                'ACK Flag Count': random.randint(1, 35),
            }
        else:
            # Generic U2R
            features = {
                'Destination Port': random.choice([22, 23, 80, 443, 21]),
                'Flow Duration': random.uniform(60, 1600),
                'Total Fwd Packets': root_commands * 11,
                'Total Backward Packets': random.randint(0, 65),
                'Total Length of Fwd Packets': random.randint(600, 7500),
                'Total Length of Bwd Packets': random.randint(0, 2800),
                'Flow Packets/s': random.uniform(0.2, 7),
                'Fwd Packets/s': random.uniform(0.2, 6),
                'Bwd Packets/s': random.uniform(0, 4),
                'Packet Length Mean': random.randint(350, 1400),
                'Packet Length Std': random.randint(100, 550),
                'SYN Flag Count': random.randint(1, 22),
                'ACK Flag Count': random.randint(1, 38),
                'PSH Flag Count': random.randint(0, 18),
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
    
    # Generate training data for all attack types - 500k+ samples total
    print("\n📊 Generating training data (500k+ samples)...")
    print("   This may take a few minutes...")
    normal_X, normal_y_bin, normal_y_multi = generate_normal_traffic_features(200000)
    dos_X, dos_y_bin, dos_y_multi = generate_dos_attack_features(100000)
    probe_X, probe_y_bin, probe_y_multi = generate_probe_attack_features(100000)
    brute_X, brute_y_bin, brute_y_multi = generate_brute_force_features(50000)
    r2l_X, r2l_y_bin, r2l_y_multi = generate_r2l_features(50000)
    u2r_X, u2r_y_bin, u2r_y_multi = generate_u2r_features(50000)
    
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
    
    # Train binary model - Enhanced for better normal vs attack distinction
    print("\n🎯 Training BINARY model (benign vs malicious)...")
    print("   This may take several minutes with 500k+ samples...")
    binary_model = RandomForestClassifier(
        n_estimators=300,  # More trees for better accuracy
        max_depth=30,  # Deeper trees for complex patterns
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
        class_weight='balanced'  # Handle class imbalance
    )
    binary_model.fit(X_train, y_bin_train)
    
    # Evaluate binary model
    y_bin_pred = binary_model.predict(X_test)
    print("\n📊 Binary Model Results:")
    print(f"Accuracy: {accuracy_score(y_bin_test, y_bin_pred):.4f}")
    print(classification_report(y_bin_test, y_bin_pred, target_names=['Benign', 'Malicious']))
    
    # Train multiclass model - Enhanced for better attack type classification
    print("\n🎯 Training MULTICLASS model (6 attack types)...")
    print("   This may take several minutes with 500k+ samples...")
    multiclass_model = RandomForestClassifier(
        n_estimators=300,  # More trees for better accuracy
        max_depth=30,  # Deeper trees for complex patterns
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
        class_weight='balanced'  # Handle class imbalance
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

