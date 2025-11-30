import { FC, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { authService } from '../services/auth';

interface IntrusionAlert {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  ip: string;
  attackType: string;
  confidence: number;
  protocol: string;
  description: string;
  timestamp: string;
  autoBlocked: boolean;
}

const NotificationSystem: FC = () => {
  const [alerts, setAlerts] = useState<IntrusionAlert[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    try {
      const token = authService.getToken();
      if (!token || !authService.isAuthenticated()) {
        return;
      }

      const socketConnection = io('http://localhost:5001', {
        auth: { token },
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000,
      });

      socketConnection.on('connect', () => {
        console.log('[Notifications] Socket connected');
        setSocket(socketConnection);
      });

      socketConnection.on('connect_error', (err) => {
        console.warn('[Notifications] Socket connection error:', err);
        // Don't crash, just log
      });

      socketConnection.on('error', (err) => {
        console.warn('[Notifications] Socket error:', err);
        // Don't crash, just log
      });

      socketConnection.on('intrusion-detected', (alert: IntrusionAlert) => {
        try {
          console.log('[Notifications] Intrusion detected:', alert);
          
          // Validate alert data before using
          if (!alert || typeof alert !== 'object') {
            console.warn('[Notifications] Invalid alert data:', alert);
            return;
          }
          
          // Add to alerts list safely
          setAlerts(prev => {
            try {
              const newAlert = {
                ...alert,
                ip: alert.ip || 'unknown',
                attackType: alert.attackType || 'unknown',
                confidence: typeof alert.confidence === 'number' ? alert.confidence : 0,
                severity: alert.severity || 'medium',
              };
              return [newAlert, ...prev.slice(0, 9)]; // Keep last 10 alerts
            } catch (err) {
              console.warn('[Notifications] Error adding alert:', err);
              return prev; // Return previous state on error
            }
          });
          
          // Show browser notification if permission granted
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              const notification = new Notification('🚨 Intrusion Detected', {
                body: `${alert.attackType || 'Attack'} from ${alert.ip || 'unknown'} (${Math.round((alert.confidence || 0) * 100)}% confidence)`,
                icon: '/logo.svg',
                tag: `intrusion-${alert.ip || 'unknown'}-${Date.now()}`,
                requireInteraction: alert.severity === 'critical',
              });
              
              // Handle notification errors
              notification.onerror = (err) => {
                console.warn('[Notifications] Notification error:', err);
              };
            }
          } catch (notifErr) {
            console.warn('[Notifications] Error showing browser notification:', notifErr);
            // Don't crash, just log
          }
        } catch (err) {
          console.error('[Notifications] Error processing intrusion alert:', err);
          // Don't crash, just log
        }
      });

      // Request notification permission on mount
      try {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(err => {
            console.warn('[Notifications] Error requesting permission:', err);
          });
        }
      } catch (permErr) {
        console.warn('[Notifications] Error with notification permission:', permErr);
      }

      return () => {
        try {
          socketConnection.disconnect();
        } catch (err) {
          console.warn('[Notifications] Error disconnecting socket:', err);
        }
      };
    } catch (err) {
      console.error('[Notifications] Error setting up notification system:', err);
      // Don't crash the app, just log the error
    }
  }, []);

  const removeAlert = (index: number) => {
    setAlerts(prev => prev.filter((_, i) => i !== index));
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#ff4d4f';
      case 'high': return '#fa8c16';
      case 'medium': return '#faad14';
      case 'low': return '#52c41a';
      default: return '#8c8c8c';
    }
  };

  const getAttackTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      'dos': 'Denial of Service',
      'ddos': 'Distributed DoS',
      'probe': 'Network Probe',
      'port_scan': 'Port Scan',
      'ping_sweep': 'Ping Sweep',
      'r2l': 'Remote to Local',
      'brute_force': 'Brute Force',
      'u2r': 'User to Root',
      'critical_traffic': 'Critical Traffic',
      'normal': 'Normal',
      'unknown': 'Unknown Attack'
    };
    return labels[type] || type;
  };

  return (
    <div className="notification-system" style={{
      position: 'fixed',
      top: '80px',
      right: '20px',
      zIndex: 10000,
      maxWidth: '400px',
      pointerEvents: 'none'
    }}>
      <AnimatePresence>
        {alerts.map((alert, index) => (
          <motion.div
            key={`${alert.ip}-${alert.timestamp}-${index}`}
            initial={{ opacity: 0, x: 400, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 400, scale: 0.8 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              pointerEvents: 'auto',
              marginBottom: '12px',
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              borderLeft: `4px solid ${getSeverityColor(alert.severity)}`,
              padding: '16px',
              cursor: 'pointer'
            }}
            onClick={() => removeAlert(index)}
            whileHover={{ scale: 1.02 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
              <div>
                <div style={{ 
                  fontWeight: 'bold', 
                  fontSize: '14px',
                  color: getSeverityColor(alert.severity),
                  marginBottom: '4px'
                }}>
                  🚨 {getAttackTypeLabel(alert.attackType)}
                </div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {alert.ip} • {alert.protocol}
                </div>
              </div>
              {alert.autoBlocked && (
                <span style={{
                  background: '#ff4d4f',
                  color: 'white',
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 'bold'
                }}>
                  BLOCKED
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
              {alert.description}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', color: '#999' }}>
                {Math.round(alert.confidence * 100)}% confidence
              </div>
              <div style={{ fontSize: '10px', color: '#bbb' }}>
                {new Date(alert.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default NotificationSystem;

