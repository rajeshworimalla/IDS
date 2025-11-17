import { FC, useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import DateRangePicker from '../components/DateRangePicker';
import { packetService, ThreatAlert } from '../services/packetService';
import { ipBlockService, BlockedIP, BlockResponse } from '../services/ipBlockService';
import { formatDate } from '../utils/dateUtils';
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
    dateRange: undefined // No date range by default - show all alerts
  });
  const [showBlockedIPs, setShowBlockedIPs] = useState(false);
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [blockSuccess, setBlockSuccess] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;


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
        // By default, show all severities (critical, medium, low) to see all alerts
        severity: (currentFilters.severity && currentFilters.severity.length > 0)
          ? currentFilters.severity
          : ['critical', 'high', 'medium', 'low'], // Include all severities by default
        status: currentFilters.status
      };
      
      // Add date range if specified (no date range by default = show all)
      if (currentFilters.dateRange?.from && currentFilters.dateRange?.to) {
        apiFilters.from = currentFilters.dateRange.from;
        apiFilters.to = currentFilters.dateRange.to;
      }
      
      // Get alerts and stats with filters
      const [alertsData, statsData] = await Promise.all([
        packetService.getAlerts(apiFilters),
        packetService.getAlertStats(apiFilters)
      ]);

      // Show all alerts
      const allAlerts = Array.isArray(alertsData) ? alertsData : [];
      setAlerts(allAlerts);
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
    // Load initial blocked list to mark items as blocked
    loadBlockedIPs();
  }, []);
  
  // Re-fetch data when filters change
  useEffect(() => {
    fetchData();
    setCurrentPage(1); // Reset to first page when filters change
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
      await fetchData();
    } catch (err) {
      console.error('Error updating alert status:', err);
      setError('Failed to update alert status. Please try again.');
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
      await loadBlockedIPs();
    } catch (e: any) {
      console.error('Error blocking IP:', e);
      setError(e?.message || 'Failed to block IP.');
    }
  };

  const loadBlockedIPs = async () => {
    try {
      setBlockedLoading(true);
      setBlockedError(null);
      const list = await ipBlockService.getBlockedIPs();
      setBlockedIPs(list);
    } catch (e) {
      console.error('Error fetching blocked IPs:', e);
      setBlockedError('Failed to fetch blocked IPs.');
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
      await loadBlockedIPs();
    } catch (e) {
      console.error('Error unblocking IP:', e);
      setBlockedError('Failed to unblock IP.');
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

  // Pagination for alerts
  const totalPages = Math.ceil(filteredAlerts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAlerts = filteredAlerts.slice(startIndex, endIndex);

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
            <h1>Monitoring</h1>
            <div className="header-actions">
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
            <div className="stat-card critical">
              <h3>Critical</h3>
              <span className="stat-value">{alertStats.critical}</span>
            </div>
            <div className="stat-card high">
              <h3>High</h3>
              <span className="stat-value">{alertStats.high}</span>
            </div>
            <div className="stat-card medium">
              <h3>Medium</h3>
              <span className="stat-value">{alertStats.medium}</span>
            </div>
            <div className="stat-card low">
              <h3>Low</h3>
              <span className="stat-value">{alertStats.low}</span>
            </div>
          </div>
        </div>

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
          </div>
        </div>

        <div className="alerts-list">
            {filteredAlerts.length > 0 ? (
              paginatedAlerts.map((alert) => (
                <div
                  key={alert._id}
                  className={`alert-card ${alert.severity} ${expandedAlertId === alert._id ? 'expanded' : ''}`}
                >
                  <div className="alert-header" onClick={() => handleToggleExpand(alert._id)}>
                    <div className="alert-icon-container">
                      <span className="alert-icon">{getSeverityIcon(alert.severity)}</span>
                    </div>
                    <div className="alert-basic-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0 }}>{alert.type}</h3>
                        {/* ML Binary Prediction Badge - Most Important */}
                        {/* Only show BENIGN if severity is low AND ML says benign */}
                        {/* If severity is critical/medium, it's an attack regardless of ML */}
                        {alert.is_malicious !== undefined && (
                          <span 
                            style={{
                              padding: '0.35rem 0.9rem',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              backgroundColor: (alert.is_malicious || alert.severity === 'critical' || alert.severity === 'medium') 
                                ? '#ff4d4f' : '#52c41a',
                              color: '#fff',
                              boxShadow: (alert.is_malicious || alert.severity === 'critical' || alert.severity === 'medium')
                                ? '0 0 8px rgba(255, 77, 79, 0.5)' : '0 0 8px rgba(82, 196, 26, 0.3)',
                              border: (alert.is_malicious || alert.severity === 'critical' || alert.severity === 'medium')
                                ? '1px solid #ff7875' : '1px solid #73d13d'
                            }}
                          >
                            {(alert.is_malicious || alert.severity === 'critical' || alert.severity === 'medium')
                              ? '🚨 ATTACK DETECTED' : '✓ BENIGN'}
                          </span>
                        )}
                        <span 
                          className="severity-badge"
                          style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            backgroundColor: alert.severity === 'critical' ? '#ff4d4f' : 
                                           alert.severity === 'high' ? '#fa8c16' :
                                           alert.severity === 'medium' ? '#faad14' : '#52c41a',
                            color: '#fff'
                          }}
                        >
                          {alert.severity}
                        </span>
                      </div>
                      <div className="alert-meta">
                        <span className="timestamp">
                          {formatDate(alert.timestamp)}
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
                      <div 
                        className="alert-details"
                      >
                        <div className="detail-group">
                          {/* ML Binary Prediction - Most Important */}
                          {alert.is_malicious !== undefined && (
                            <div className="detail-item full-width" style={{ 
                              marginBottom: '1rem', 
                              padding: '1rem',
                              background: (alert.is_malicious || alert.severity === 'critical' || alert.severity === 'medium')
                                ? 'rgba(255, 77, 79, 0.1)' 
                                : 'rgba(82, 196, 26, 0.1)',
                              border: `2px solid ${(alert.is_malicious || alert.severity === 'critical' || alert.severity === 'medium') ? '#ff4d4f' : '#52c41a'}`,
                              borderRadius: '8px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <span className="detail-label" style={{ fontSize: '1rem', fontWeight: '600' }}>
                                  Detection Result:
                                </span>
                                <span style={{
                                  padding: '0.4rem 1rem',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem',
                                  fontWeight: '700',
                                  textTransform: 'uppercase',
                                  backgroundColor: (alert.is_malicious || alert.severity === 'critical' || alert.severity === 'medium') ? '#ff4d4f' : '#52c41a',
                                  color: '#fff'
                                }}>
                                  {(alert.is_malicious || alert.severity === 'critical' || alert.severity === 'medium')
                                    ? '🚨 ATTACK DETECTED' : '✓ BENIGN TRAFFIC'}
                                </span>
                                {alert.has_conflict && (
                                  <span style={{
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    backgroundColor: '#faad14',
                                    color: '#000',
                                    fontWeight: '600'
                                  }}>
                                    ⚠️ ML/Rule Conflict
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #999)' }}>
                                Confidence: {alert.confidence ? `${Math.round(alert.confidence * 100)}%` : 'N/A'} 
                                {alert.confidence && (
                                  <span style={{ marginLeft: '0.5rem', fontStyle: 'italic' }}>
                                    ({alert.confidence >= 0.8 ? 'Very High' : alert.confidence >= 0.6 ? 'High' : alert.confidence >= 0.4 ? 'Medium' : 'Low'} confidence)
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="detail-item">
                            <span className="detail-label">Source</span>
                            <span className="detail-value">{alert.source}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Destination</span>
                            <span className="detail-value">{alert.destination}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Attack Type (Multiclass)</span>
                            <span className="detail-value">
                              {(() => {
                                const attackType = alert.attack_type || 'Unknown';
                                // Map to display-friendly names
                                const typeMap: { [key: string]: string } = {
                                  'dos': 'DoS Attack',
                                  'probe': 'Port Scan / Reconnaissance',
                                  'r2l': 'Remote to Local Attack',
                                  'u2r': 'User to Root Attack',
                                  'brute_force': 'Brute Force Attack',
                                  'unknown_attack': 'Unknown Attack Type',
                                  'normal': 'Normal Traffic'
                                };
                                return typeMap[attackType.toLowerCase()] || attackType.charAt(0).toUpperCase() + attackType.slice(1).replace(/_/g, ' ');
                              })()}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Multiclass Confidence</span>
                            <span className="detail-value">{alert.confidence ? `${Math.round(alert.confidence * 100)}%` : 'N/A'}</span>
                          </div>
                        </div>
                        {/* Attack Type Probabilities */}
                        {alert.attack_type_probabilities && (
                          <div className="detail-group" style={{ marginTop: '1rem' }}>
                            <div className="detail-item full-width">
                              <span className="detail-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                                ML Model Predictions (All Attack Types):
                              </span>
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                                gap: '0.5rem',
                                marginTop: '0.5rem'
                              }}>
                                {Object.entries(alert.attack_type_probabilities)
                                  .sort(([, a], [, b]) => (b as number) - (a as number))
                                  .map(([type, prob]) => {
                                    const probability = typeof prob === 'number' ? prob : 0;
                                    const percentage = Math.round(probability * 100);
                                    const isTopPrediction = type === alert.attack_type;
                                    return (
                                      <div 
                                        key={type}
                                        style={{
                                          padding: '0.5rem',
                                          background: isTopPrediction 
                                            ? 'rgba(54, 153, 255, 0.2)' 
                                            : 'rgba(255, 255, 255, 0.05)',
                                          border: isTopPrediction 
                                            ? '1px solid rgba(54, 153, 255, 0.5)' 
                                            : '1px solid rgba(255, 255, 255, 0.1)',
                                          borderRadius: '4px',
                                          textAlign: 'center'
                                        }}
                                      >
                                        <div style={{ 
                                          fontSize: '0.75rem', 
                                          color: 'var(--text-secondary, #999)',
                                          textTransform: 'uppercase',
                                          marginBottom: '0.25rem'
                                        }}>
                                          {type === 'dos' ? 'DoS' : type === 'r2l' ? 'R2L' : type === 'u2r' ? 'U2R' : type}
                                        </div>
                                        <div style={{ 
                                          fontSize: '1.1rem', 
                                          fontWeight: 'bold',
                                          color: isTopPrediction 
                                            ? 'var(--accent-color, #3699ff)' 
                                            : 'var(--text-primary, #fff)'
                                        }}>
                                          {percentage}%
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>
                        )}
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
              <div 
                className="no-results"
              >
                <p>No alerts match your current filters</p>
                <button 
                  className="reset-btn"
                  onClick={() => {
                    setFilters({ 
                      severity: [], 
                      status: [], 
                      dateRange: undefined
                    });
                    setSearchTerm('');
                  }}
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
          
          {/* Pagination */}
          {filteredAlerts.length > itemsPerPage && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginTop: '1.5rem',
              padding: '1rem',
              background: 'var(--secondary-bg, #1a1a1a)',
              borderRadius: '8px'
            }}>
              <div style={{ color: 'var(--text-secondary, #999)', fontSize: '0.9rem' }}>
                Showing {startIndex + 1}-{Math.min(endIndex, filteredAlerts.length)} of {filteredAlerts.length} alerts
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: currentPage === 1 ? 'rgba(255,255,255,0.1)' : 'var(--accent-color, #3699ff)',
                    color: '#fff',
                    borderRadius: '4px',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 1 ? 0.5 : 1
                  }}
                >
                  Previous
                </button>
                <span style={{ color: 'var(--text-primary, #fff)', padding: '0 1rem' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: currentPage === totalPages ? 'rgba(255,255,255,0.1)' : 'var(--accent-color, #3699ff)',
                    color: '#fff',
                    borderRadius: '4px',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages ? 0.5 : 1
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
                            <span className="blocked-at">{formatDate(item.blockedAt)}</span>
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
