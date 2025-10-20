import { FC, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { ipBlockService, BlockedIP, BlockPolicy } from '../services/ipBlockService';
import '../styles/Blocker.css';

const Blocker: FC = () => {
  const [activeTab, setActiveTab] = useState<'overview'|'blocked'|'policies'>('overview');
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

  return (
    <div className="blocker-page">
      <Navbar />
      <motion.main className="blocker-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="blocker-header">
          <h1>Network Blocker</h1>
          <p>Automatically and manually block suspicious sources</p>
        </div>

        {(error || policyError) && (
          <div className="error-banner">
            {error || policyError}
          </div>
        )}

        <div className="tabs">
          <button className={`tab ${activeTab==='overview'?'active':''}`} onClick={()=>setActiveTab('overview')}>Overview</button>
          <button className={`tab ${activeTab==='blocked'?'active':''}`} onClick={()=>setActiveTab('blocked')}>Blocked IPs</button>
          <button className={`tab ${activeTab==='policies'?'active':''}`} onClick={()=>setActiveTab('policies')}>Policies</button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.section key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-title">Total Blocked</div>
                  <div className="stat-value">{totalBlocked}</div>
                </div>
                <div className="stat-card">
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
                </div>
                <div className="stat-card">
                  <div className="stat-title">Current Policy</div>
                  <div className="policy-summary">
                    <div><strong>Window:</strong> {policy.windowSeconds}s</div>
                    <div><strong>Threshold:</strong> {policy.threshold} events</div>
                    <div><strong>Ban:</strong> {policy.banMinutes} min</div>
                    <div><strong>Firewall:</strong> {policy.useFirewall ? 'On' : 'Off'}</div>
                    <div><strong>Nginx deny:</strong> {policy.useNginxDeny ? 'On' : 'Off'}</div>
                  </div>
                </div>
              </div>
              <div className="actions-row">
                <button className="btn" onClick={fetchBlocked} disabled={loading}>Refresh</button>
                <button className="btn primary" onClick={()=>setActiveTab('blocked')}>Manage Blocklist</button>
              </div>
            </motion.section>
          )}

          {activeTab === 'blocked' && (
            <motion.section key="blocked" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="block-form">
                <input
                  type="text"
                  placeholder="IP or CIDR (e.g., 1.2.3.4 or 1.2.3.0/24)"
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
                    {blocked.map(item => (
                      <tr key={`${item.ip}-${item.blockedAt}`}>
                        <td>{item.ip}</td>
                        <td>{item.reason || '-'}</td>
                        <td>{item.method || '-'}</td>
                        <td>{new Date(item.blockedAt).toLocaleString()}</td>
                        <td>
                          <button className="btn danger" onClick={()=>handleUnblock(item.ip)}>Unblock</button>
                        </td>
                      </tr>
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
            <motion.section key="policies" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
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
        </AnimatePresence>
      </motion.main>
    </div>
  );
};

export default Blocker;