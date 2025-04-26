import { FC, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { packetService, ThreatAlert } from '../services/packetService';
import '../styles/Monitoring.css';

interface FilterState {
  severity: string[];
  status: string[];
  timeRange: string;
}

const Monitoring: FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [alertStats, setAlertStats] = useState({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    severity: [],
    status: [],
    timeRange: '24h'
  });

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

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get alerts and stats
      const [alertsData, statsData] = await Promise.all([
        packetService.getAlerts(),
        packetService.getAlertStats()
      ]);

      setAlerts(alertsData);
      setAlertStats(statsData);
    } catch (err) {
      console.error('Error fetching monitoring data:', err);
      setError('Failed to fetch monitoring data. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleExpand = (id: string) => {
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

  const handleUpdateStatus = async (alertId: string, newStatus: ThreatAlert['status']) => {
    try {
      await packetService.updateAlertStatus(alertId, newStatus);
      // Refresh alerts after status update
      const updatedAlerts = await packetService.getAlerts();
      setAlerts(updatedAlerts);
    } catch (err) {
      console.error('Error updating alert status:', err);
      setError('Failed to update alert status. Please try again.');
    }
  };

  // Filter alerts based on current filters
  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = 
      searchTerm === '' || 
      Object.values(alert).some(
        value => typeof value === 'string' && value.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    const matchesSeverity = 
      filters.severity.length === 0 || 
      filters.severity.includes(alert.severity);
    
    const matchesStatus = 
      filters.status.length === 0 || 
      filters.status.includes(alert.status);
    
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

  if (isLoading) {
    return (
      <div className="monitoring-page">
        <Navbar />
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="monitoring-page">
      <Navbar />
      <motion.main
        className="monitoring-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {error && (
          <motion.div 
            className="error-message"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.div>
        )}

        <motion.div 
          className="monitoring-header"
          initial={{ y: -20 }}
          animate={{ y: 0 }}
        >
          <div className="header-row">
            <h1>Monitoring</h1>
            <motion.button
              className="refresh-button"
              onClick={fetchData}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="loading-spinner" />
              ) : (
                <span>🔄 Refresh</span>
              )}
            </motion.button>
          </div>
          <div className="monitoring-stats">
            <motion.div 
              className="stat-card critical"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <h3>Critical</h3>
              <span className="stat-value">{alertStats.critical}</span>
            </motion.div>
            <motion.div 
              className="stat-card high"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <h3>High</h3>
              <span className="stat-value">{alertStats.high}</span>
            </motion.div>
            <motion.div 
              className="stat-card medium"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h3>Medium</h3>
              <span className="stat-value">{alertStats.medium}</span>
            </motion.div>
            <motion.div 
              className="stat-card low"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h3>Low</h3>
              <span className="stat-value">{alertStats.low}</span>
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
                    key={`severity-${option.value}`}
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
                    key={`status-${option.value}`}
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

        <AnimatePresence>
          <div className="alerts-list">
            {filteredAlerts.length > 0 ? (
              filteredAlerts.map((alert) => (
                <motion.div
                  key={alert._id}
                  className={`alert-card ${alert.severity} ${expandedAlertId === alert._id ? 'expanded' : ''}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  layout
                >
                  <div className="alert-header" onClick={() => handleToggleExpand(alert._id)}>
                    <div className="alert-icon-container">
                      <span className="alert-icon">{getSeverityIcon(alert.severity)}</span>
                    </div>
                    <div className="alert-basic-info">
                      <h3>{alert.type}</h3>
                      <div className="alert-meta">
                        <span className="timestamp">
                          {new Date(alert.timestamp).toLocaleString()}
                        </span>
                        {getStatusBadge(alert.status)}
                      </div>
                    </div>
                    <div className="alert-actions">
                      <motion.button
                        className="expand-btn"
                        animate={{ rotate: expandedAlertId === alert._id ? 180 : 0 }}
                      >
                        ▼
                      </motion.button>
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {expandedAlertId === alert._id && (
                      <motion.div 
                        className="alert-details"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
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
                          <div className="detail-item">
                            <span className="detail-label">Attack Type</span>
                            <span className="detail-value">{alert.attack_type}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Confidence</span>
                            <span className="detail-value">{alert.confidence}%</span>
                          </div>
                        </div>
                        <div className="detail-description">
                          <p>{alert.description}</p>
                        </div>
                        <div className="detail-actions">
                          {alert.status !== 'investigating' && (
                            <motion.button 
                              className="action-btn investigate"
                              onClick={() => handleUpdateStatus(alert._id, 'investigating')}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              Investigate
                            </motion.button>
                          )}
                          {alert.status !== 'mitigated' && (
                            <motion.button 
                              className="action-btn mitigate"
                              onClick={() => handleUpdateStatus(alert._id, 'mitigated')}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              Mitigate
                            </motion.button>
                          )}
                          {alert.status !== 'resolved' && (
                            <motion.button 
                              className="action-btn resolve"
                              onClick={() => handleUpdateStatus(alert._id, 'resolved')}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              Resolve
                            </motion.button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            ) : (
              <motion.div 
                className="no-results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <p>No alerts match your current filters</p>
                <motion.button 
                  className="reset-btn"
                  onClick={() => {
                    setFilters({ severity: [], status: [], timeRange: '24h' });
                    setSearchTerm('');
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Reset Filters
                </motion.button>
              </motion.div>
            )}
          </div>
        </AnimatePresence>
      </motion.main>
    </div>
  );
};

export default Monitoring; 