/**
 * WORKER 1: Blocking System Worker
 * 
 * Handles ONLY:
 * - Add firewall rule
 * - Remove firewall rule  
 * - Update blocklist cache
 * 
 * Super light, super fast. No other operations.
 */

import { firewall } from '../services/firewall';
import { addDeny, removeDeny } from '../services/nginxDeny';
import { redis } from '../services/redis';
import { getPolicy } from '../services/policy';

const TEMPBAN_KEY = (ip: string) => `ids:tempban:${ip}`;
const TEMPBAN_INDEX = 'ids:tempbans';

export type TempBanRecord = {
  ip: string;
  reason?: string;
  blockedAt: number;
  expiresAt: number;
  methods?: string[];
};

/**
 * Block an IP (called by job queue)
 * ONLY does firewall operations - nothing else
 * CRITICAL: This blocks the SPECIFIC IP address, not all traffic
 */
export async function blockIPWorker(ip: string, reason: string, opts?: { ttlSeconds?: number }): Promise<TempBanRecord> {
  // CRITICAL: Validate IP before blocking
  if (!ip || ip.trim() === '') {
    throw new Error('Cannot block: IP address is empty');
  }
  
  // Safety check: Never block localhost or broadcast addresses
  if (ip.startsWith('127.') || ip === '0.0.0.0' || ip === '255.255.255.255' || ip === '::1') {
    throw new Error(`Cannot block reserved IP address: ${ip}`);
  }
  
  console.log(`[BLOCKING-WORKER] 🔒 Blocking SPECIFIC IP: ${ip} (reason: ${reason})`);
  
  const policy = await getPolicy();
  const ttlSeconds = Math.max(1, Math.floor((opts?.ttlSeconds ?? (policy.banMinutes * 60))));
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  const methods: string[] = [];

  // ONLY firewall operations - no nginx reload, no notifications, no DB writes
  // This adds ONLY the specific IP to the blocklist (incremental, not full reload)
  if (policy.useFirewall) {
    const res = await firewall.blockIP(ip, { ttlSeconds });
    if ((res as any).applied) {
      methods.push((res as any).method || 'firewall');
      console.log(`[BLOCKING-WORKER] ✓ Successfully blocked IP: ${ip} via ${(res as any).method}`);
    } else {
      console.error(`[BLOCKING-WORKER] ✗ Failed to block IP: ${ip} - ${(res as any).error}`);
      throw new Error(`Failed to block IP: ${(res as any).error}`);
    }
  }

  if (policy.useNginxDeny) {
    const ok = await addDeny(ip);
    if (ok) {
      methods.push('nginx-deny');
      // NO nginx reload - nginx picks up changes automatically
    }
  }

  // Update Redis cache only
  const rec: TempBanRecord = { ip, reason, blockedAt: now, expiresAt, methods };
  await redis.set(TEMPBAN_KEY(ip), JSON.stringify(rec), 'EX', ttlSeconds);
  await redis.zadd(TEMPBAN_INDEX, Math.floor(expiresAt / 1000), ip);

  return rec;
}

/**
 * Unblock an IP (called by job queue)
 * ONLY does firewall operations - nothing else
 */
export async function unblockIPWorker(ip: string): Promise<void> {
  // ONLY firewall operations - no nginx reload, no notifications
  try { 
    await firewall.unblockIP(ip); 
  } catch {}
  
  try { 
    await removeDeny(ip); 
    // NO nginx reload - removed to prevent lag
  } catch {}
  
  // Update Redis cache only
  await redis.del(TEMPBAN_KEY(ip));
  await redis.zrem(TEMPBAN_INDEX, ip);
}

