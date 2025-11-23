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
  console.log(`[IP_CONTROLLER] 📥 Block IP request received: ${JSON.stringify(req.body)}`);
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    const { ip, reason } = req.body as { ip?: string; reason?: string };
    if (!ip) return res.status(400).json({ error: 'ip is required' });

    // Prevent blocking localhost (safety) - comprehensive check
    const ipToCheck = String(ip).trim().toLowerCase();
    const localhostPatterns = [
      '127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1',
      '0.0.0.0', '::', '127.', 'localhost.localdomain'
    ];
    const isLocalhost = localhostPatterns.some(pattern => 
      ipToCheck === pattern || ipToCheck.startsWith(pattern + '.') || ipToCheck.startsWith('127.')
    );
    
    if (isLocalhost) {
      console.log(`[IP_CONTROLLER] ❌ BLOCKED: Attempt to block localhost/system IP: ${ipToCheck}`);
      return res.status(400).json({ error: 'Cannot block localhost (127.0.0.1) or system IPs for security reasons' });
    }

    // If it's a literal IP, block directly
    if (isIP(ip) !== 0) {
      console.log(`[IP_CONTROLLER] ✓ Valid IP detected: ${ip}, proceeding with blocking...`);
      const setOnInsert: any = { blockedAt: new Date() };
      const set: any = {};
      if (typeof reason !== 'undefined') set.reason = reason;
      
      let doc;
      try {
        // Add timeout to MongoDB operation (10 seconds - allows for slow operations)
        const mongoStartTime = Date.now();
        doc = await Promise.race([
          BlockedIP.findOneAndUpdate(
            { user: req.user._id, ip },
            { $setOnInsert: setOnInsert, ...(Object.keys(set).length ? { $set: set } : {}) },
            { new: true, upsert: true }
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('MongoDB operation timeout')), 10000)
          )
        ]) as any;
        const mongoDuration = Date.now() - mongoStartTime;
        if (mongoDuration > 2000) {
          console.warn(`⚠️ MongoDB operation for ${ip} took ${mongoDuration}ms (slow)`);
        }
      } catch (dbErr: any) {
        console.error(`❌ MongoDB error saving blocked IP ${ip}:`, dbErr?.message || String(dbErr));
        // Continue anyway - firewall blocking still works even if DB save fails
        // Create a fallback doc so firewall operation can proceed
        doc = { ip, reason: reason || 'manual', blockedAt: new Date() };
      }

      let result;
      try {
        console.log(`[IP_CONTROLLER] 🔥 Calling firewall.blockIP for ${ip}...`);
        result = await firewall.blockIP(ip);
        console.log(`[IP_CONTROLLER] 🔥 Firewall result:`, JSON.stringify(result));
      } catch (e: any) {
        console.error(`❌ Error calling firewall.blockIP for ${ip}:`, e);
        // Still save to DB even if firewall fails
        return res.status(201).json({ 
          ip: doc.ip, 
          reason: doc.reason, 
          blockedAt: doc.blockedAt, 
          applied: false, 
          error: e?.message || 'Firewall operation failed' 
        });
      }
      
      if ('applied' in result && result.applied) {
        console.log(`[IP_CONTROLLER] ✅ IP ${ip} successfully blocked via ${(result as any).method}`);
        try {
          const { notifyEvent } = await import('../services/aggregator');
          await notifyEvent('manual_ban', { ip, reason: reason || 'manual', user: req.user._id, method: (result as any).method });
        } catch {}
        return res.status(201).json({ ip: doc.ip, reason: doc.reason, blockedAt: doc.blockedAt, applied: true, method: result.method });
      }
      console.error(`[IP_CONTROLLER] ❌ IP ${ip} blocking failed:`, (result as any).error);
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

    // Resolve both A and AAAA records - get ALL IPs for the domain (with timeout)
    let allIPs: string[] = [];
    try {
      // Add timeout to DNS resolution (5 seconds max)
      const dnsTimeout = 5000;
      
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('DNS resolution timeout')), dnsTimeout)
      );
      
      // Race DNS resolution against timeout
      const dnsResult = await Promise.race([
        Promise.allSettled([
          dns.resolve4(host),
          dns.resolve6(host)
        ]),
        timeoutPromise
      ]) as PromiseSettledResult<string[]>[];
      
      if (dnsResult[0] && dnsResult[0].status === 'fulfilled') {
        allIPs.push(...dnsResult[0].value);
      }
      if (dnsResult[1] && dnsResult[1].status === 'fulfilled') {
        allIPs.push(...dnsResult[1].value);
      }
      
      // Fallback to lookup if resolve fails (with timeout)
      if (allIPs.length === 0) {
        try {
          const lookupPromise = dns.lookup(host, { all: true });
          const lookupTimeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('DNS lookup timeout')), 3000)
          );
          const looked = await Promise.race([lookupPromise, lookupTimeout]) as any;
          allIPs = looked
            .filter((a: any) => a && a.address)
            .map((a: any) => a.address);
        } catch (lookupErr) {
          // If lookup also fails, continue with empty list
          console.warn(`DNS lookup failed for ${host}:`, lookupErr);
        }
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

    // CRITICAL: Block domain via /etc/hosts FIRST (prevents DNS resolution)
    let hostsBlocked = false;
    try {
      const domainBlockResult = await firewall.blockDomain(host);
      if ((domainBlockResult as any).applied) {
        hostsBlocked = (domainBlockResult as any).hostsBlocked || false;
        console.log(`✅ DNS blocked for ${host} via /etc/hosts: ${hostsBlocked}`);
      }
    } catch (e: any) {
      console.warn(`⚠️ Failed to block domain ${host} via /etc/hosts: ${e?.message || String(e)}`);
    }

    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;
    
    // Limit to first 20 IPs to prevent timeout (most domains don't have more)
    const ipsToBlock = uniq.slice(0, 20);
    if (uniq.length > 20) {
      console.warn(`⚠️ Domain ${host} resolved to ${uniq.length} IPs, blocking first 20 only`);
    }
    
    // Block ALL IPs for the domain (in case DNS blocking fails or IPs change)
    for (const addr of ipsToBlock) {
      try {
        let doc;
        try {
          // Add timeout to MongoDB operation (10 seconds - allows for slow operations)
          const mongoStartTime = Date.now();
          doc = await Promise.race([
            BlockedIP.findOneAndUpdate(
              { user: req.user._id, ip: addr },
              { $setOnInsert: { blockedAt: new Date() }, $set: { reason: reasonText } },
              { new: true, upsert: true }
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('MongoDB operation timeout')), 10000)
            )
          ]) as any;
          const mongoDuration = Date.now() - mongoStartTime;
          if (mongoDuration > 2000) {
            console.warn(`⚠️ MongoDB operation for ${addr} took ${mongoDuration}ms (slow)`);
          }
        } catch (dbErr: any) {
          console.error(`❌ MongoDB error saving blocked IP ${addr}:`, dbErr?.message || String(dbErr));
          // Continue anyway - firewall blocking still works even if DB save fails
          // We'll still try to block the IP via firewall
          doc = { ip: addr, reason: reasonText, blockedAt: new Date() };
        }
        
        let applied;
        try {
          applied = await firewall.blockIP(addr);
        } catch (firewallErr: any) {
          console.error(`⚠️ Firewall error blocking ${addr}:`, firewallErr?.message || String(firewallErr));
          applied = { applied: false, error: firewallErr?.message || 'Firewall operation failed' };
        }
        
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
        // Don't crash - continue with next IP
      }
    }

    return res.status(201).json({ 
      message: `Blocked ${host}${hostsBlocked ? ' (DNS blocked via /etc/hosts)' : ''} and ${successCount} of ${uniq.length} IP address(es)${failCount > 0 ? ` (${failCount} failed)` : ''}`, 
      total: uniq.length,
      successful: successCount,
      failed: failCount,
      hostsBlocked: hostsBlocked,
      domain: host,
      items: results 
    });
  } catch (e: any) {
    console.error('blockIP error:', e);
    if (e?.code === 11000) {
      return res.status(200).json({ message: 'Already blocked' });
    }
    return res.status(500).json({ error: 'Failed to block IP or domain' });
  }
};

export const unblockIP = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    const { ip } = req.params;
    if (!ip) return res.status(400).json({ error: 'ip param is required' });

    // Decode IP (might be URL encoded)
    const decodedIP = decodeURIComponent(ip);
    
    // Check if it's a domain (not an IP)
    const isDomain = isIP(decodedIP) === 0;
    
    // Remove from MongoDB
    await BlockedIP.deleteOne({ user: req.user._id, ip: decodedIP });
    
    // Remove from firewall (both IP and domain blocking)
    const result = await firewall.unblockIP(decodedIP);
    if (isDomain) {
      // Also unblock domain from /etc/hosts
      await firewall.unblockDomain(decodedIP).catch(() => {});
    }
    
    // Also remove from Redis temp ban (if it was auto-banned)
    try {
      const { removeTempBan } = await import('../services/blocker');
      await removeTempBan(decodedIP);
      console.log(`Removed temp ban for ${decodedIP}`);
    } catch (e) {
      console.log(`No temp ban found for ${decodedIP} (or error removing):`, e);
    }
    
    return res.json({ message: 'Unblocked', removed: (result as any).removed !== false });
  } catch (e) {
    console.error('unblockIP error:', e);
    return res.status(500).json({ error: 'Failed to unblock IP' });
  }
};