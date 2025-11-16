import { FC, useEffect } from 'react';
import '../styles/AttackAlertModal.css';

interface AttackAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  attackType: string;
  sourceIP: string;
  destinationIP: string;
  description: string;
  timestamp: Date;
}

interface AttackAlertModalProps {
  alert: AttackAlert | null;
  onClose: () => void;
}

const AttackAlertModal: FC<AttackAlertModalProps> = ({ alert, onClose }) => {
  useEffect(() => {
    if (alert) {
      // Auto-close after 10 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [alert, onClose]);

  if (!alert) return null;

  const getSeverityColor = () => {
    switch (alert.severity) {
      case 'critical': return '#ff4d4f';
      case 'high': return '#fa8c16';
      case 'medium': return '#faad14';
      case 'low': return '#52c41a';
      default: return '#999';
    }
  };

  const getSeverityText = () => {
    switch (alert.severity) {
      case 'critical': return 'CRITICAL THREAT';
      case 'high': return 'HIGH THREAT';
      case 'medium': return 'MEDIUM THREAT';
      case 'low': return 'LOW THREAT';
      default: return 'THREAT';
    }
  };

  const getAttackTypeName = (type: string) => {
    const typeLower = type.toLowerCase();
    const types: { [key: string]: string } = {
      'dos': 'Denial of Service (DoS) Attack',
      'probe': 'Port Scanning / Reconnaissance Attack',
      'r2l': 'Remote to Local Attack',
      'u2r': 'User to Root Attack',
      'normal': 'Normal Traffic',
      'syn flood': 'SYN Flood Attack',
      'port scan': 'Port Scanning Attack',
      'network anomaly': 'Network Anomaly Detected',
      'suspicious activity': 'Suspicious Network Activity'
    };
    
    // Check if type contains keywords
    if (typeLower.includes('dos') || typeLower.includes('denial')) return types['dos'];
    if (typeLower.includes('probe') || typeLower.includes('scan')) return types['probe'];
    if (typeLower.includes('syn') || typeLower.includes('flood')) return types['syn flood'];
    if (typeLower.includes('anomaly') || typeLower.includes('suspicious')) return types['network anomaly'];
    
    return types[typeLower] || type || 'Unknown Attack Type';
  };

  return (
    <div className="attack-alert-overlay" onClick={onClose}>
      <div className="attack-alert-modal" onClick={(e) => e.stopPropagation()}>
        <div className="alert-header" style={{ borderLeftColor: getSeverityColor() }}>
          <div className="alert-title-section">
            <div className="alert-icon" style={{ backgroundColor: getSeverityColor() }}>
              🚨
            </div>
            <div>
              <h2>INTRUSION DETECTED</h2>
              <span className="severity-badge" style={{ backgroundColor: getSeverityColor() }}>
                {getSeverityText()}
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="alert-content">
          <div className="alert-message">
            <p><strong>Someone is trying to intrude your network!</strong></p>
            <p>An attack has been detected and blocked by the IDS system.</p>
          </div>

          <div className="alert-details">
            <div className="detail-row">
              <span className="detail-label">Attack Type:</span>
              <span className="detail-value">{getAttackTypeName(alert.attackType)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Source IP:</span>
              <span className="detail-value">{alert.sourceIP}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Destination IP:</span>
              <span className="detail-value">{alert.destinationIP}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Time:</span>
              <span className="detail-value">{new Date(alert.timestamp).toLocaleString()}</span>
            </div>
            {alert.description && (
              <div className="detail-row full-width">
                <span className="detail-label">Description:</span>
                <span className="detail-value">{alert.description}</span>
              </div>
            )}
          </div>

          <div className="alert-actions">
            <button className="action-btn primary" onClick={onClose}>
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttackAlertModal;

