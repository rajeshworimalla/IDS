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
    const result = items.map(item => ({ ip: item.ip, reason: item.reason, blockedAt: item.blockedAt, method: item.method }));

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
      const result = await firewall.blockIP(ip);
      const updateData: any = { $setOnInsert: setOnInsert };
      if (Object.keys(set).length) updateData.$set = set;
      if ('applied' in result && result.applied && result.method) {
        if (!updateData.$set) updateData.$set = {};
        updateData.$set.method = result.method;
      }
      
      const doc = await BlockedIP.findOneAndUpdate(
        { user: req.user._id, ip },
        updateData,
        { new: true, upsert: true }
      );

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
    
    // Check for common typos (comma instead of period)
    if (raw.includes(',') && !raw.includes('.')) {
      return res.status(400).json({ error: `Invalid domain: "${raw}". Did you mean "${raw.replace(/,/g, '.')}"? (Use period, not comma)` });
    }
    
    // Strip scheme and path if user pasted a URL
    let host = raw
      .replace(/^https?:\/\//i, '')
      .replace(/\/[#?].*$/, '')
      .replace(/\/$/, '');
    // Remove common prefixes like www.
    host = host.replace(/^www\./i, '');
    
    // Replace commas with periods (common typo)
    host = host.replace(/,/g, '.');

    if (!host || /\s/.test(host) || host.includes('..')) {
      return res.status(400).json({ error: `Invalid host: "${host}". Please use a valid domain name (e.g., facebook.com)` });
    }
    
    // Validate domain format (must have at least one period for TLD)
    if (!host.includes('.')) {
      return res.status(400).json({ error: `Invalid domain: "${host}". Domain must include a top-level domain (e.g., .com, .org)` });
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
    
    // Block ALL IPs for the domain (both IPv4 and IPv6)
    for (const addr of uniq) {
      try {
        const ipVersion = isIP(addr);
        console.log(`[BLOCK] Attempting to block ${addr} (IPv${ipVersion})`);
        
        const applied = await firewall.blockIP(addr);
        const updateData: any = {
          $setOnInsert: { blockedAt: new Date() },
          $set: { reason: reasonText }
        };
        if ((applied as any).applied !== false && (applied as any).method) {
          updateData.$set.method = (applied as any).method;
        }
        
        const doc = await BlockedIP.findOneAndUpdate(
          { user: req.user._id, ip: addr },
          updateData,
          { new: true, upsert: true }
        );
        
        if ((applied as any).applied !== false) {
          successCount++;
          console.log(`[BLOCK] ✓ Successfully blocked ${addr} via ${(applied as any).method}`);
          results.push({ ip: doc.ip, reason: doc.reason, blockedAt: doc.blockedAt, applied: true, method: (applied as any).method });
        } else {
          failCount++;
          console.error(`[BLOCK] ✗ Failed to block ${addr}: ${(applied as any).error}`);
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

export const scanPorts = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    
    const { hosts, ports, timeout = 2000, concurrency = 50 } = req.body;
    
    if (!hosts || !Array.isArray(hosts) || hosts.length === 0) {
      return res.status(400).json({ error: 'hosts array is required' });
    }
    
    if (!ports || !Array.isArray(ports) || ports.length === 0) {
      return res.status(400).json({ error: 'ports array is required' });
    }
    
    // SECURITY: Only allow scanning single IP (current VM) - prevent subnet scanning
    if (hosts.length > 1) {
      return res.status(403).json({ 
        error: 'Security restriction: Only single IP scanning is allowed. Cannot scan subnets or multiple hosts.' 
      });
    }
    
    // Validate IP format
    const ipPattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    for (const host of hosts) {
      if (!ipPattern.test(host)) {
        return res.status(400).json({ error: `Invalid IP address format: ${host}` });
      }
      const parts = host.split('.').map(Number);
      if (!parts.every((p: number) => p >= 0 && p <= 255)) {
        return res.status(400).json({ error: `Invalid IP address: ${host}` });
      }
    }
    
    // Limit scan size to prevent abuse (reduced since only single IP)
    if (hosts.length * ports.length > 1000) {
      return res.status(400).json({ error: 'Scan too large. Maximum 1,000 port combinations allowed per IP.' });
    }
    
    const { scanPorts: scanPortsService } = await import('../services/portScanner');
    
    console.log(`[PORT SCAN] Scanning ${hosts.length} hosts × ${ports.length} ports = ${hosts.length * ports.length} total`);
    const startTime = Date.now();
    
    const results = await scanPortsService(hosts, ports, concurrency, timeout);
    
    const duration = Date.now() - startTime;
    console.log(`[PORT SCAN] Completed in ${duration}ms. Found ${results.length} open ports.`);
    
    // Group results by host
    const grouped: { [host: string]: number[] } = {};
    for (const result of results) {
      if (!grouped[result.host]) {
        grouped[result.host] = [];
      }
      grouped[result.host].push(result.port);
    }
    
    // Convert to array format
    const hostList = Object.entries(grouped).map(([host, ports]) => ({
      host,
      ports: ports.sort((a, b) => a - b)
    }));
    
    res.json({
      hosts: hostList,
      totalScanned: hosts.length * ports.length,
      openPorts: results.length,
      duration
    });
  } catch (e: any) {
    console.error('scanPorts error:', e);
    res.status(500).json({ error: e?.message || 'Failed to scan ports' });
  }
};

export const unblockIP = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    const { ip } = req.params;
    if (!ip) return res.status(400).json({ error: 'ip param is required' });

    // Remove from MongoDB (try user-specific first, then all users for auto-blocked IPs)
    const userDeleteResult = await BlockedIP.deleteOne({ user: req.user._id, ip });
    // Also try to delete without user filter (for auto-blocked IPs that might not have user)
    if (userDeleteResult.deletedCount === 0) {
      await BlockedIP.deleteOne({ ip }).catch(() => {});
    }

    // Remove from Redis temp bans (for auto-blocked IPs)
    try {
      const { removeTempBan } = await import('../services/blocker');
      await removeTempBan(ip);
      console.log(`[UNBLOCK] Removed ${ip} from Redis temp bans`);
    } catch (redisErr) {
      console.warn(`[UNBLOCK] Could not remove from Redis (may not be temp banned):`, redisErr);
      // Continue - not all IPs are in Redis
    }

    // Remove from firewall
    const result = await firewall.unblockIP(ip);
    
    if ((result as any).removed !== false) {
      console.log(`[UNBLOCK] Successfully unblocked ${ip}`);
      return res.json({ message: 'Unblocked successfully', removed: true });
    } else {
      console.warn(`[UNBLOCK] Firewall unblock may have failed:`, (result as any).error);
      // Still return success if DB/Redis cleanup worked
      return res.json({ 
        message: 'Unblocked from database and Redis', 
        removed: true,
        warning: (result as any).error ? `Firewall removal: ${(result as any).error}` : undefined
      });
    }
  } catch (e) {
    console.error('unblockIP error:', e);
    return res.status(500).json({ error: `Failed to unblock IP: ${(e as any)?.message || String(e)}` });
  }
};