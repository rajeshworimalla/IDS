import { FC, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { ipBlockService, BlockedIP, BlockPolicy } from '../services/ipBlockService';
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

  // Websites Control Panel state
  const [subnet, setSubnet] = useState('');
  const [sites, setSites] = useState<{ host: string; ports: number[] }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [progress, setProgress] = useState<{done:number; total:number}>({ done: 0, total: 0 });

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
  }, []);

  // Prefill subnet guess once
  useEffect(() => {
    setSubnet(guessSubnet());
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
      await ipBlockService.blockIP(newIP, newReason || undefined);
      setNewIP('');
      setNewReason('');
      await fetchBlocked();
      setActiveTab('blocked');
    } catch (e: any) {
      setError(e?.message || 'Failed to block IP');
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
    if (m) return `${m[1]}.${m[2]}.${m[3]}.0/24`;
    return '192.168.1.0/24';
  }
  function expandSubnet(pattern: string): string[] {
    pattern = pattern.trim();
    if (!pattern) return [];
    const cidr24 = pattern.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.0\/24$/);
    const star   = pattern.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\*$/);
    const three  = pattern.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    const single = pattern.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    let base: string | undefined;
    if (cidr24) base = `${cidr24[1]}.${cidr24[2]}.${cidr24[3]}`;
    else if (star) base = `${star[1]}.${star[2]}.${star[3]}`;
    else if (three) base = `${three[1]}.${three[2]}.${three[3]}`;
    if (base) {
      const hosts: string[] = [];
      for (let i = 1; i <= 254; i++) hosts.push(`${base}.${i}`);
      return hosts;
    }
    if (single) return [pattern];
    return [];
  }
  function guessScheme(port: number): 'http'|'https' { return port === 443 ? 'https' : 'http'; }
  async function isReachable(url: string, timeoutMs = 1500): Promise<boolean> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
      return true;
    } catch {
      return false;
    } finally { clearTimeout(t); }
  }
  function limit(concurrency: number) {
    const queue: { fn: () => Promise<any>; resolve: (v:any)=>void; reject: (e:any)=>void }[] = [];
    let active = 0;
    const next = () => {
      if (active >= concurrency || queue.length === 0) return;
      active++;
      const { fn, resolve, reject } = queue.shift()!;
      fn().then(resolve, reject).finally(() => { active--; next(); });
    };
    return (fn: () => Promise<any>) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
  }
  async function handleScan() {
    const hosts = expandSubnet(subnet || guessSubnet());
    if (hosts.length === 0) { setScanStatus('Enter a /24 like 192.168.1.0/24 or 192.168.1.*'); return; }
    
    setSites([]);
    setScanning(true);
    
    // Always use backend API for full port scan (1-65535)
    setScanStatus(`Scanning all ports (1-65535) on ${hosts.length} host(s)... This may take a few minutes.`);
    setProgress({ done: 0, total: hosts.length });
    
    const results: { host: string; ports: number[] }[] = [];
    
    for (let i = 0; i < hosts.length; i++) {
      const host = hosts[i];
      setScanStatus(`Scanning all ports on ${host}... (${i + 1}/${hosts.length})`);
      setProgress({ done: i, total: hosts.length });
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:5001/api/ips/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            host,
            ports: 'all',
            timeout: 500,
            concurrency: 200
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to scan ${host}:`, errorText);
          setScanStatus(`Error scanning ${host}: ${errorText}`);
          continue;
        }
        
        const data = await response.json();
        if (data.openPorts && data.openPorts.length > 0) {
          results.push({ host, ports: data.openPorts });
        }
      } catch (e: any) {
        console.error(`Error scanning ${host}:`, e);
        setScanStatus(`Error: ${e?.message || 'Failed to scan'}`);
      }
    }
    
    setProgress({ done: hosts.length, total: hosts.length });
    if (results.length === 0) {
      setScanStatus('No open ports found on scanned hosts.');
    } else {
      setScanStatus(`Found ${results.length} host(s) with open ports.`);
    }
    setSites(results);
    setScanning(false);
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
                  <label>Subnet (CIDR or pattern)</label>
                  <input type="text" value={subnet} onChange={(e)=>setSubnet(e.target.value)} placeholder="e.g. 192.168.1.0/24 or 192.168.1.*" />
                </div>
                <div className="field" style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-secondary, #1a1a1a)', borderRadius: '8px', border: '1px solid var(--border, #333)' }}>
                  <p style={{ margin: '0 0 8px 0', color: 'var(--text-secondary, #999)', fontSize: '0.9rem' }}>
                    Full Port Scan (1-65535)
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-tertiary, #666)' }}>
                    Scans all ports on each host using the backend API. This may take several minutes per host.
                  </p>
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
                        <td className="site-ports">{site.ports.join(', ')}</td>
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
