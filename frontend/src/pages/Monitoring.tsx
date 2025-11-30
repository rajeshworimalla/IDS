import { FC, useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  sourceIP: string;
  destinationIP: string;
}

const Monitoring: FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [alertStats, setAlertStats] = useState({
    critical: 0,
    medium: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    severity: [],
    status: [],
    dateRange: {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      to: new Date() // now
    },
    sourceIP: '',
    destinationIP: ''
  });
  const [packetStats, setPacketStats] = useState({
    totalPackets: 0,
    criticalCount: 0,
    mediumCount: 0,
    normalCount: 0
  });
  const [systemHealth, setSystemHealth] = useState(100);
  const [showBlockedIPs, setShowBlockedIPs] = useState(false);
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [blockSuccess, setBlockSuccess] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false); // Pause auto-refresh when examining alerts
  const isPausedRef = useRef(false); // Ref to track pause state for socket callbacks
  const socketRef = useRef<Socket | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);
  const packetRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  const filterOptions = {
    severity: [
      { value: 'critical', label: 'Critical', color: '#ff4d4f' },
      { value: 'medium', label: 'Medium', color: '#faad14' }
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
        // Only fetch critical and medium alerts by default
        severity: (currentFilters.severity && currentFilters.severity.length > 0)
          ? currentFilters.severity
          : ['critical', 'medium'],
        status: currentFilters.status
      };
      
      // Add date range if specified
      if (currentFilters.dateRange?.from && currentFilters.dateRange?.to) {
        apiFilters.from = currentFilters.dateRange.from;
        apiFilters.to = currentFilters.dateRange.to;
      }
      
      // Add source IP filter
      if (currentFilters.sourceIP && currentFilters.sourceIP.trim()) {
        apiFilters.sourceIP = currentFilters.sourceIP.trim();
      }
      
      // Add destination IP filter
      if (currentFilters.destinationIP && currentFilters.destinationIP.trim()) {
        apiFilters.destinationIP = currentFilters.destinationIP.trim();
      }
      
      // Get alerts, stats, and packet stats with filters (with individual error handling)
      let alertsData: ThreatAlert[] = [];
      let statsData = { critical: 0, medium: 0 };
      let packetStatsData = { totalPackets: 0, criticalCount: 0, mediumCount: 0, normalCount: 0 };
      
      try {
        const results = await Promise.allSettled([
          packetService.getAlerts(apiFilters),
          packetService.getAlertStats(apiFilters),
          packetService.getPacketStats()
        ]);
        
        if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
          alertsData = results[0].value;
        }
        
        if (results[1].status === 'fulfilled' && results[1].value) {
          statsData = results[1].value;
        }
        
        if (results[2].status === 'fulfilled' && results[2].value) {
          packetStatsData = results[2].value;
        }
      } catch (err) {
        console.warn('Error fetching alerts/stats:', err);
        // Continue with empty data rather than crashing
      }

      setAlerts(alertsData);
      setAlertStats(statsData);
      setPacketStats(packetStatsData);
      
      // Calculate system health (from Activities page)
      const total = packetStatsData.totalPackets || 1;
      const normalPackets = packetStatsData.normalCount;
      const health = Math.round((normalPackets / total) * 100);
      setSystemHealth(health);
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
    // Page Visibility API - pause updates when tab is hidden
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      if (isVisibleRef.current) {
        // Tab became visible - refresh data
        fetchData().catch(() => {});
        loadBlockedIPs().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

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

        // Listen for new packets - DISABLED for performance (only update on intrusions)
        // socket.on('new-packet', () => {
        //   // Disabled to reduce lag - stats will update via polling only
        // });

        socket.on('intrusion-detected', () => {
          // Only refresh for intrusions if not paused (user examining alerts)
          // Use ref to get the latest pause state
          if (isVisibleRef.current && !isPausedRef.current) {
            fetchData().catch((err: any) => {
              console.warn('[Monitoring] Error refreshing on intrusion:', err);
            });
            loadBlockedIPs().catch((err: any) => {
              console.warn('[Monitoring] Error loading blocked IPs on intrusion:', err);
            });
          }
        });

        socketRef.current = socket;
      }
    } catch (err) {
      console.warn('[Monitoring] Error setting up socket:', err);
      // Continue without socket - polling will still work
    }

    // Set up polling interval to refresh every 180 seconds (3 minutes) - REDUCED frequency for performance
    // Sync with Dashboard polling interval for consistency
    try {
      refreshIntervalRef.current = setInterval(() => {
        // Only poll when tab is visible AND not paused (user examining alerts)
        if (isVisibleRef.current && !isPausedRef.current) {
          fetchData().catch((err: any) => {
            console.warn('[Monitoring] Polling refresh error:', err);
          });
        }
      }, 180000); // Increased to 180 seconds (3 minutes) to reduce load
    } catch (err) {
      console.warn('[Monitoring] Error setting up polling:', err);
    }

    // Cleanup
    return () => {
      try {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
        if (packetRefreshTimeoutRef.current) {
          clearTimeout(packetRefreshTimeoutRef.current);
          packetRefreshTimeoutRef.current = null;
        }
      } catch (err) {
        console.warn('[Monitoring] Cleanup error:', err);
      }
    };
  }, []);
  
  // Re-fetch data when filters change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchData();
    }, 300); // Debounce filter changes
    
    return () => clearTimeout(timeoutId);
  }, [filters.severity, filters.status, filters.dateRange, filters.sourceIP, filters.destinationIP]);

  const handleToggleExpand = (id: string) => {
    const newExpandedId = expandedAlertId === id ? null : id;
    setExpandedAlertId(newExpandedId);
    // Auto-pause when expanding an alert, auto-resume when collapsing
    const shouldPause = newExpandedId !== null;
    setIsPaused(shouldPause);
    isPausedRef.current = shouldPause;
    // When collapsing (resuming), fetch latest data to catch up on missed alerts
    if (!shouldPause) {
      fetchData().catch((err: any) => {
        console.warn('[Monitoring] Error fetching data on alert collapse:', err);
      });
      loadBlockedIPs().catch((err: any) => {
        console.warn('[Monitoring] Error loading blocked IPs on alert collapse:', err);
      });
    }
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
    setIsPaused(true); // Pause auto-refresh when viewing blocked IPs
    isPausedRef.current = true;
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

  // PERFORMANCE: Memoize filtered alerts to prevent re-computation on every render
  // Also limit to top 200 alerts to prevent rendering too many items
  const filteredAlerts = useMemo(() => {
    if (!alerts || alerts.length === 0) return [];
    
    let filtered = alerts;
    
    // Apply search filter (optimized - only check string fields)
    if (searchTerm && searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(alert => {
        // Only check relevant string fields instead of all values
        return (
          (alert.source && alert.source.toLowerCase().includes(searchLower)) ||
          (alert.destination && alert.destination.toLowerCase().includes(searchLower)) ||
          (alert.type && alert.type.toLowerCase().includes(searchLower)) ||
          (alert.description && alert.description.toLowerCase().includes(searchLower)) ||
          (alert.attack_type && alert.attack_type.toLowerCase().includes(searchLower))
        );
      });
    }
    
    // Limit to top 200 most recent alerts to prevent rendering lag
    return filtered.slice(0, 200);
  }, [alerts, searchTerm]);

  // PERFORMANCE: Memoize helper functions to prevent recreation on every render
  const getAttackTypeLabel = useCallback((type: string) => {
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
  }, []);

  const getSeverityIcon = useCallback((severity: string) => {
    switch (severity) {
      case 'critical': return '🔴';
      case 'medium': return '🟡';
      default: return '⚪';
    }
  }, []);

  const getStatusBadge = useCallback((status: string) => {
    switch (status) {
      case 'active': return <span className="status-badge active">Active</span>;
      case 'investigating': return <span className="status-badge investigating">Investigating</span>;
      case 'mitigated': return <span className="status-badge mitigated">Mitigated</span>;
      case 'resolved': return <span className="status-badge resolved">Resolved</span>;
      default: return null;
    }
  }, []);

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
      <main className="monitoring-content">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        {blockSuccess && (
          <div className="success-message">
            {blockSuccess}
          </div>
        )}

        <div className="monitoring-header">
          <div className="header-row">
            <h1>Monitoring & Activities</h1>
            <div className="header-actions">
              <button
                className={`pause-button ${isPaused ? 'paused' : ''}`}
                onClick={() => {
                  const newPaused = !isPaused;
                  setIsPaused(newPaused);
                  isPausedRef.current = newPaused;
                  // When resuming, immediately fetch latest data to catch up on missed alerts
                  if (!newPaused) {
                    fetchData().catch((err: any) => {
                      console.warn('[Monitoring] Error fetching data on resume:', err);
                    });
                    loadBlockedIPs().catch((err: any) => {
                      console.warn('[Monitoring] Error loading blocked IPs on resume:', err);
                    });
                  }
                }}
                title={isPaused ? 'Resume auto-refresh and fetch latest data' : 'Pause auto-refresh'}
              >
                {isPaused ? '▶️ Resume' : '⏸️ Pause'}
              </button>
              <button
                className="view-blocked-button"
                onClick={handleOpenBlockedIPs}
              >
                🚫 View blocked IPs
              </button>
              <button
                className="refresh-button"
                onClick={() => fetchData()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="loading-spinner" />
                ) : (
                  <span>🔄 Refresh</span>
                )}
              </button>
            </div>
          </div>
          <div className="monitoring-stats">
            <div className="stat-card total">
              <h3>Total Events</h3>
              <span className="stat-value">{packetStats.totalPackets}</span>
            </div>
            <div className="stat-card critical">
              <h3>Critical</h3>
              <span className="stat-value">{alertStats.critical}</span>
            </div>
            <div className="stat-card medium">
              <h3>Medium</h3>
              <span className="stat-value">{alertStats.medium}</span>
            </div>
            <div className="stat-card health">
              <h3>System Health</h3>
              <span className="stat-value">{systemHealth}%</span>
            </div>
          </div>
        </div>

        <div className="controls-container">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search alerts..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                // Debounce search - no need to fetch, just filter client-side
                // Filtering is already memoized, so this is instant
              }}
              className="search-input"
            />
            {filteredAlerts.length > 0 && (
              <span className="results-count" style={{ marginLeft: '10px', color: '#888', fontSize: '14px' }}>
                Showing {filteredAlerts.length} of {alerts.length} alerts
              </span>
            )}
          </div>
          
          <div className="filters-container">
            <div className="filter-group">
              <h4>Severity</h4>
              <div className="filter-options">
                {filterOptions.severity.map(option => (
                  <button
                    key={`severity-${option.value}`}
                    className={`filter-chip ${filters.severity.includes(option.value) ? 'active' : ''}`}
                    style={{ 
                      '--chip-color': option.color,
                      '--chip-bg': `${option.color}22`
                    } as React.CSSProperties}
                    onClick={() => handleFilterToggle('severity', option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="filter-group">
              <h4>Status</h4>
              <div className="filter-options">
                {filterOptions.status.map(option => (
                  <button
                    key={`status-${option.value}`}
                    className={`filter-chip ${filters.status.includes(option.value) ? 'active' : ''}`}
                    onClick={() => handleFilterToggle('status', option.value)}
                  >
                    {option.label}
                  </button>
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
            
            <div className="filter-group">
              <h4>Source IP</h4>
              <div className="filter-options">
                <input
                  type="text"
                  placeholder="Filter by source IP..."
                  value={filters.sourceIP}
                  onChange={(e) => {
                    setFilters(prev => ({ ...prev, sourceIP: e.target.value }));
                    // Debounce filter changes
                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                    searchTimeoutRef.current = setTimeout(() => {
                      fetchData();
                    }, 500);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                      fetchData();
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    fontSize: '14px',
                    width: '200px'
                  }}
                />
              </div>
            </div>
            
            <div className="filter-group">
              <h4>Destination IP</h4>
              <div className="filter-options">
                <input
                  type="text"
                  placeholder="Filter by destination IP..."
                  value={filters.destinationIP}
                  onChange={(e) => {
                    setFilters(prev => ({ ...prev, destinationIP: e.target.value }));
                    // Debounce filter changes
                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                    searchTimeoutRef.current = setTimeout(() => {
                      fetchData();
                    }, 500);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                      fetchData();
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    fontSize: '14px',
                    width: '200px'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="alerts-list">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => (
              <div
                key={alert._id}
                className={`alert-card ${alert.severity} ${expandedAlertId === alert._id ? 'expanded' : ''}`}
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
                      <button
                        className="expand-btn"
                        style={{ transform: expandedAlertId === alert._id ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                  
                  {expandedAlertId === alert._id && (
                    <div className="alert-details">
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
                              color: (alert.attack_type && alert.attack_type !== 'normal' && alert.attack_type !== 'unknown') || alert.severity === 'critical' || alert.severity === 'high' ? '#ff4d4f' : '#52c41a' 
                            }}>
                              {getAttackTypeLabel(
                                alert.attack_type && alert.attack_type !== 'normal' 
                                  ? alert.attack_type 
                                  : (alert.severity === 'critical' || alert.severity === 'high' 
                                      ? 'critical_traffic' 
                                      : 'normal')
                              )}
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
                            <button 
                              className="action-btn investigate"
                              onClick={() => handleUpdateStatus(alert._id, 'investigating')}
                            >
                              Investigate
                            </button>
                          )}
                          {alert.status !== 'mitigated' && (
                            <button 
                              className="action-btn mitigate"
                              onClick={() => handleUpdateStatus(alert._id, 'mitigated')}
                            >
                              Mitigate
                            </button>
                          )}
                          {alert.status !== 'resolved' && (
                            <button 
                              className="action-btn resolve"
                              onClick={() => handleUpdateStatus(alert._id, 'resolved')}
                            >
                              Resolve
                            </button>
                          )}
                          {isBlocked(alert.source) ? (
                            <div className="blocked-indicator">
                              🚫 Blocked
                              <button className="inline-unblock" onClick={(e) => { e.stopPropagation(); handleUnblockIP(alert.source); }}>Unblock</button>
                            </div>
                          ) : (
                            <button 
                              className="action-btn block"
                              onClick={(e) => { e.stopPropagation(); handleBlockIP(alert.source); }}
                            >
                              Block IP
                            </button>
                          )}
                        </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="no-results">
                <p>No alerts match your current filters</p>
                <button 
                  className="reset-btn"
                  onClick={() => {
                    setFilters({ 
                      severity: [],
                      status: [],
                      dateRange: {
                        from: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        to: new Date()
                      },
                      sourceIP: '',
                      destinationIP: ''
                    });
                    setSearchTerm('');
                    fetchData();
                  }}
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        {/* Blocked IPs Modal */}
        {showBlockedIPs && (
          <div className="modal-backdrop" onClick={() => {
            setShowBlockedIPs(false);
            setIsPaused(false); // Resume auto-refresh when closing modal
            isPausedRef.current = false;
            // Fetch latest data when closing modal to catch up on missed alerts
            fetchData().catch((err: any) => {
              console.warn('[Monitoring] Error fetching data on modal close:', err);
            });
            loadBlockedIPs().catch((err: any) => {
              console.warn('[Monitoring] Error loading blocked IPs on modal close:', err);
            });
          }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Blocked IPs</h3>
                <button className="modal-close" onClick={() => {
                  setShowBlockedIPs(false);
                  setIsPaused(false); // Resume auto-refresh when closing modal
                  isPausedRef.current = false;
                  // Fetch latest data when closing modal to catch up on missed alerts
                  fetchData().catch((err: any) => {
                    console.warn('[Monitoring] Error fetching data on modal close:', err);
                  });
                  loadBlockedIPs().catch((err: any) => {
                    console.warn('[Monitoring] Error loading blocked IPs on modal close:', err);
                  });
                }}>✕</button>
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
      </main>
    </div>
  );
};

export default Monitoring;
