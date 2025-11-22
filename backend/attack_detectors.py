"""
Comprehensive Attack Detection System
Detects multiple attack types: DoS, Port Scan, R2L, U2R, etc.
"""
from collections import defaultdict
from datetime import datetime, timedelta
import threading
import math

class AttackDetectorBase:
    """Base class for attack detectors"""
    def __init__(self, time_window_seconds=60):
        self.time_window = time_window_seconds
        self.lock = threading.Lock()
    
    def _cleanup_old_data(self, tracking_dict, timestamp_key='timestamp'):
        """Remove old tracking data"""
        now = datetime.now()
        cutoff_time = now - timedelta(seconds=self.time_window)
        
        keys_to_remove = []
        for key, data in tracking_dict.items():
            if isinstance(data, dict) and timestamp_key in data:
                if data[timestamp_key] < cutoff_time:
                    keys_to_remove.append(key)
            elif isinstance(data, list):
                # Filter list items
                tracking_dict[key] = [item for item in data 
                                    if getattr(item, timestamp_key, item) > cutoff_time]
                if not tracking_dict[key]:
                    keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del tracking_dict[key]


class PortScanDetector(AttackDetectorBase):
    """Detects port scanning and reconnaissance attacks"""
    
    def __init__(self, time_window_seconds=60):
        super().__init__(time_window_seconds)
        self.port_tracking = defaultdict(lambda: {
            'ports': set(),
            'timestamps': [],
            'unique_dest_ips': set(),
            'total_packets': 0,
            'sequential_ports': []
        })
    
    def add_packet(self, source_ip: str, dest_ip: str, dest_port: int = None, 
                   protocol: str = 'TCP'):
        """Add packet to tracking"""
        try:
            # Validate inputs
            if not source_ip or not isinstance(source_ip, str):
                return
            if not dest_ip or not isinstance(dest_ip, str):
                return
            if dest_port is not None:
                try:
                    dest_port = int(dest_port)
                    if dest_port < 1 or dest_port > 65535:
                        dest_port = None
                except (ValueError, TypeError):
                    dest_port = None
            
            now = datetime.now()
            cutoff_time = now - timedelta(seconds=self.time_window)
            
            with self.lock:
                data = self.port_tracking[source_ip]
                
                # Clean old data
                try:
                    data['timestamps'] = [ts for ts in data['timestamps'] if isinstance(ts, datetime) and ts > cutoff_time]
                except Exception as e:
                    print(f"⚠️ Error cleaning timestamps: {e}")
                    data['timestamps'] = []
                
                # Add new data
                data['timestamps'].append(now)
                if dest_ip:
                    data['unique_dest_ips'].add(dest_ip)
                data['total_packets'] = max(0, data.get('total_packets', 0) + 1)
                
                if dest_port:
                    try:
                        data['ports'].add(dest_port)
                        data['sequential_ports'].append((dest_port, now))
                        # Keep only recent ports
                        data['sequential_ports'] = [(p, t) for p, t in data['sequential_ports'] 
                                                  if isinstance(t, datetime) and t > cutoff_time]
                    except Exception as e:
                        print(f"⚠️ Error adding port data: {e}")
        except Exception as e:
            print(f"⚠️ Error in PortScanDetector.add_packet: {e}")
    
    def get_features(self, source_ip: str) -> dict:
        """Get port scan detection features"""
        with self.lock:
            if source_ip not in self.port_tracking:
                return self._default_features()
            
            data = self.port_tracking[source_ip]
            now = datetime.now()
            cutoff_time = now - timedelta(seconds=self.time_window)
            
            recent_timestamps = [ts for ts in data['timestamps'] if ts > cutoff_time]
            if not recent_timestamps:
                return self._default_features()
            
            unique_ports = len(data['ports'])
            unique_dest_ips = len(data['unique_dest_ips'])
            total_packets = len(recent_timestamps)
            time_span = (recent_timestamps[-1] - recent_timestamps[0]).total_seconds() or 1
            
            packets_per_second = total_packets / time_span
            port_scan_rate = unique_ports / time_span
            
            # Check for sequential port patterns
            sequential_score = self._check_sequential_ports(data['sequential_ports'])
            
            # Port scan detection
            is_port_scan = False
            port_scan_score = 0.0
            
            # High unique ports + high rate = port scan
            if unique_ports >= 10 and packets_per_second > 5:
                port_scan_score = min(1.0, (unique_ports / 100.0) * (packets_per_second / 50.0))
                is_port_scan = port_scan_score > 0.3
            elif unique_ports >= 5 and packets_per_second > 10:
                port_scan_score = min(1.0, (unique_ports / 50.0) * (packets_per_second / 100.0))
                is_port_scan = port_scan_score > 0.2
            elif unique_ports >= 20:
                port_scan_score = min(1.0, unique_ports / 200.0)
                is_port_scan = port_scan_score > 0.4
            
            # Sequential ports boost score
            if sequential_score > 0.5:
                port_scan_score = min(1.0, port_scan_score + 0.2)
                is_port_scan = True
            
            return {
                'unique_ports': unique_ports,
                'port_scan_rate': port_scan_rate,
                'unique_dest_ips': unique_dest_ips,
                'packets_per_second': packets_per_second,
                'is_port_scan': is_port_scan,
                'port_scan_score': port_scan_score,
                'sequential_score': sequential_score
            }
    
    def _check_sequential_ports(self, port_timestamps):
        """Check if ports are being scanned sequentially"""
        if len(port_timestamps) < 5:
            return 0.0
        
        ports = sorted([p for p, t in port_timestamps])
        sequential_count = 0
        total_sequences = 0
        
        for i in range(len(ports) - 1):
            if ports[i+1] - ports[i] == 1:
                sequential_count += 1
            total_sequences += 1
        
        return sequential_count / max(total_sequences, 1) if total_sequences > 0 else 0.0
    
    def _default_features(self):
        return {
            'unique_ports': 0,
            'port_scan_rate': 0.0,
            'unique_dest_ips': 0,
            'packets_per_second': 0.0,
            'is_port_scan': False,
            'port_scan_score': 0.0,
            'sequential_score': 0.0
        }


class DoSDetector(AttackDetectorBase):
    """Detects Denial of Service (DoS) attacks"""
    
    def __init__(self, time_window_seconds=60):
        super().__init__(time_window_seconds)
        self.dos_tracking = defaultdict(lambda: {
            'packets': [],
            'bytes': [],
            'dest_ips': set(),
            'syn_packets': 0,
            'failed_connections': 0
        })
    
    def add_packet(self, source_ip: str, dest_ip: str, packet_size: int,
                   protocol: str = 'TCP', is_syn: bool = False, 
                   connection_failed: bool = False):
        """Add packet to DoS tracking"""
        try:
            # Validate inputs
            if not source_ip or not isinstance(source_ip, str):
                return
            if not dest_ip or not isinstance(dest_ip, str):
                return
            try:
                packet_size = int(packet_size)
                packet_size = max(0, min(packet_size, 65535))  # Cap at max packet size
            except (ValueError, TypeError):
                packet_size = 0
            
            now = datetime.now()
            cutoff_time = now - timedelta(seconds=self.time_window)
            
            with self.lock:
                data = self.dos_tracking[source_ip]
                
                # Clean old data
                try:
                    data['packets'] = [(ts, size) for ts, size in data['packets'] 
                                     if isinstance(ts, datetime) and ts > cutoff_time]
                    data['bytes'] = [(ts, size) for ts, size in data['bytes'] 
                                    if isinstance(ts, datetime) and ts > cutoff_time]
                except Exception as e:
                    print(f"⚠️ Error cleaning DoS data: {e}")
                    data['packets'] = []
                    data['bytes'] = []
                
                # Add new data
                data['packets'].append((now, 1))
                data['bytes'].append((now, packet_size))
                if dest_ip:
                    data['dest_ips'].add(dest_ip)
                
                if is_syn:
                    data['syn_packets'] = max(0, data.get('syn_packets', 0) + 1)
                if connection_failed:
                    data['failed_connections'] = max(0, data.get('failed_connections', 0) + 1)
        except Exception as e:
            print(f"⚠️ Error in DoSDetector.add_packet: {e}")
    
    def get_features(self, source_ip: str) -> dict:
        """Get DoS detection features"""
        with self.lock:
            if source_ip not in self.dos_tracking:
                return self._default_features()
            
            data = self.dos_tracking[source_ip]
            now = datetime.now()
            cutoff_time = now - timedelta(seconds=self.time_window)
            
            recent_packets = [(ts, size) for ts, size in data['packets'] if ts > cutoff_time]
            recent_bytes = [(ts, size) for ts, size in data['bytes'] if ts > cutoff_time]
            
            if not recent_packets:
                return self._default_features()
            
            time_span = (recent_packets[-1][0] - recent_packets[0][0]).total_seconds() or 1
            packet_count = len(recent_packets)
            total_bytes = sum(size for _, size in recent_bytes)
            
            packets_per_second = packet_count / time_span
            bytes_per_second = total_bytes / time_span
            avg_packet_size = total_bytes / packet_count if packet_count > 0 else 0
            
            # DoS detection heuristics
            is_dos = False
            dos_score = 0.0
            
            # High packet rate to single/multiple destinations = DoS
            if packets_per_second > 100:  # Very high packet rate
                dos_score = min(1.0, packets_per_second / 1000.0)
                is_dos = dos_score > 0.5
            elif packets_per_second > 50 and len(data['dest_ips']) <= 3:
                # High rate to few destinations = targeted DoS
                dos_score = min(1.0, (packets_per_second / 200.0) * (3.0 / len(data['dest_ips'])))
                is_dos = dos_score > 0.4
            elif data['syn_packets'] > 50 and packets_per_second > 20:
                # SYN flood
                dos_score = min(1.0, (data['syn_packets'] / 100.0) * (packets_per_second / 50.0))
                is_dos = dos_score > 0.5
            
            # Small packets at high rate = flood attack
            if avg_packet_size < 100 and packets_per_second > 30:
                dos_score = min(1.0, dos_score + 0.3)
                is_dos = True
            
            return {
                'packets_per_second': packets_per_second,
                'bytes_per_second': bytes_per_second,
                'packet_count': packet_count,
                'unique_dest_ips': len(data['dest_ips']),
                'syn_packets': data['syn_packets'],
                'is_dos': is_dos,
                'dos_score': dos_score,
                'avg_packet_size': avg_packet_size
            }
    
    def _default_features(self):
        return {
            'packets_per_second': 0.0,
            'bytes_per_second': 0.0,
            'packet_count': 0,
            'unique_dest_ips': 0,
            'syn_packets': 0,
            'is_dos': False,
            'dos_score': 0.0,
            'avg_packet_size': 0.0
        }


class R2LDetector(AttackDetectorBase):
    """Detects Remote to Local (R2L) attacks - unauthorized access attempts"""
    
    def __init__(self, time_window_seconds=300):  # Longer window for R2L
        super().__init__(time_window_seconds)
        self.r2l_tracking = defaultdict(lambda: {
            'failed_logins': [],
            'privilege_escalation': [],
            'suspicious_commands': [],
            'dest_ips': set(),
            'access_patterns': []
        })
    
    def add_packet(self, source_ip: str, dest_ip: str, is_failed_login: bool = False,
                   is_privilege_attempt: bool = False, suspicious_command: bool = False):
        """Add packet to R2L tracking"""
        now = datetime.now()
        cutoff_time = now - timedelta(seconds=self.time_window)
        
        with self.lock:
            data = self.r2l_tracking[source_ip]
            
            # Clean old data
            data['failed_logins'] = [ts for ts in data['failed_logins'] if ts > cutoff_time]
            data['privilege_escalation'] = [ts for ts in data['privilege_escalation'] if ts > cutoff_time]
            data['suspicious_commands'] = [ts for ts in data['suspicious_commands'] if ts > cutoff_time]
            
            # Add new data
            data['dest_ips'].add(dest_ip)
            
            if is_failed_login:
                data['failed_logins'].append(now)
            if is_privilege_attempt:
                data['privilege_escalation'].append(now)
            if suspicious_command:
                data['suspicious_commands'].append(now)
    
    def get_features(self, source_ip: str) -> dict:
        """Get R2L detection features"""
        with self.lock:
            if source_ip not in self.r2l_tracking:
                return self._default_features()
            
            data = self.r2l_tracking[source_ip]
            
            failed_logins = len(data['failed_logins'])
            privilege_attempts = len(data['privilege_escalation'])
            suspicious_commands = len(data['suspicious_commands'])
            
            # R2L detection
            is_r2l = False
            r2l_score = 0.0
            
            # Multiple failed logins = brute force
            if failed_logins >= 5:
                r2l_score = min(1.0, failed_logins / 20.0)
                is_r2l = r2l_score > 0.4
            elif privilege_attempts >= 3:
                # Privilege escalation attempts
                r2l_score = min(1.0, privilege_attempts / 10.0)
                is_r2l = True
            elif suspicious_commands >= 5:
                # Suspicious command execution
                r2l_score = min(1.0, suspicious_commands / 15.0)
                is_r2l = r2l_score > 0.3
            
            return {
                'failed_logins': failed_logins,
                'privilege_attempts': privilege_attempts,
                'suspicious_commands': suspicious_commands,
                'unique_dest_ips': len(data['dest_ips']),
                'is_r2l': is_r2l,
                'r2l_score': r2l_score
            }
    
    def _default_features(self):
        return {
            'failed_logins': 0,
            'privilege_attempts': 0,
            'suspicious_commands': 0,
            'unique_dest_ips': 0,
            'is_r2l': False,
            'r2l_score': 0.0
        }


class U2RDetector(AttackDetectorBase):
    """Detects User to Root (U2R) attacks - privilege escalation"""
    
    def __init__(self, time_window_seconds=300):
        super().__init__(time_window_seconds)
        self.u2r_tracking = defaultdict(lambda: {
            'root_commands': [],
            'setuid_attempts': [],
            'buffer_overflow_patterns': [],
            'suspicious_file_access': []
        })
    
    def add_packet(self, source_ip: str, is_root_command: bool = False,
                   is_setuid_attempt: bool = False, is_buffer_overflow: bool = False,
                   suspicious_file: bool = False):
        """Add packet to U2R tracking"""
        now = datetime.now()
        cutoff_time = now - timedelta(seconds=self.time_window)
        
        with self.lock:
            data = self.u2r_tracking[source_ip]
            
            # Clean old data
            data['root_commands'] = [ts for ts in data['root_commands'] if ts > cutoff_time]
            data['setuid_attempts'] = [ts for ts in data['setuid_attempts'] if ts > cutoff_time]
            data['buffer_overflow_patterns'] = [ts for ts in data['buffer_overflow_patterns'] 
                                                if ts > cutoff_time]
            data['suspicious_file_access'] = [ts for ts in data['suspicious_file_access'] 
                                            if ts > cutoff_time]
            
            if is_root_command:
                data['root_commands'].append(now)
            if is_setuid_attempt:
                data['setuid_attempts'].append(now)
            if is_buffer_overflow:
                data['buffer_overflow_patterns'].append(now)
            if suspicious_file:
                data['suspicious_file_access'].append(now)
    
    def get_features(self, source_ip: str) -> dict:
        """Get U2R detection features"""
        with self.lock:
            if source_ip not in self.u2r_tracking:
                return self._default_features()
            
            data = self.u2r_tracking[source_ip]
            
            root_commands = len(data['root_commands'])
            setuid_attempts = len(data['setuid_attempts'])
            buffer_overflow = len(data['buffer_overflow_patterns'])
            suspicious_files = len(data['suspicious_file_access'])
            
            # U2R detection
            is_u2r = False
            u2r_score = 0.0
            
            if root_commands >= 3:
                u2r_score = min(1.0, root_commands / 10.0)
                is_u2r = True
            elif setuid_attempts >= 2:
                u2r_score = min(1.0, setuid_attempts / 5.0)
                is_u2r = True
            elif buffer_overflow >= 1:
                u2r_score = 0.8  # Buffer overflow is serious
                is_u2r = True
            elif suspicious_files >= 5:
                u2r_score = min(1.0, suspicious_files / 15.0)
                is_u2r = u2r_score > 0.3
            
            return {
                'root_commands': root_commands,
                'setuid_attempts': setuid_attempts,
                'buffer_overflow_patterns': buffer_overflow,
                'suspicious_file_access': suspicious_files,
                'is_u2r': is_u2r,
                'u2r_score': u2r_score
            }
    
    def _default_features(self):
        return {
            'root_commands': 0,
            'setuid_attempts': 0,
            'buffer_overflow_patterns': 0,
            'suspicious_file_access': 0,
            'is_u2r': False,
            'u2r_score': 0.0
        }


class BruteForceDetector(AttackDetectorBase):
    """Detects Brute Force attacks - repeated login attempts"""
    
    def __init__(self, time_window_seconds=300):
        super().__init__(time_window_seconds)
        self.brute_force_tracking = defaultdict(lambda: {
            'login_attempts': [],
            'failed_attempts': [],
            'successful_after_failures': [],
            'target_ports': set(),
            'username_guessing': []
        })
    
    def add_packet(self, source_ip: str, dest_port: int = None, 
                   is_login_attempt: bool = False, is_failed: bool = False,
                   is_success_after_failures: bool = False):
        """Add packet to brute force tracking"""
        try:
            # Validate inputs
            if not source_ip or not isinstance(source_ip, str):
                return
            if dest_port is not None:
                try:
                    dest_port = int(dest_port)
                    if dest_port < 1 or dest_port > 65535:
                        dest_port = None
                except (ValueError, TypeError):
                    dest_port = None
            
            now = datetime.now()
            cutoff_time = now - timedelta(seconds=self.time_window)
            
            with self.lock:
                data = self.brute_force_tracking[source_ip]
                
                # Clean old data
                try:
                    data['login_attempts'] = [ts for ts in data['login_attempts'] 
                                            if isinstance(ts, datetime) and ts > cutoff_time]
                    data['failed_attempts'] = [ts for ts in data['failed_attempts'] 
                                             if isinstance(ts, datetime) and ts > cutoff_time]
                    data['successful_after_failures'] = [ts for ts in data['successful_after_failures'] 
                                                        if isinstance(ts, datetime) and ts > cutoff_time]
                except Exception as e:
                    print(f"⚠️ Error cleaning brute force data: {e}")
                    data['login_attempts'] = []
                    data['failed_attempts'] = []
                    data['successful_after_failures'] = []
                
                if dest_port:
                    try:
                        data['target_ports'].add(dest_port)
                    except Exception:
                        pass
                
                if is_login_attempt:
                    data['login_attempts'].append(now)
                    if is_failed:
                        data['failed_attempts'].append(now)
                    if is_success_after_failures:
                        data['successful_after_failures'].append(now)
        except Exception as e:
            print(f"⚠️ Error in BruteForceDetector.add_packet: {e}")
    
    def get_features(self, source_ip: str) -> dict:
        """Get brute force detection features"""
        with self.lock:
            if source_ip not in self.brute_force_tracking:
                return self._default_features()
            
            data = self.brute_force_tracking[source_ip]
            
            login_attempts = len(data['login_attempts'])
            failed_attempts = len(data['failed_attempts'])
            success_after_failures = len(data['successful_after_failures'])
            target_ports = len(data['target_ports'])
            
            # Brute force detection
            is_brute_force = False
            brute_force_score = 0.0
            
            # Multiple failed login attempts = brute force
            if failed_attempts >= 10:
                brute_force_score = min(1.0, failed_attempts / 50.0)
                is_brute_force = True
            elif failed_attempts >= 5 and login_attempts >= 8:
                # High failure rate
                failure_rate = failed_attempts / login_attempts if login_attempts > 0 else 0
                brute_force_score = min(1.0, failure_rate * (failed_attempts / 10.0))
                is_brute_force = brute_force_score > 0.4
            elif success_after_failures >= 1 and failed_attempts >= 3:
                # Successful login after multiple failures = likely compromised
                brute_force_score = 0.9
                is_brute_force = True
            elif login_attempts >= 20:
                # Many login attempts
                brute_force_score = min(1.0, login_attempts / 100.0)
                is_brute_force = brute_force_score > 0.3
            
            return {
                'login_attempts': login_attempts,
                'failed_attempts': failed_attempts,
                'success_after_failures': success_after_failures,
                'target_ports': target_ports,
                'is_brute_force': is_brute_force,
                'brute_force_score': brute_force_score
            }
    
    def _default_features(self):
        return {
            'login_attempts': 0,
            'failed_attempts': 0,
            'success_after_failures': 0,
            'target_ports': 0,
            'is_brute_force': False,
            'brute_force_score': 0.0
        }


class ComprehensiveAttackDetector:
    """Main class that coordinates all attack detectors"""
    
    def __init__(self):
        self.port_scan_detector = PortScanDetector(time_window_seconds=60)
        self.dos_detector = DoSDetector(time_window_seconds=60)
        self.r2l_detector = R2LDetector(time_window_seconds=300)
        self.u2r_detector = U2RDetector(time_window_seconds=300)
        self.brute_force_detector = BruteForceDetector(time_window_seconds=300)
    
    def analyze_packet(self, packet: dict) -> dict:
        """
        Analyze a packet and return all attack detection results
        
        Args:
            packet: Packet dictionary with start_ip, end_ip, protocol, etc.
        
        Returns:
            Dictionary with attack_type, is_malicious, confidence, and all detector features
        """
        try:
            # Validate and sanitize input
            if not isinstance(packet, dict):
                return self._default_detection_result()
            
            source_ip = str(packet.get('start_ip', '')).strip()
            dest_ip = str(packet.get('end_ip', '')).strip()
            protocol = str(packet.get('protocol', 'TCP')).upper()
            
            # Validate IP addresses
            if not source_ip or not dest_ip or source_ip == '0.0.0.0' or dest_ip == '0.0.0.0':
                return self._default_detection_result()
            
            packet_size = int(packet.get('start_bytes', 0) or 0) + int(packet.get('end_bytes', 0) or 0)
            packet_size = max(0, min(packet_size, 65535))  # Cap at max packet size
            
            # Extract destination port from description with error handling
            dest_port = None
            description = str(packet.get('description', '')).strip()
            if '->' in description:
                try:
                    port_str = description.split('->')[1].strip().split()[0]  # Get port, remove any trailing text
                    dest_port = int(port_str)
                    dest_port = max(1, min(dest_port, 65535))  # Validate port range
                except (ValueError, IndexError):
                    dest_port = None
            
            # Add to all detectors with error handling
            try:
                self.port_scan_detector.add_packet(source_ip, dest_ip, dest_port, protocol)
            except Exception as e:
                print(f"⚠️ Error in port_scan_detector.add_packet: {e}")
            
            try:
                self.dos_detector.add_packet(source_ip, dest_ip, packet_size, protocol)
            except Exception as e:
                print(f"⚠️ Error in dos_detector.add_packet: {e}")
            
            # Check if this looks like a login attempt (common ports: 22 SSH, 23 Telnet, 80/443 HTTP/HTTPS, 3306 MySQL, 5432 PostgreSQL)
            is_login_attempt = dest_port in [22, 23, 80, 443, 3306, 5432, 3389, 5900] if dest_port else False
            # For brute force, we'll track failed login attempts from the packet description or status
            is_failed = 'failed' in description.lower() or 'denied' in description.lower() or 'refused' in description.lower()
            
            try:
                self.brute_force_detector.add_packet(
                    source_ip=source_ip,
                    dest_port=dest_port,
                    is_login_attempt=is_login_attempt,
                    is_failed=is_failed
                )
            except Exception as e:
                print(f"⚠️ Error in brute_force_detector.add_packet: {e}")
            
            # Get features from all detectors with error handling
            try:
                port_scan_features = self.port_scan_detector.get_features(source_ip)
            except Exception as e:
                print(f"⚠️ Error in port_scan_detector.get_features: {e}")
                port_scan_features = self.port_scan_detector._default_features()
            
            try:
                dos_features = self.dos_detector.get_features(source_ip)
            except Exception as e:
                print(f"⚠️ Error in dos_detector.get_features: {e}")
                dos_features = self.dos_detector._default_features()
            
            try:
                r2l_features = self.r2l_detector.get_features(source_ip)
            except Exception as e:
                print(f"⚠️ Error in r2l_detector.get_features: {e}")
                r2l_features = self.r2l_detector._default_features()
            
            try:
                u2r_features = self.u2r_detector.get_features(source_ip)
            except Exception as e:
                print(f"⚠️ Error in u2r_detector.get_features: {e}")
                u2r_features = self.u2r_detector._default_features()
            
            try:
                brute_force_features = self.brute_force_detector.get_features(source_ip)
            except Exception as e:
                print(f"⚠️ Error in brute_force_detector.get_features: {e}")
                brute_force_features = self.brute_force_detector._default_features()
            
            # Safely extract scores with defaults
            try:
                attack_scores = {
                    'probe': float(port_scan_features.get('port_scan_score', 0) or 0),
                    'dos': float(dos_features.get('dos_score', 0) or 0),
                    'r2l': float(r2l_features.get('r2l_score', 0) or 0),
                    'u2r': float(u2r_features.get('u2r_score', 0) or 0),
                    'brute_force': float(brute_force_features.get('brute_force_score', 0) or 0),
                    'normal': 0.0
                }
                
                # Ensure all scores are valid numbers
                for key, value in attack_scores.items():
                    if not isinstance(value, (int, float)) or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
                        attack_scores[key] = 0.0
            except Exception as e:
                print(f"⚠️ Error calculating attack_scores: {e}")
                attack_scores = {'probe': 0.0, 'dos': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0, 'normal': 0.0}
            
            # Find highest scoring attack
            try:
                max_attack = max(attack_scores.items(), key=lambda x: x[1])
                attack_type = max_attack[0] if max_attack[1] > 0.3 else 'normal'
                confidence = float(max_attack[1])
                confidence = max(0.0, min(1.0, confidence))  # Clamp to [0, 1]
            except Exception as e:
                print(f"⚠️ Error finding max attack: {e}")
                attack_type = 'normal'
                confidence = 0.0
            
            # CRITICAL: If ANY detector says it's an attack, mark as malicious
            # Even if we can't determine the specific type, it's still an attack
            try:
                is_malicious = (
                    bool(port_scan_features.get('is_port_scan', False)) or
                    bool(dos_features.get('is_dos', False)) or
                    bool(r2l_features.get('is_r2l', False)) or
                    bool(u2r_features.get('is_u2r', False)) or
                    bool(brute_force_features.get('is_brute_force', False)) or
                    attack_type != 'normal'
                )
            except Exception as e:
                print(f"⚠️ Error determining is_malicious: {e}")
                is_malicious = attack_type != 'normal'
            
            # If malicious but type is unclear, use "unknown_attack"
            if is_malicious and attack_type == 'normal':
                attack_type = 'unknown_attack'
                # Use the highest non-zero score as confidence
                try:
                    non_zero_scores = [score for score in attack_scores.values() if score > 0]
                    confidence = float(max(non_zero_scores)) if non_zero_scores else 0.5
                    confidence = max(0.0, min(1.0, confidence))  # Clamp to [0, 1]
                except Exception as e:
                    print(f"⚠️ Error calculating unknown_attack confidence: {e}")
                    confidence = 0.5
            
            return {
                'attack_type': str(attack_type),
                'is_malicious': bool(is_malicious),
                'confidence': float(confidence),
                'port_scan_features': port_scan_features,
                'dos_features': dos_features,
                'r2l_features': r2l_features,
                'u2r_features': u2r_features,
                'brute_force_features': brute_force_features,
                'all_scores': attack_scores
            }
        except Exception as e:
            print(f"❌ CRITICAL ERROR in analyze_packet: {e}")
            import traceback
            traceback.print_exc()
            return self._default_detection_result()
    
    def _default_detection_result(self) -> dict:
        """Return a safe default detection result when errors occur"""
        return {
            'attack_type': 'normal',
            'is_malicious': False,
            'confidence': 0.0,
            'port_scan_features': self.port_scan_detector._default_features(),
            'dos_features': self.dos_detector._default_features(),
            'r2l_features': self.r2l_detector._default_features(),
            'u2r_features': self.u2r_detector._default_features(),
            'brute_force_features': self.brute_force_detector._default_features(),
            'all_scores': {'probe': 0.0, 'dos': 0.0, 'r2l': 0.0, 'u2r': 0.0, 'brute_force': 0.0, 'normal': 0.0}
        }


# Global instance
comprehensive_detector = ComprehensiveAttackDetector()

