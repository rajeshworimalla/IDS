import { Request, Response } from 'express';
import { BlockedIP } from '../models/BlockedIP';
import { isIP } from 'net';
import { firewall } from '../services/firewall';
import dns from 'dns/promises';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        id: string;
        role: string;
      };
    }
  }
}

export const getBlockedIPs = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });

    const items = await BlockedIP.find({ user: req.user._id }).sort({ blockedAt: -1 });
    const result = items.map(item => ({ ip: item.ip, reason: item.reason, blockedAt: item.blockedAt }));

    // Merge in active temporary bans from Redis (if available)
    try {
      const { listActiveTempBans } = await import('../services/policy');
      const tempBans = await listActiveTempBans();
      const merged = [
        ...tempBans.map(tb => ({ ip: tb.ip, reason: tb.reason || 'temporary ban', blockedAt: new Date(tb.blockedAt), method: tb.methods?.join('+') || 'temp' })),
        ...result
      ];
      return res.json(merged);
    } catch {
      // Fallback if policy service not available
      return res.json(result);
    }
  } catch (e) {
    console.error('getBlockedIPs error:', e);
    return res.status(500).json({ error: 'Failed to fetch blocked IPs' });
  }
};

export const blockIP = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    const { ip, reason } = req.body as { ip?: string; reason?: string };
    if (!ip) return res.status(400).json({ error: 'ip is required' });

    // If it's a literal IP, block directly
    if (isIP(ip) !== 0) {
      const setOnInsert: any = { blockedAt: new Date() };
      const set: any = {};
      if (typeof reason !== 'undefined') set.reason = reason;
      const doc = await BlockedIP.findOneAndUpdate(
        { user: req.user._id, ip },
        { $setOnInsert: setOnInsert, ...(Object.keys(set).length ? { $set: set } : {}) },
        { new: true, upsert: true }
      );

      const result = await firewall.blockIP(ip);
      if ('applied' in result && result.applied) {
        try {
          const { notifyEvent } = await import('../services/aggregator');
          await notifyEvent('manual_ban', { ip, reason: reason || 'manual', user: req.user._id, method: (result as any).method });
        } catch {}
        return res.status(201).json({ ip: doc.ip, reason: doc.reason, blockedAt: doc.blockedAt, applied: true, method: result.method });
      }
      return res.status(201).json({ ip: doc.ip, reason: doc.reason, blockedAt: doc.blockedAt, applied: false, error: (result as any).error });
    }

    // Otherwise, treat input as a hostname/domain and resolve to IPs
    const raw = String(ip).trim();
    // Strip scheme and path if user pasted a URL
    let host = raw
      .replace(/^https?:\/\//i, '')
      .replace(/\/[#?].*$/, '')
      .replace(/\/$/, '');
    // Remove common prefixes like www.
    host = host.replace(/^www\./i, '');

    if (!host || /\s/.test(host) || host.includes('..')) {
      return res.status(400).json({ error: 'Invalid host' });
    }

    // Resolve both A and AAAA records - get ALL IPs for the domain
    let allIPs: string[] = [];
    try {
      // Use resolve4 and resolve6 to get ALL IPs (not just one)
      const [ipv4Addrs, ipv6Addrs] = await Promise.allSettled([
        dns.resolve4(host),
        dns.resolve6(host)
      ]);
      
      if (ipv4Addrs.status === 'fulfilled') {
        allIPs.push(...ipv4Addrs.value);
      }
      if (ipv6Addrs.status === 'fulfilled') {
        allIPs.push(...ipv6Addrs.value);
      }
      
      // Fallback to lookup if resolve fails (for some edge cases)
      if (allIPs.length === 0) {
        const looked = await dns.lookup(host, { all: true });
        allIPs = looked
          .filter(a => a && a.address)
          .map(a => a.address);
      }
    } catch (e: any) {
      return res.status(400).json({ error: `Could not resolve domain: ${host} - ${e?.message || String(e)}` });
    }

    const uniq = Array.from(new Set(allIPs));
    if (uniq.length === 0) {
      return res.status(400).json({ error: `No A/AAAA records found for ${host}` });
    }
    
    console.log(`Resolved ${host} to ${uniq.length} IP address(es): ${uniq.join(', ')}`);

    const reasonText = reason && reason.trim().length > 0 ? reason : `domain: ${host}`;

    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;
    
    // Block ALL IPs for the domain
    for (const addr of uniq) {
      try {
        const doc = await BlockedIP.findOneAndUpdate(
          { user: req.user._id, ip: addr },
          { $setOnInsert: { blockedAt: new Date() }, $set: { reason: reasonText } },
          { new: true, upsert: true }
        );
        const applied = await firewall.blockIP(addr);
        if ((applied as any).applied !== false) {
          successCount++;
          results.push({ ip: doc.ip, reason: doc.reason, blockedAt: doc.blockedAt, applied: true, method: (applied as any).method });
        } else {
          failCount++;
          results.push({ ip: addr, reason: reasonText, applied: false, error: (applied as any).error });
        }
        try {
          const { notifyEvent } = await import('../services/aggregator');
          await notifyEvent('manual_ban', { ip: addr, reason: reasonText, user: req.user._id, method: (applied as any).method, domain: host });
        } catch {}
      } catch (err: any) {
        failCount++;
        console.error(`Failed to block IP ${addr}:`, err);
        results.push({ ip: addr, reason: reasonText, applied: false, error: err?.message || String(err) });
      }
    }

    return res.status(201).json({ 
      message: `Blocked ${successCount} of ${uniq.length} IP address(es) for ${host}${failCount > 0 ? ` (${failCount} failed)` : ''}`, 
      total: uniq.length,
      successful: successCount,
      failed: failCount,
      items: results 
    });
  } catch (e: any) {
    console.error('blockIP error:', e);
    if (e?.code === 11000) {
      return res.status(200).json({ message: 'Already blocked' });
    }
    const errorMsg = e?.message || String(e) || 'Failed to block IP or domain';
    console.error('blockIP detailed error:', errorMsg);
    return res.status(500).json({ error: errorMsg });
  }
};

export const unblockIP = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    const { ip } = req.params;
    if (!ip) return res.status(400).json({ error: 'ip param is required' });

    await BlockedIP.deleteOne({ user: req.user._id, ip });
    const result = await firewall.unblockIP(ip);
    return res.json({ message: 'Unblocked', removed: (result as any).removed !== false });
  } catch (e) {
    console.error('unblockIP error:', e);
    return res.status(500).json({ error: 'Failed to unblock IP' });
  }
};