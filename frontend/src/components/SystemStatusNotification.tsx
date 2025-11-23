import { FC, useEffect, useState } from 'react';
import '../styles/SystemStatusNotification.css';

interface SystemStatusNotificationProps {
  status: 'idle' | 'blocking' | 'resetting' | 'resuming' | 'processing';
  message?: string;
}

const SystemStatusNotification: FC<SystemStatusNotificationProps> = ({ 
  status, 
  message 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [displayMessage, setDisplayMessage] = useState('');

  useEffect(() => {
    if (status === 'idle') {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    
    // Set message based on status
    switch (status) {
      case 'blocking':
        setDisplayMessage(message || '🚨 System is blocking the attack... Please wait.');
        break;
      case 'resetting':
        setDisplayMessage(message || '🔄 System is resetting and securing network... Please wait.');
        break;
      case 'resuming':
        setDisplayMessage(message || '✅ System is resuming normal functions... Please wait.');
        break;
      case 'processing':
        setDisplayMessage(message || '⚙️ System is processing attack data... Please wait.');
        break;
      default:
        setDisplayMessage(message || 'Processing... Please wait.');
    }

    // Auto-hide after 5 seconds if status is resuming (system recovered)
    if (status === 'resuming') {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, message]);

  if (!isVisible) return null;

  const getStatusIcon = () => {
    switch (status) {
      case 'blocking': return '🛡️';
      case 'resetting': return '🔄';
      case 'resuming': return '✅';
      case 'processing': return '⚙️';
      default: return '⏳';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'blocking': return '#ff4d4f';
      case 'resetting': return '#fa8c16';
      case 'resuming': return '#52c41a';
      case 'processing': return '#1890ff';
      default: return '#999';
    }
  };

  return (
    <div className="system-status-overlay">
      <div 
        className="system-status-notification"
        style={{ borderLeftColor: getStatusColor() }}
      >
        <div className="status-icon" style={{ color: getStatusColor() }}>
          {getStatusIcon()}
        </div>
        <div className="status-content">
          <div className="status-title">SYSTEM STATUS</div>
          <div className="status-message">{displayMessage}</div>
        </div>
        <div className="status-spinner">
          <div className="spinner" style={{ borderColor: getStatusColor() }}></div>
        </div>
      </div>
    </div>
  );
};

export default SystemStatusNotification;

