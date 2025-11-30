import { FC, useEffect, useState, useRef } from 'react';
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Create audio element for sound notifications
  useEffect(() => {
    // Create a data URI for a simple alert sound (beep)
    // Using Web Audio API to generate a tone
    const createAlertSound = (frequency: number, duration: number = 200) => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration / 1000);
      } catch (err) {
        console.warn('[Notifications] Could not play sound:', err);
      }
    };
    
    // Store sound function in ref
    (audioRef as any).current = createAlertSound;
  }, []);
  
  const playAlertSound = (severity: string) => {
    try {
      const createSound = (audioRef as any).current;
      if (!createSound) return;
      
      switch (severity) {
        case 'critical':
          // High-pitched urgent sound
          createSound(800, 300);
          setTimeout(() => createSound(1000, 200), 150);
          break;
        case 'high':
          // Medium-high pitch
          createSound(600, 250);
          break;
        case 'medium':
          // Medium pitch
          createSound(400, 200);
          break;
        case 'low':
          // Low pitch
          createSound(300, 150);
          break;
        default:
          createSound(500, 200);
      }
    } catch (err) {
      console.warn('[Notifications] Error playing sound:', err);
    }
  };

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
          
          const severity = alert.severity || 'medium';
          
          // Play sound alert
          playAlertSound(severity);
          
          // Add to alerts list safely
          setAlerts(prev => {
            try {
              const newAlert = {
                ...alert,
                ip: alert.ip || 'unknown',
                attackType: alert.attackType || 'unknown',
                confidence: typeof alert.confidence === 'number' ? alert.confidence : 0,
                severity: severity,
                timestamp: alert.timestamp || new Date().toISOString(),
              };
              return [newAlert, ...prev.slice(0, 4)]; // Keep last 5 alerts visible
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
                requireInteraction: severity === 'critical',
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
  
  // Auto-remove alerts after 8 seconds (except critical which stay longer)
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    
    alerts.forEach((alert, index) => {
      const duration = alert.severity === 'critical' ? 15000 : 8000; // Critical stays 15s, others 8s
      const timer = setTimeout(() => {
        // Find and remove by unique key
        setAlerts(prev => prev.filter((a, i) => {
          const alertKey = `${a.ip}-${a.timestamp}-${i}`;
          const currentKey = `${alert.ip}-${alert.timestamp}-${index}`;
          return alertKey !== currentKey;
        }));
      }, duration);
      timers.push(timer);
    });
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [alerts]);

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
      top: '20px',
      right: '20px',
      zIndex: 10000,
      maxWidth: '380px',
      pointerEvents: 'none'
    }}>
      <AnimatePresence mode="popLayout">
        {alerts.map((alert, index) => (
          <motion.div
            key={`${alert.ip}-${alert.timestamp}-${index}`}
            initial={{ opacity: 0, x: 400, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, x: 0, scale: 1, y: 0 }}
            exit={{ opacity: 0, x: 400, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={{
              pointerEvents: 'auto',
              marginBottom: '12px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              borderRadius: '12px',
              boxShadow: `0 8px 24px rgba(0,0,0,0.2), 0 0 0 1px ${getSeverityColor(alert.severity)}40`,
              borderLeft: `5px solid ${getSeverityColor(alert.severity)}`,
              padding: '18px',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden'
            }}
            onClick={() => removeAlert(index)}
            whileHover={{ scale: 1.03, boxShadow: `0 12px 32px rgba(0,0,0,0.25), 0 0 0 1px ${getSeverityColor(alert.severity)}60` }}
          >
            {/* Pulsing indicator for critical alerts */}
            {alert.severity === 'critical' && (
              <motion.div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  background: getSeverityColor(alert.severity),
                }}
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
            
            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeAlert(index);
              }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'rgba(0,0,0,0.1)',
                border: 'none',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                color: '#666',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,77,79,0.2)';
                e.currentTarget.style.color = '#ff4d4f';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.1)';
                e.currentTarget.style.color = '#666';
              }}
            >
              ×
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px', paddingRight: '24px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  fontSize: '16px',
                  color: getSeverityColor(alert.severity),
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '20px' }}>🚨</span>
                  <span>{getAttackTypeLabel(alert.attackType)}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#666', fontWeight: '500' }}>
                  {alert.ip} • {alert.protocol?.toUpperCase() || 'UNKNOWN'}
                </div>
              </div>
              {alert.autoBlocked && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
                    background: 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)',
                    color: 'white',
                    fontSize: '10px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    boxShadow: '0 2px 8px rgba(255,77,79,0.4)'
                  }}
                >
                  BLOCKED
                </motion.span>
              )}
            </div>
            {alert.description && (
              <div style={{ 
                fontSize: '13px', 
                color: '#555', 
                marginBottom: '10px',
                lineHeight: '1.4',
                paddingRight: '8px'
              }}>
                {alert.description}
              </div>
            )}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              paddingTop: '8px',
              borderTop: '1px solid rgba(0,0,0,0.1)'
            }}>
              <div style={{ 
                fontSize: '12px', 
                color: '#888',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{
                  background: getSeverityColor(alert.severity),
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  fontWeight: 'bold'
                }}>
                  {alert.severity.toUpperCase()}
                </span>
                <span>{Math.round(alert.confidence * 100)}% confidence</span>
              </div>
              <div style={{ fontSize: '11px', color: '#aaa' }}>
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

