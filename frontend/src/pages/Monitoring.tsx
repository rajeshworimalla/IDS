import { FC, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import Navbar from '../components/Navbar';
import DateRangePicker from '../components/DateRangePicker';
import { packetService, ThreatAlert } from '../services/packetService';
import { ipBlockService, BlockedIP, BlockResponse } from '../services/ipBlockService';
import { authService } from '../services/auth';
import '../styles/Monitoring.css';

interface FilterState {
  severity: string[];
  status: string[];
  dateRange?: {
    from: Date | null;
    to: Date | null;
  };
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
    dateRange: {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      to: new Date() // now
    }
  });
  const [showBlockedIPs, setShowBlockedIPs] = useState(false);
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [blockSuccess, setBlockSuccess] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);


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

  const fetchData = async (filterParams?: FilterState) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const currentFilters = filterParams || filters;
      
      // Prepare filter parameters for API
      const apiFilters: any = {
        // Backend defaults to only critical+medium when severity is omitted.
        // To show results by default, include all severities when none are selected.
        severity: (currentFilters.severity && currentFilters.severity.length > 0)
          ? currentFilters.severity
          : ['critical', 'medium', 'low'],
        status: currentFilters.status
      };
      
      // Add date range if specified
      if (currentFilters.dateRange?.from && currentFilters.dateRange?.to) {
        apiFilters.from = currentFilters.dateRange.from;
        apiFilters.to = currentFilters.dateRange.to;
      }
      
      // Get alerts and stats with filters (with individual error handling)
      let alertsData: ThreatAlert[] = [];
      let statsData = { critical: 0, high: 0, medium: 0, low: 0 };
      
      try {
        const results = await Promise.allSettled([
          packetService.getAlerts(apiFilters),
          packetService.getAlertStats(apiFilters)
        ]);
        
        if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
          alertsData = results[0].value;
        }
        
        if (results[1].status === 'fulfilled' && results[1].value) {
          statsData = results[1].value;
        }
      } catch (err) {
        console.warn('Error fetching alerts/stats:', err);
        // Continue with empty data rather than crashing
      }

      setAlerts(alertsData);
      setAlertStats(statsData);
    } catch (err) {
      console.error('Error in fetchData:', err);
      // Don't show error to user to prevent UI crashes, just log it
      // setError('Failed to fetch monitoring data. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data on component mount
  useEffect(() => {
    // Initial fetch with error handling
    fetchData().catch(err => {
      console.error('Initial fetch failed:', err);
    });
    
    // Load initial blocked list to mark items as blocked
    loadBlockedIPs().catch(err => {
      console.warn('Error loading blocked IPs:', err);
    });

    // Set up socket connection for real-time updates
    try {
      const token = authService.getToken();
      if (token) {
        const socket = io('http://localhost:5001', {
          auth: { token },
          withCredentials: true,
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          timeout: 20000,
        });

        socket.on('connect', () => {
          console.log('[Monitoring] Socket connected');
        });

        socket.on('connect_error', (err) => {
          console.warn('[Monitoring] Socket connection error:', err);
          // Don't crash, just log
        });

        socket.on('error', (err) => {
          console.warn('[Monitoring] Socket error:', err);
          // Don't crash, just log
        });

      socket.on('disconnect', (reason: any) => {
        console.warn('[Monitoring] Socket disconnected:', reason);
        // Don't crash, just log
      });

        // Listen for new packets and intrusion alerts (debounced)
        let packetRefreshTimeout: NodeJS.Timeout | null = null;
        socket.on('new-packet', () => {
          // Debounce: only refresh after 2 seconds of no new packets
          if (packetRefreshTimeout) {
            clearTimeout(packetRefreshTimeout);
          }
          packetRefreshTimeout = setTimeout(() => {
            fetchData().catch((err: any) => {
              console.warn('[Monitoring] Error refreshing on new packet:', err);
            });
          }, 2000);
        });

        socket.on('intrusion-detected', () => {
          // Refresh immediately when intrusion detected (non-blocking)
        fetchData().catch((err: any) => {
          console.warn('[Monitoring] Error refreshing on intrusion:', err);
        });
        loadBlockedIPs().catch((err: any) => {
          console.warn('[Monitoring] Error loading blocked IPs on intrusion:', err);
        });
        });

        socketRef.current = socket;
      }
    } catch (err) {
      console.warn('[Monitoring] Error setting up socket:', err);
      // Continue without socket - polling will still work
    }

    // Set up polling interval to refresh every 10 seconds (reduced frequency)
    // Sync with Dashboard polling interval for consistency
    try {
      refreshIntervalRef.current = setInterval(() => {
        fetchData().catch((err: any) => {
          console.warn('[Monitoring] Polling refresh error:', err);
        });
      }, 10000); // Same as Dashboard (10 seconds)
    } catch (err) {
      console.warn('[Monitoring] Error setting up polling:', err);
    }

    // Cleanup
    return () => {
      try {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      } catch (err) {
        console.warn('[Monitoring] Cleanup error:', err);
      }
    };
  }, []);
  
  // Re-fetch data when filters change
  useEffect(() => {
    fetchData();
  }, [filters]);

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

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    // Update filters and immediately fetch with the new range so results update on Apply
    setFilters(prev => {
      const next = {
        ...prev,
        dateRange: { from, to }
      } as FilterState;
      // Trigger a fetch using the updated filters instead of waiting for state effect
      fetchData(next);
      return next;
    });
  };

  const handleUpdateStatus = async (alertId: string, newStatus: ThreatAlert['status']) => {
    try {
      await packetService.updateAlertStatus(alertId, newStatus);
      await fetchData().catch(err => {
        console.warn('Error refreshing after status update:', err);
      });
    } catch (err) {
      console.error('Error updating alert status:', err);
      setError('Failed to update alert status. Please try again.');
      // Don't crash, just show error
    }
  };

  const handleBlockIP = async (ip: string) => {
    const ok = window.confirm(`Block IP ${ip}?`);
    if (!ok) return;
    try {
      const res: BlockResponse = await ipBlockService.blockIP(ip);
      if (res.applied === false) {
        setError(`Blocked in app, but firewall not applied: ${res.error || 'insufficient privileges or unsupported firewall'}`);
      } else {
        setBlockSuccess(`Blocked ${ip}${res.method ? ' via ' + res.method : ''}`);
        setTimeout(() => setBlockSuccess(null), 2500);
      }
      await loadBlockedIPs().catch(err => {
        console.warn('Error reloading blocked IPs after block:', err);
      });
    } catch (e: any) {
      console.error('Error blocking IP:', e);
      setError(e?.message || 'Failed to block IP.');
      // Don't crash, just show error message
    }
  };

  const loadBlockedIPs = async () => {
    try {
      setBlockedLoading(true);
      setBlockedError(null);
      const list = await ipBlockService.getBlockedIPs();
      if (Array.isArray(list)) {
        setBlockedIPs(list);
      }
    } catch (e) {
      console.warn('Error fetching blocked IPs:', e);
      // Don't set error to prevent UI crashes, just log it
      // setBlockedError('Failed to fetch blocked IPs.');
    } finally {
      setBlockedLoading(false);
    }
  };

  const handleOpenBlockedIPs = async () => {
    setShowBlockedIPs(true);
    await loadBlockedIPs();
  };

  const isBlocked = (ip: string) => blockedIPs.some(b => b.ip === ip);

  const handleUnblockIP = async (ip: string) => {
    const ok = window.confirm(`Unblock IP ${ip}?`);
    if (!ok) return;
    try {
      await ipBlockService.unblockIP(ip);
      await loadBlockedIPs().catch(err => {
        console.warn('Error reloading blocked IPs after unblock:', err);
      });
    } catch (e) {
      console.error('Error unblocking IP:', e);
      setBlockedError('Failed to unblock IP.');
      // Don't crash, just show error
    }
  };

  // Apply client-side search filtering (since search is not handled by API yet)
  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = 
      searchTerm === '' || 
      Object.values(alert).some(
        value => typeof value === 'string' && value.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    return matchesSearch;
  });

  const getAttackTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      'dos': '🚨 Denial of Service',
      'ddos': '🚨 Distributed DoS',
      'probe': '🔍 Network Probe',
      'port_scan': '🔍 Port Scan',
      'ping_sweep': '🔍 Ping Sweep',
      'r2l': '⚠️ Remote to Local',
      'brute_force': '⚠️ Brute Force',
      'u2r': '⚠️ User to Root',
      'critical_traffic': '🚨 Critical Traffic',
      'suspicious_traffic': '⚠️ Suspicious Traffic',
      'normal': '✓ Normal',
      'unknown': '❓ Unknown Attack'
    };
    return labels[type?.toLowerCase()] || type || 'Unknown Attack';
  };

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
        transition={{ duration: 0.2 }}
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
        {blockSuccess && (
          <motion.div 
            className="success-message"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {blockSuccess}
          </motion.div>
        )}

        <motion.div 
          className="monitoring-header"
          initial={{ y: -10 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="header-row">
            <h1>Monitoring</h1>
            <div className="header-actions">
              <motion.button
                className="view-blocked-button"
                onClick={handleOpenBlockedIPs}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                🚫 View blocked IPs
              </motion.button>
              <motion.button
                className="refresh-button"
                onClick={() => fetchData()}
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
          </div>
          <div className="monitoring-stats">
            <motion.div 
              className="stat-card critical"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              <h3>Critical</h3>
              <span className="stat-value">{alertStats.critical}</span>
            </motion.div>
            <motion.div 
              className="stat-card high"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              <h3>High</h3>
              <span className="stat-value">{alertStats.high}</span>
            </motion.div>
            <motion.div 
              className="stat-card medium"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              <h3>Medium</h3>
              <span className="stat-value">{alertStats.medium}</span>
            </motion.div>
            <motion.div 
              className="stat-card low"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.15 }}
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
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.1 }}
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
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.1 }}
                  >
                    {option.label}
                  </motion.button>
                ))}
              </div>
            </div>
            
            <div className="filter-group">
              <h4>Date Range</h4>
              <div className="filter-options">
                <DateRangePicker
                  fromDate={filters.dateRange?.from || undefined}
                  toDate={filters.dateRange?.to || undefined}
                  onDateChange={handleDateRangeChange}
                />
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
                        transition={{ duration: 0.15 }}
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
                            <span className="detail-value" style={{ 
                              fontWeight: 'bold', 
                              color: alert.attack_type && alert.attack_type !== 'normal' ? '#ff4d4f' : '#52c41a' 
                            }}>
                              {getAttackTypeLabel(alert.attack_type || 'normal')}
                            </span>
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
                          {isBlocked(alert.source) ? (
                            <div className="blocked-indicator">
                              🚫 Blocked
                              <button className="inline-unblock" onClick={(e) => { e.stopPropagation(); handleUnblockIP(alert.source); }}>Unblock</button>
                            </div>
                          ) : (
                            <motion.button 
                              className="action-btn block"
                              onClick={(e) => { e.stopPropagation(); handleBlockIP(alert.source); }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              Block IP
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
                    setFilters({ 
                      severity: [], 
                      status: [], 
                      dateRange: {
                        from: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        to: new Date()
                      }
                    });
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
        {/* Blocked IPs Modal */}
        {showBlockedIPs && (
          <div className="modal-backdrop" onClick={() => setShowBlockedIPs(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Blocked IPs</h3>
                <button className="modal-close" onClick={() => setShowBlockedIPs(false)}>✕</button>
              </div>
              <div className="modal-body">
                {blockedLoading && <p>Loading...</p>}
                {blockedError && <p className="error-text">{blockedError}</p>}
                {!blockedLoading && !blockedError && (
                  blockedIPs.length > 0 ? (
                    <ul className="blocked-list">
                      {blockedIPs.map((item) => (
                        <li key={item.ip} className="blocked-item">
                          <div className="blocked-info">
                            <span className="blocked-ip">{item.ip}</span>
                            <span className="blocked-at">{new Date(item.blockedAt).toLocaleString()}</span>
                          </div>
                          <button className="unblock-btn" onClick={() => handleUnblockIP(item.ip)}>Unblock</button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No blocked IPs.</p>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </motion.main>
    </div>
  );
};

export default Monitoring;
