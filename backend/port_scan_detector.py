"""
Port Scan Detection Module
Tracks destination ports per source IP to detect port scanning patterns
"""
from collections import defaultdict
from datetime import datetime, timedelta
import threading

class PortScanDetector:
    def __init__(self, time_window_seconds=60):
        """
        Initialize port scan detector
        
        Args:
            time_window_seconds: Time window to analyze for port scans
        """
        self.time_window = time_window_seconds
        self.port_tracking = defaultdict(lambda: {
            'ports': set(),
            'timestamps': [],
            'unique_dest_ips': set(),
            'total_packets': 0
        })
        self.lock = threading.Lock()
        
        # Cleanup old data periodically
        self._cleanup_old_data()
    
    def _cleanup_old_data(self):
        """Remove old tracking data outside the time window"""
        now = datetime.now()
        cutoff_time = now - timedelta(seconds=self.time_window)
        
        with self.lock:
            keys_to_remove = []
            for source_ip, data in self.port_tracking.items():
                # Remove old timestamps
                data['timestamps'] = [ts for ts in data['timestamps'] 
                                     if ts > cutoff_time]
                
                # If no recent activity, mark for removal
                if not data['timestamps']:
                    keys_to_remove.append(source_ip)
            
            for key in keys_to_remove:
                del self.port_tracking[key]
    
    def add_packet(self, source_ip: str, dest_ip: str, dest_port: int = None, 
                   protocol: str = 'TCP'):
        """
        Add a packet to tracking
        
        Args:
            source_ip: Source IP address
            dest_ip: Destination IP address
            dest_port: Destination port (if available)
            protocol: Protocol (TCP, UDP, etc.)
        """
        now = datetime.now()
        cutoff_time = now - timedelta(seconds=self.time_window)
        
        with self.lock:
            data = self.port_tracking[source_ip]
            
            # Clean old timestamps
            data['timestamps'] = [ts for ts in data['timestamps'] 
                                if ts > cutoff_time]
            
            # Add new data
            data['timestamps'].append(now)
            data['unique_dest_ips'].add(dest_ip)
            data['total_packets'] += 1
            
            if dest_port:
                data['ports'].add(dest_port)
    
    def get_port_scan_features(self, source_ip: str) -> dict:
        """
        Get port scan detection features for a source IP
        
        Returns:
            Dictionary with port scan features
        """
        with self.lock:
            if source_ip not in self.port_tracking:
                return {
                    'unique_ports': 0,
                    'port_scan_rate': 0.0,
                    'unique_dest_ips': 0,
                    'packets_per_second': 0.0,
                    'is_port_scan': False,
                    'port_scan_score': 0.0
                }
            
            data = self.port_tracking[source_ip]
            now = datetime.now()
            cutoff_time = now - timedelta(seconds=self.time_window)
            
            # Filter to recent timestamps
            recent_timestamps = [ts for ts in data['timestamps'] 
                               if ts > cutoff_time]
            
            if not recent_timestamps:
                return {
                    'unique_ports': 0,
                    'port_scan_rate': 0.0,
                    'unique_dest_ips': 0,
                    'packets_per_second': 0.0,
                    'is_port_scan': False,
                    'port_scan_score': 0.0
                }
            
            unique_ports = len(data['ports'])
            unique_dest_ips = len(data['unique_dest_ips'])
            total_packets = len(recent_timestamps)
            time_span = (recent_timestamps[-1] - recent_timestamps[0]).total_seconds()
            
            if time_span > 0:
                packets_per_second = total_packets / time_span
                port_scan_rate = unique_ports / time_span if time_span > 0 else 0
            else:
                packets_per_second = total_packets
                port_scan_rate = unique_ports
            
            # Port scan detection heuristics
            # High number of unique ports in short time = port scan
            is_port_scan = False
            port_scan_score = 0.0
            
            if unique_ports >= 10 and packets_per_second > 5:
                # Likely port scan: many ports, high packet rate
                port_scan_score = min(1.0, (unique_ports / 100.0) * (packets_per_second / 50.0))
                if port_scan_score > 0.3:
                    is_port_scan = True
            elif unique_ports >= 5 and packets_per_second > 10:
                # Aggressive port scan
                port_scan_score = min(1.0, (unique_ports / 50.0) * (packets_per_second / 100.0))
                if port_scan_score > 0.2:
                    is_port_scan = True
            elif unique_ports >= 20:
                # Many ports scanned regardless of rate
                port_scan_score = min(1.0, unique_ports / 200.0)
                if port_scan_score > 0.4:
                    is_port_scan = True
            
            return {
                'unique_ports': unique_ports,
                'port_scan_rate': port_scan_rate,
                'unique_dest_ips': unique_dest_ips,
                'packets_per_second': packets_per_second,
                'is_port_scan': is_port_scan,
                'port_scan_score': port_scan_score
            }
    
    def reset_source(self, source_ip: str):
        """Reset tracking for a source IP"""
        with self.lock:
            if source_ip in self.port_tracking:
                del self.port_tracking[source_ip]

# Global instance
port_scan_detector = PortScanDetector(time_window_seconds=60)

