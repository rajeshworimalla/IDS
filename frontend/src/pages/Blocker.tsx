import { FC, useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import Navbar from '../components/Navbar';
import { ipBlockService, BlockedIP, BlockPolicy } from '../services/ipBlockService';
import { authService } from '../services/auth';
import '../styles/Blocker.css';

const Blocker: FC = () => {
  const [activeTab, setActiveTab] = useState<'overview'|'blocked'|'policies'|'websites'>('overview');
  const [blocked, setBlocked] = useState<BlockedIP[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newIP, setNewIP] = useState('');
  const [newReason, setNewReason] = useState('');

  const [policy, setPolicy] = useState<BlockPolicy>({
    windowSeconds: 60,
    threshold: 100,
    banMinutes: 60,
    useFirewall: true,
    useNginxDeny: false,
  });
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySaved, setPolicySaved] = useState(false);

  // Websites Control Panel state - Expanded port list (includes backend and ML service)
  const defaultPorts = [
    20, 21, 22, 23, 25, 53, 67, 68, 80, 110, 135, 139, 143, 443, 445, 
    993, 995, 1433, 3000, 3306, 3389, 5000, 5001, 5002, 5173, 5432, 6379, 8000, 8080, 8443, 27017
  ];
  const [subnet, setSubnet] = useState('');
  const [selectedPorts, setSelectedPorts] = useState<number[]>(defaultPorts);
  const [sites, setSites] = useState<{ host: string; ports: number[] }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [progress, setProgress] = useState<{done:number; total:number}>({ done: 0, total: 0 });
  const socketRef = useRef<Socket | null>(null);

  const fetchBlocked = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await ipBlockService.getBlockedIPs();
      setBlocked(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch blocked IPs');
    } finally {
      setLoading(false);
    }
  };

  const fetchPolicy = async () => {
    try {
      setPolicyLoading(true);
      setPolicyError(null);
      const p = await ipBlockService.getPolicy();
      setPolicy(p);
    } catch (e: any) {
      // Policy endpoint may not exist yet; keep defaults
      setPolicyError('Policy endpoint unavailable. Using defaults.');
    } finally {
      setPolicyLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocked();
    fetchPolicy();
    
    // Set up socket connection for real-time updates when IPs are auto-blocked
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
          console.log('[Blocker] Socket connected');
        });

        socket.on('connect_error', (err) => {
          console.warn('[Blocker] Socket connection error:', err);
        });

        // Listen for intrusion-detected events with autoBlocked flag
        socket.on('intrusion-detected', (data: any) => {
          if (data.autoBlocked === true) {
            console.log('[Blocker] IP auto-blocked:', data.ip);
            // Refresh blocked list immediately when an IP is auto-blocked
            fetchBlocked().catch(err => {
              console.warn('[Blocker] Error refreshing after auto-block:', err);
            });
          }
        });

        // Listen for explicit ip-blocked event (if backend emits it)
        socket.on('ip-blocked', (data: { ip: string; reason: string }) => {
          console.log('[Blocker] IP blocked event received:', data.ip);
          fetchBlocked().catch(err => {
            console.warn('[Blocker] Error refreshing after block event:', err);
          });
        });

        socketRef.current = socket;
      }
    } catch (err) {
      console.warn('[Blocker] Error setting up socket:', err);
    }

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Get VM IP address and set as default
  useEffect(() => {
    const getVMIP = async () => {
      try {
        // Try to get IP from window location or API
        const hostname = window.location.hostname;
        
        // If hostname is an IP, use it directly
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
          setSubnet(hostname);
        } else {
          // Try to get from API
          const token = localStorage.getItem('token');
          const response = await fetch('http://localhost:5001/api/settings/system-info', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const info = await response.json();
            // Extract IP from backend URL or use hostname
            const ipMatch = info.backend?.url?.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (ipMatch) {
              setSubnet(ipMatch[1]);
            } else {
              // Fallback: try to get from network interfaces
              setSubnet(guessSubnet());
            }
          } else {
            setSubnet(guessSubnet());
          }
        }
      } catch (err) {
        console.warn('Error getting VM IP:', err);
        setSubnet(guessSubnet());
      }
    };
    getVMIP();
  }, []);

  const totalBlocked = blocked.length;
  const byMethod = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of blocked) {
      const m = b.method || 'unknown';
      counts[m] = (counts[m] || 0) + 1;
    }
    return counts;
  }, [blocked]);

  const handleBlock = async () => {
    if (!newIP) return;
    try {
      setError(null);
      setLoading(true);
      const result = await ipBlockService.blockIP(newIP, newReason || undefined);
      
      // Check if blocking was actually applied
      if (result.applied === false) {
        setError(result.error || 'Failed to apply firewall rules. Check backend logs.');
      } else {
        setNewIP('');
        setNewReason('');
        await fetchBlocked();
        setActiveTab('blocked');
      }
    } catch (e: any) {
      console.error('Block error:', e);
      const errorMsg = e?.response?.data?.error || e?.message || 'Network error. Check backend connection.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (ip: string) => {
    const ok = window.confirm(`Unblock ${ip}?`);
    if (!ok) return;
    try {
      await ipBlockService.unblockIP(ip);
      await fetchBlocked();
    } catch (e: any) {
      setError(e?.message || 'Failed to unblock IP');
    }
  };

  const handleSavePolicy = async () => {
    try {
      setPolicyLoading(true);
      setPolicyError(null);
      await ipBlockService.updatePolicy(policy);
      setPolicySaved(true);
      setTimeout(() => setPolicySaved(false), 2500);
    } catch (e: any) {
      setPolicyError(e?.message || 'Failed to save policy');
    } finally {
      setPolicyLoading(false);
    }
  };

  // --- Websites Control Panel helpers ---
  function guessSubnet(): string {
    const h = window.location.hostname;
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) return m[0]; // Return just the IP, not subnet
    return '192.168.100.4'; // Default to user's VM IP
  }
  
  function expandSubnet(pattern: string): string[] {
    pattern = pattern.trim();
    if (!pattern) return [];
    
    // SECURITY: Only allow scanning single IP addresses (current VM)
    // Prevent subnet scanning to avoid scanning other VMs
    const single = pattern.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (single) {
      // Validate IP address
      const parts = single.slice(1).map(Number);
      if (parts.every(p => p >= 0 && p <= 255)) {
        return [pattern]; // Only return the single IP
      }
    }
    
    // Reject subnet patterns, CIDR, wildcards, etc.
    return [];
  }
  function guessScheme(port: number): 'http'|'https' { return port === 443 ? 'https' : 'http'; }
  
  async function handleScan() {
    const hosts = expandSubnet(subnet || guessSubnet());
    if (hosts.length === 0) { 
      setScanStatus('⚠️ Enter a single IP address (e.g., 192.168.100.4). Subnet scanning is disabled for security.'); 
      return; 
    }
    
    // SECURITY: Only allow scanning current VM (single IP)
    if (hosts.length > 1) {
      setScanStatus('⚠️ Security: Only single IP scanning is allowed. Cannot scan subnets.');
      return;
    }
    
    const ports = selectedPorts;
    const total = hosts.length * ports.length;
    
    if (total > 1000) {
      setScanStatus('Too many port combinations. Limit to 1000.');
      return;
    }
    
    setSites([]);
    setScanning(true);
    setScanStatus(`Scanning ${hosts.length} hosts × ${ports.length} ports = ${total} total...`);
    setProgress({ done: 0, total });

    try {
      // Use backend port scanner for accurate results
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5001/api/ips/scan-ports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          hosts,
          ports,
          timeout: 2000,
          concurrency: 50
        })
      });

      if (!response.ok) {
        const error = await response.json();
        setScanStatus(`Error: ${error.error || 'Scan failed'}`);
        setScanning(false);
        return;
      }

      const data = await response.json();
      setProgress({ done: total, total });
      
      if (data.hosts && data.hosts.length > 0) {
        setSites(data.hosts);
        setScanStatus(`Found ${data.hosts.length} host(s) with ${data.openPorts} open port(s) in ${data.duration}ms`);
      } else {
        setScanStatus(`No open ports found. Scanned ${data.totalScanned} combinations.`);
      }
    } catch (error: any) {
      console.error('Port scan error:', error);
      setScanStatus(`Error: ${error?.message || 'Network error. Check backend connection.'}`);
    } finally {
      setScanning(false);
    }
  }

  const springy = { type: 'spring', stiffness: 120, damping: 20, mass: 0.8 } as const;

  return (
    <div className="blocker-page">
      <Navbar />
      <motion.main className="blocker-content" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springy}>
        <motion.div className="blocker-header" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springy, delay: 0.05 }}>
          <h1>Management</h1>
        </motion.div>

        {(error || policyError) && (
          <motion.div className="error-banner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springy}>
            {error || policyError}
          </motion.div>
        )}

        <motion.div className="tabs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...springy, delay: 0.05 }}>
          <button className={`tab ${activeTab==='overview'?'active':''}`} onClick={()=>setActiveTab('overview')}>Overview</button>
          <button className={`tab ${activeTab==='blocked'?'active':''}`} onClick={()=>setActiveTab('blocked')}>Blocked IPs</button>
          <button className={`tab ${activeTab==='policies'?'active':''}`} onClick={()=>setActiveTab('policies')}>Policies</button>
          <button className={`tab ${activeTab==='websites'?'active':''}`} onClick={()=>setActiveTab('websites')}>Websites Control Panel</button>
        </motion.div>

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.section key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={springy}>
              <div className="stats-grid">
                <motion.div className="stat-card" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...springy, delay: 0.05 }}>
                  <div className="stat-title">Total Blocked</div>
                  <div className="stat-value">{totalBlocked}</div>
                </motion.div>
                <motion.div className="stat-card" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...springy, delay: 0.1 }}>
                  <div className="stat-title">Enforcement</div>
                  <div className="stat-breakdown">
                    {Object.entries(byMethod).map(([m, c]) => (
                      <div key={m} className="breakdown-item">
                        <span className="label">{m}</span>
                        <span className="value">{c}</span>
                      </div>
                    ))}
                    {Object.keys(byMethod).length === 0 && <div className="empty">No data</div>}
                  </div>
                </motion.div>
                <motion.div className="stat-card" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...springy, delay: 0.15 }}>
                  <div className="stat-title">Current Policy</div>
                  <div className="policy-summary">
                    <div><strong>Window:</strong> {policy.windowSeconds}s</div>
                    <div><strong>Threshold:</strong> {policy.threshold} events</div>
                    <div><strong>Ban:</strong> {policy.banMinutes} min</div>
                    <div><strong>Firewall:</strong> {policy.useFirewall ? 'On' : 'Off'}</div>
                    <div><strong>Nginx deny:</strong> {policy.useNginxDeny ? 'On' : 'Off'}</div>
                  </div>
                </motion.div>
              </div>
              <div className="actions-row">
                <button className="btn" onClick={fetchBlocked} disabled={loading}>Refresh</button>
                <button className="btn primary" onClick={()=>setActiveTab('blocked')}>Manage Blocklist</button>
              </div>
            </motion.section>
          )}

          {activeTab === 'blocked' && (
            <motion.section key="blocked" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={springy}>
              <div className="block-form">
                <input
                  type="text"
placeholder="IP or Domain (e.g., 1.2.3.4 or facebook.com)"
                  value={newIP}
                  onChange={(e)=>setNewIP(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={newReason}
                  onChange={(e)=>setNewReason(e.target.value)}
                />
                <button className="btn primary" onClick={handleBlock} disabled={!newIP}>Block</button>
                <button className="btn" onClick={fetchBlocked} disabled={loading}>Refresh</button>
              </div>

              <div className="table-wrapper">
                <table className="blocked-table">
                  <thead>
                    <tr>
                      <th>IP</th>
                      <th>Reason</th>
                      <th>Method</th>
                      <th>Blocked At</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocked.map((item, idx) => (
                      <motion.tr key={`${item.ip}-${item.blockedAt}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...springy, delay: 0.02 * idx }}
                      >
                        <td>{item.ip}</td>
                        <td>{item.reason || '-'}</td>
                        <td>{item.method || '-'}</td>
                        <td>{new Date(item.blockedAt).toLocaleString()}</td>
                        <td>
                          <button className="btn danger" onClick={()=>handleUnblock(item.ip)}>Unblock</button>
                        </td>
                      </motion.tr>
                    ))}
                    {blocked.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty">No blocked IPs</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.section>
          )}

          {activeTab === 'policies' && (
            <motion.section key="policies" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={springy}>
              <div className="policy-grid">
                <div className="form-item">
                  <label>Time window (seconds)</label>
                  <input type="number" min={10} value={policy.windowSeconds}
                    onChange={(e)=>setPolicy(p=>({ ...p, windowSeconds: Number(e.target.value) }))}
                  />
                </div>
                <div className="form-item">
                  <label>Threshold (events per window)</label>
                  <input type="number" min={1} value={policy.threshold}
                    onChange={(e)=>setPolicy(p=>({ ...p, threshold: Number(e.target.value) }))}
                  />
                </div>
                <div className="form-item">
                  <label>Ban duration (minutes)</label>
                  <input type="number" min={1} value={policy.banMinutes}
                    onChange={(e)=>setPolicy(p=>({ ...p, banMinutes: Number(e.target.value) }))}
                  />
                </div>
                <div className="form-item inline">
                  <label>
                    <input type="checkbox" checked={!!policy.useFirewall}
                      onChange={(e)=>setPolicy(p=>({ ...p, useFirewall: e.target.checked }))}
                    />
                    Enforce via firewall (iptables/ipset)
                  </label>
                </div>
                <div className="form-item inline">
                  <label>
                    <input type="checkbox" checked={!!policy.useNginxDeny}
                      onChange={(e)=>setPolicy(p=>({ ...p, useNginxDeny: e.target.checked }))}
                    />
                    Enforce at nginx (deny list)
                  </label>
                </div>
              </div>
              <div className="actions-row">
                <button className="btn" onClick={fetchPolicy} disabled={policyLoading}>Reload</button>
                <button className="btn primary" onClick={handleSavePolicy} disabled={policyLoading}>Save Policy</button>
                {policySaved && <span className="saved-msg">Saved</span>}
              </div>
            </motion.section>
          )}

          {activeTab === 'websites' && (
            <motion.section key="websites" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={springy}>
              <div className="websites-controls">
                <div className="field">
                  <label>VM IP Address (Single IP only)</label>
                  <input 
                    type="text" 
                    value={subnet} 
                    onChange={(e)=>setSubnet(e.target.value)} 
                    placeholder="e.g. 192.168.100.4" 
                    pattern="^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"
                    title="Enter a single IP address (subnet scanning disabled for security)"
                  />
                  <small style={{ color: '#888', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Only single IP scanning is allowed. Subnet scanning is disabled for security.
                  </small>
                </div>
                <div className="ports">
                  {defaultPorts.map((p, i) => (
                    <motion.label key={p} className="port-chip" whileTap={{ scale: 0.96 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springy, delay: 0.02 * i }}>
                      <input
                        type="checkbox"
                        checked={selectedPorts.includes(p)}
                        onChange={(e)=>{
                          setSelectedPorts(prev => e.target.checked ? Array.from(new Set([...prev, p])) : prev.filter(x=>x!==p));
                        }}
                      />
                      :{p}
                    </motion.label>
                  ))}
                </div>
              </div>

              <div className="actions-row">
                <button className="btn primary" onClick={handleScan} disabled={scanning}>Scan Network</button>
                <span className="hint" style={{ color: 'var(--text-secondary)' }}>{scanStatus}</span>
              </div>

              <motion.div className="progress" aria-hidden={progress.total===0} style={{ display: progress.total>0 ? 'block' : 'none' }} initial={{ opacity: 0 }} animate={{ opacity: progress.total>0 ? 1 : 0 }} transition={springy}>
                <motion.div className="progress-bar" style={{ width: progress.total>0 ? `${Math.round((progress.done/progress.total)*100)}%` : '0%' }} layout transition={{ type: 'spring', stiffness: 200, damping: 25 }} />
              </motion.div>

              <div className="table-wrapper">
                <table className="sites-table">
                  <thead>
                    <tr>
                      <th>Host</th>
                      <th>Open Ports</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site, idx) => (
                      <motion.tr key={site.host}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...springy, delay: 0.02 * idx }}
                      >
                        <td className="site-host">{site.host}</td>
                        <td className="site-ports">
                          {site.ports.map((p, i) => {
                            const serviceNames: { [key: number]: string } = {
                              20: 'FTP Data', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP',
                              53: 'DNS', 67: 'DHCP', 68: 'DHCP', 80: 'HTTP', 110: 'POP3',
                              135: 'RPC', 139: 'NetBIOS', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB',
                              993: 'IMAPS', 995: 'POP3S', 1433: 'MSSQL', 3000: 'Node.js',
                              3306: 'MySQL', 3389: 'RDP', 5000: 'Flask', 5001: 'IDS Backend', 5002: 'ML Service',
                              5173: 'Vite', 5432: 'PostgreSQL', 6379: 'Redis', 8000: 'HTTP-Alt', 8080: 'HTTP-Proxy',
                              8443: 'HTTPS-Alt', 27017: 'MongoDB'
                            };
                            const service = serviceNames[p];
                            return (
                              <span key={p} style={{ marginRight: '8px', display: 'inline-block' }}>
                                <strong>:{p}</strong>
                                {service && <span style={{ color: '#666', fontSize: '0.9em', marginLeft: '4px' }}>({service})</span>}
                                {i < site.ports.length - 1 && ', '}
                              </span>
                            );
                          })}
                        </td>
                        <td>
                          <div className="site-actions">
                            {site.ports.map(p => {
                              const scheme = p === 443 ? 'https' : 'http';
                              const url = `${scheme}://${site.host}:${p}/`;
                              return (
                                <a key={p} href={url} target="_blank" rel="noopener noreferrer" className="btn small">Open :{p}</a>
                              );
                            })}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                    {sites.length === 0 && !scanning && (
                      <tr>
                        <td colSpan={3} className="empty">No websites detected yet. Try scanning.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </motion.main>
    </div>
  );
};

export default Blocker;
