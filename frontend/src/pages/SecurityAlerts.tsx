import { FC, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import Navbar from '../components/Navbar';
import { ipBlockService } from '../services/ipBlockService';
import { authService } from '../services/auth';
import '../styles/SecurityAlerts.css';

interface ThreatAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  source: string;
  destination: string;
  timestamp: string;
  description: string;
  status: 'active' | 'investigating' | 'mitigated' | 'resolved';
  attackType?: string;
  confidence?: number;
  autoBlocked?: boolean;
}

interface FilterState {
  severity: string[];
  status: string[];
  timeRange: string;
}

const SecurityAlerts: FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedAlertId, setExpandedAlertId] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    severity: [],
    status: [],
    timeRange: '24h'
  });
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threatAlerts, setThreatAlerts] = useState<ThreatAlert[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Listen for real-time intrusion alerts
  useEffect(() => {
    const token = authService.getToken();
    if (!token) return;

    const socketConnection = io('http://localhost:5001', {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    socketConnection.on('connect', () => {
      console.log('[SecurityAlerts] Socket connected');
      setSocket(socketConnection);
    });

    socketConnection.on('intrusion-detected', (alert: any) => {
      const newAlert: ThreatAlert = {
        id: `${alert.ip}-${alert.timestamp}`,
        severity: alert.severity || 'high',
        type: alert.attackType || 'Unknown Attack',
        source: alert.ip,
        destination: 'Network',
        timestamp: new Date(alert.timestamp).toLocaleString(),
        description: alert.description || `Attack detected: ${alert.attackType}`,
        status: alert.autoBlocked ? 'mitigated' : 'active',
        attackType: alert.attackType,
        confidence: alert.confidence,
        autoBlocked: alert.autoBlocked,
      };
      
      setThreatAlerts(prev => [newAlert, ...prev.slice(0, 99)]); // Keep last 100
    });

    return () => {
      socketConnection.disconnect();
    };
  }, []);

  // Initial mock data for demo (will be replaced by real alerts)
  useEffect(() => {
    if (threatAlerts.length === 0) {
      const mockAlerts: ThreatAlert[] = [
    {
      id: 1,
      severity: 'critical',
      type: 'Data Exfiltration',
      source: '192.168.1.45',
      destination: '103.245.67.89',
      timestamp: '2024-03-20 14:37:22',
      description: 'Suspicious outbound data transfer detected. Large encrypted files sent to unknown external server.',
      status: 'active'
    },
    {
      id: 2,
      severity: 'high',
      type: 'Brute Force Attack',
      source: '45.67.89.123',
      destination: '192.168.1.254',
      timestamp: '2024-03-20 13:22:15',
      description: 'Multiple failed login attempts detected on authentication server. Pattern indicates automated password guessing.',
      status: 'investigating'
    },
    {
      id: 3,
      severity: 'medium',
      type: 'Port Scanning',
      source: '78.45.123.87',
      destination: '192.168.1.1',
      timestamp: '2024-03-20 12:15:34',
      description: 'Sequential port scanning detected from external IP. Multiple common service ports targeted.',
      status: 'mitigated'
    },
    {
      id: 4,
      severity: 'high',
      type: 'Malware Detection',
      source: '192.168.1.87',
      destination: 'Internal Network',
      timestamp: '2024-03-20 11:03:47',
      description: 'Trojan signature detected on workstation. Potential command and control communication observed.',
      status: 'active'
    },
    {
      id: 5,
      severity: 'low',
      type: 'Suspicious Traffic',
      source: '192.168.1.123',
      destination: '45.78.123.45',
      timestamp: '2024-03-20 09:45:12',
      description: 'Unusual traffic pattern detected. Non-business hours communication with flagged IP address.',
      status: 'resolved'
    }
      ];
      setThreatAlerts(mockAlerts);
    }
  }, []);

  const timeRangeOptions = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: 'all', label: 'All Time' }
  ];

  const filterOptions = {
    severity: [
      { value: 'critical', label: 'Critical', color: '#ff4d4f' },
      { value: 'high', label: 'High', color: '#fa8c16' },
      { value: 'medium', label: 'Medium', color: '#faad14' },
      { value: 'low', label: 'Low', color: '#52c41a' }
    ],
    status: [
      { value: 'active', label: 'Active' },
      { value: 'investigating', label: 'Investigating' },
      { value: 'mitigated', label: 'Mitigated' },
      { value: 'resolved', label: 'Resolved' }
    ]
  };

  const handleToggleExpand = (id: number) => {
    setExpandedAlertId(expandedAlertId === id ? null : id);
  };

  const handleFilterToggle = (type: 'severity' | 'status', value: string) => {
    setFilters(prev => {
      const current = [...prev[type]];
      const index = current.indexOf(value);
      
      if (index === -1) {
        current.push(value);
      } else {
        current.splice(index, 1);
      }
      
      return { ...prev, [type]: current };
    });
  };

  const handleTimeRangeChange = (range: string) => {
    setFilters(prev => ({ ...prev, timeRange: range }));
  };

  // Filter alerts based on current filters
  const filteredAlerts = threatAlerts.filter(alert => {
    // Search term filter
    const matchesSearch = 
      searchTerm === '' || 
      Object.values(alert).some(
        value => typeof value === 'string' && value.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    // Severity filter
    const matchesSeverity = 
      filters.severity.length === 0 || 
      filters.severity.includes(alert.severity);
    
    // Status filter
    const matchesStatus = 
      filters.status.length === 0 || 
      filters.status.includes(alert.status);
    
    // Time filter would be implemented with real data
    
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="status-badge active">Active</span>;
      case 'investigating': return <span className="status-badge investigating">Investigating</span>;
      case 'mitigated': return <span className="status-badge mitigated">Mitigated</span>;
      case 'resolved': return <span className="status-badge resolved">Resolved</span>;
      default: return null;
    }
  };

  const handleBlockIP = async (ip: string) => {
    const ok = window.confirm(`Block IP ${ip}?`);
    if (!ok) return;
    try {
      setError(null);
      await ipBlockService.blockIP(ip, 'Blocked via Security Alerts');
      setBlockMsg(`Blocked ${ip}`);
      setTimeout(() => setBlockMsg(null), 2500);
    } catch (e: any) {
      setError(e?.message || 'Failed to block IP');
    }
  };

  return (
    <div className="security-alerts-page">
      <Navbar />
      <motion.main
        className="security-alerts-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {error && (
          <motion.div className="error-message" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {error}
          </motion.div>
        )}
        {blockMsg && (
          <motion.div className="success-message" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {blockMsg}
          </motion.div>
        )}
        <motion.div 
          className="security-header"
          initial={{ y: -20 }}
          animate={{ y: 0 }}
        >
          <h1>Security Alerts</h1>
          <div className="security-stats">
            <motion.div 
              className="stat-card critical"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <h3>Critical</h3>
              <span className="stat-value">1</span>
            </motion.div>
            <motion.div 
              className="stat-card high"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <h3>High</h3>
              <span className="stat-value">2</span>
            </motion.div>
            <motion.div 
              className="stat-card medium"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h3>Medium</h3>
              <span className="stat-value">1</span>
            </motion.div>
            <motion.div 
              className="stat-card low"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h3>Low</h3>
              <span className="stat-value">1</span>
            </motion.div>
          </div>
        </motion.div>

        <div className="controls-container">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search alerts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          
          <div className="filters-container">
            <div className="filter-group">
              <h4>Severity</h4>
              <div className="filter-options">
                {filterOptions.severity.map(option => (
                  <motion.button
                    key={option.value}
                    className={`filter-chip ${filters.severity.includes(option.value) ? 'active' : ''}`}
                    style={{ 
                      '--chip-color': option.color,
                      '--chip-bg': `${option.color}22`
                    } as React.CSSProperties}
                    onClick={() => handleFilterToggle('severity', option.value)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {option.label}
                  </motion.button>
                ))}
              </div>
            </div>
            
            <div className="filter-group">
              <h4>Status</h4>
              <div className="filter-options">
                {filterOptions.status.map(option => (
                  <motion.button
                    key={option.value}
                    className={`filter-chip ${filters.status.includes(option.value) ? 'active' : ''}`}
                    onClick={() => handleFilterToggle('status', option.value)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {option.label}
                  </motion.button>
                ))}
              </div>
            </div>
            
            <div className="filter-group">
              <h4>Time Range</h4>
              <div className="filter-options">
                <select 
                  value={filters.timeRange}
                  onChange={(e) => handleTimeRangeChange(e.target.value)}
                  className="time-select"
                >
                  {timeRangeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="alerts-list">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => (
              <motion.div
                key={alert.id}
                className={`alert-card ${alert.severity} ${expandedAlertId === alert.id ? 'expanded' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: alert.id * 0.1 }}
                layoutId={`alert-${alert.id}`}
              >
                <div className="alert-header" onClick={() => handleToggleExpand(alert.id)}>
                  <div className="alert-icon-container">
                    <span className="alert-icon">{getSeverityIcon(alert.severity)}</span>
                  </div>
                  <div className="alert-basic-info">
                    <h3>
                      {alert.attackType ? (
                        <span>
                          {getAttackTypeLabel(alert.attackType)}
                          {alert.confidence && (
                            <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
                              ({Math.round(alert.confidence * 100)}% confidence)
                            </span>
                          )}
                        </span>
                      ) : (
                        alert.type
                      )}
                    </h3>
                    <div className="alert-meta">
                      <span className="timestamp">{alert.timestamp}</span>
                      {getStatusBadge(alert.status)}
                      {alert.autoBlocked && (
                        <span style={{
                          background: '#ff4d4f',
                          color: 'white',
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          marginLeft: '8px',
                          fontWeight: 'bold'
                        }}>
                          AUTO-BLOCKED
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="alert-actions">
                    <motion.button
                      className="expand-btn"
                      animate={{ rotate: expandedAlertId === alert.id ? 180 : 0 }}
                    >
                      ▼
                    </motion.button>
                  </div>
                </div>
                
                {expandedAlertId === alert.id && (
                  <motion.div 
                    className="alert-details"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="detail-group">
                      <div className="detail-item">
                        <span className="detail-label">Source</span>
                        <span className="detail-value">{alert.source}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Destination</span>
                        <span className="detail-value">{alert.destination}</span>
                      </div>
                    </div>
                    <div className="detail-description">
                      <p>{alert.description}</p>
                      {alert.attackType && (
                        <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                          <strong>Attack Type:</strong> {alert.attackType}
                          {alert.confidence && (
                            <span> • <strong>Confidence:</strong> {Math.round(alert.confidence * 100)}%</span>
                          )}
                          {alert.autoBlocked && (
                            <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}> • AUTO-BLOCKED</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="detail-actions">
                      <motion.button 
                        className="action-btn investigate"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Investigate
                      </motion.button>
                      <motion.button 
                        className="action-btn mitigate"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Mitigate
                      </motion.button>
                      <motion.button 
                        className="action-btn resolve"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Resolve
                      </motion.button>
                      <motion.button 
                        className="action-btn block"
                        onClick={(e) => { e.stopPropagation(); handleBlockIP(alert.source); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Block IP
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))
          ) : (
            <div className="no-results">
              <p>No alerts match your current filters</p>
              <button 
                className="reset-btn"
                onClick={() => {
                  setFilters({ severity: [], status: [], timeRange: '24h' });
                  setSearchTerm('');
                }}
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </motion.main>
    </div>
  );
};

export default SecurityAlerts; 