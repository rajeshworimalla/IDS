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
  inGracePeriod?: boolean;
  requiresUserDecision?: boolean;
  actionRequired?: string;
}

const NotificationSystem: FC = () => {
  const [alerts, setAlerts] = useState<IntrusionAlert[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Track which critical alerts have been shown: IP:attackType (allows different attack types from same IP)
  const criticalAlertsShown = useRef<Set<string>>(new Set());
  
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

      // Listen for blocking-complete event (system ready for next attack)
      socketConnection.on('blocking-complete', (data: { ip: string; message: string }) => {
        try {
          console.log('[Notifications] Blocking complete:', data.message);
          // Show a success notification
          const successAlert = {
            type: 'blocking-complete',
            severity: 'low' as const,
            ip: data.ip,
            attackType: 'Blocked',
            confidence: 1.0,
            protocol: '',
            description: data.message,
            timestamp: new Date().toISOString(),
            autoBlocked: false
          };
          setAlerts(prev => [successAlert, ...prev.slice(0, 4)]);
        } catch (err) {
          console.warn('[Notifications] Error processing blocking-complete:', err);
        }
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
          const alertIP = alert.ip || 'unknown';
          const attackType = alert.attackType || 'unknown';
          const inGracePeriod = alert.inGracePeriod || false;
          const requiresUserDecision = alert.requiresUserDecision || false;
          
          // Create unique key for this alert: IP:attackType
          // This allows different attack types from the same IP to show separate notifications
          const alertKey = `${alertIP}:${attackType}`;
          
          // For critical alerts: only show one popup per IP:attackType combination
          // BUT: Always allow grace period notifications (requiresUserDecision) to show
          if (severity === 'critical') {
            // Grace period notifications should always show (user needs to decide)
            if (!inGracePeriod && !requiresUserDecision && criticalAlertsShown.current.has(alertKey)) {
              console.log(`[Notifications] Skipping duplicate critical alert for ${alertKey}`);
              return; // Don't show another popup for this IP:attackType combination
            }
            
            // Mark this alert as shown (only if not a grace period notification)
            // Grace period notifications can show multiple times if user doesn't respond
            if (!inGracePeriod && !requiresUserDecision) {
              criticalAlertsShown.current.add(alertKey);
              // Remove from set after 5 minutes to allow new alerts if needed
              setTimeout(() => {
                criticalAlertsShown.current.delete(alertKey);
              }, 5 * 60 * 1000);
            }
            
            // For grace period notifications, log that we're showing it
            if (inGracePeriod || requiresUserDecision) {
              console.log(`[Notifications] Showing grace period notification for ${alertIP}:${attackType} (requires user decision)`);
            }
          }
          
          // Play sound alert
          playAlertSound(severity);
          
          // Add to alerts list safely
          setAlerts(prev => {
            try {
              const newAlert = {
                ...alert,
                ip: alertIP,
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
    <>
      {/* Big Modal Popup for Critical Alerts - Center of Screen */}
      <AnimatePresence>
        {alerts.filter(a => a.severity === 'critical').slice(0, 1).map((alert, index) => (
          <motion.div
            key={`modal-${alert.ip}-${alert.timestamp}-${index}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              pointerEvents: 'auto'
            }}
            onClick={(e) => {
              // Don't close on backdrop click - require explicit acknowledge
              e.stopPropagation();
            }}
          >
            <motion.div
              initial={{ y: -50 }}
              animate={{ y: 0 }}
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #fff5f5 100%)',
                borderRadius: '20px',
                boxShadow: `0 20px 60px rgba(255,77,79,0.4), 0 0 0 3px ${getSeverityColor(alert.severity)}`,
                padding: '40px',
                maxWidth: '600px',
                width: '90%',
                position: 'relative',
                cursor: 'pointer'
              }}
              onClick={(e) => e.stopPropagation()}
              whileHover={{ scale: 1.02 }}
            >
              {/* Close button */}
              <button
                onClick={(e) => {
              // Don't close on backdrop click - require explicit acknowledge
              e.stopPropagation();
            }}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'rgba(255,77,79,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  color: '#ff4d4f',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,77,79,0.2)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,77,79,0.1)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ×
              </button>

              {/* Alert Icon */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  style={{
                    fontSize: '80px',
                    marginBottom: '16px'
                  }}
                >
                  🚨
                </motion.div>
                <h2 style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: getSeverityColor(alert.severity),
                  margin: 0,
                  marginBottom: '8px'
                }}>
                  INTRUSION DETECTED
                </h2>
              </div>

              {/* Attack Type */}
              <div style={{
                background: 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)',
                color: 'white',
                padding: '16px 24px',
                borderRadius: '12px',
                marginBottom: '24px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>ATTACK TYPE</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                  {getAttackTypeLabel(alert.attackType)}
                </div>
              </div>

              {/* Details */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '16px' }}>
                  <span style={{ color: '#666', fontWeight: '500' }}>Source IP:</span>
                  <span style={{ fontWeight: 'bold', color: '#ff4d4f' }}>{alert.ip}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '16px' }}>
                  <span style={{ color: '#666', fontWeight: '500' }}>Protocol:</span>
                  <span style={{ fontWeight: 'bold' }}>{alert.protocol?.toUpperCase() || 'UNKNOWN'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '16px' }}>
                  <span style={{ color: '#666', fontWeight: '500' }}>Confidence:</span>
                  <span style={{ fontWeight: 'bold', color: '#fa8c16' }}>
                    {Math.round(alert.confidence * 100)}%
                  </span>
                </div>
                {alert.autoBlocked && (
                  <div style={{
                    background: 'rgba(255,77,79,0.1)',
                    padding: '12px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    marginTop: '16px',
                    border: '2px solid #ff4d4f'
                  }}>
                    <span style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: '14px' }}>
                      ⛔ IP AUTOMATICALLY BLOCKED
                    </span>
                  </div>
                )}
              </div>

              {/* Description */}
              {alert.description && (
                <div style={{
                  background: '#f8f9fa',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '24px',
                  fontSize: '14px',
                  color: '#555',
                  lineHeight: '1.6'
                }}>
                  {alert.description}
                </div>
              )}

              {/* Timestamp */}
              <div style={{ textAlign: 'center', color: '#888', fontSize: '12px', marginBottom: '24px' }}>
                {new Date(alert.timestamp).toLocaleString()}
              </div>

              {/* Acknowledge Button */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  const alertIndex = alerts.findIndex(a => a.ip === alert.ip && a.timestamp === alert.timestamp);
                  if (alertIndex !== -1) {
                    removeAlert(alertIndex);
                  }
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '16px 32px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(82,196,26,0.4)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(82,196,26,0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(82,196,26,0.4)';
                }}
              >
                <span>✓</span>
                <span>Acknowledge</span>
              </motion.button>
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Toast Notifications for Non-Critical Alerts - Top Right */}
      <div className="notification-system" style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 10000,
        maxWidth: '380px',
        pointerEvents: 'none'
      }}>
        <AnimatePresence mode="popLayout">
          {alerts.filter(a => a.severity !== 'critical').map((alert, index) => (
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
    </>
  );
};

export default NotificationSystem;

