import { firewall } from './firewall';
import { addDeny, removeDeny, reloadNginxIfConfigured } from './nginxDeny';
import { redis } from './redis';
import { getPolicy } from './policy';
import { notifyEvent } from './aggregator';
import { queueBlockIP } from './jobQueue';

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
 * Internal blocking function (called by job queue)
 */
async function _enforceTempBan(ip: string, reason: string, opts?: { ttlSeconds?: number }): Promise<TempBanRecord> {
  const policy = await getPolicy();
  const ttlSeconds = Math.max(1, Math.floor((opts?.ttlSeconds ?? (policy.banMinutes * 60))));
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  const methods: string[] = [];

  if (policy.useFirewall) {
    const res = await firewall.blockIP(ip, { ttlSeconds });
    if ((res as any).applied) methods.push((res as any).method || 'firewall');
  }

  if (policy.useNginxDeny) {
    const ok = await addDeny(ip);
    if (ok) {
      methods.push('nginx-deny');
      // PERFORMANCE: Reload nginx asynchronously (non-blocking)
      reloadNginxIfConfigured().catch(() => {});
    }
  }

  const rec: TempBanRecord = { ip, reason, blockedAt: now, expiresAt, methods };
  await redis.set(TEMPBAN_KEY(ip), JSON.stringify(rec), 'EX', ttlSeconds);
  await redis.zadd(TEMPBAN_INDEX, Math.floor(expiresAt / 1000), ip);

  // PERFORMANCE: Notify event asynchronously (non-blocking)
  notifyEvent('auto_ban', rec).catch(() => {});
  return rec;
}

/**
 * Queue a blocking operation (non-blocking, returns immediately)
 * This is the main entry point - it queues the blocking operation
 */
export async function enforceTempBan(ip: string, reason: string, opts?: { ttlSeconds?: number }): Promise<TempBanRecord> {
  // PERFORMANCE: Queue blocking operation to prevent lag
  // This returns immediately, actual blocking happens in background
  await queueBlockIP(ip, reason, async (ip: string, reason: string) => {
    return await _enforceTempBan(ip, reason, opts);
  });
  
  // Return a "pending" record immediately (actual blocking happens in background)
  const policy = await getPolicy();
  const ttlSeconds = Math.max(1, Math.floor((opts?.ttlSeconds ?? (policy.banMinutes * 60))));
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  
  return {
    ip,
    reason,
    blockedAt: now,
    expiresAt,
    methods: ['queued'] // Will be updated when actual blocking completes
  };
}

export async function removeTempBan(ip: string): Promise<void> {
  // PERFORMANCE: Queue unblocking operation (non-blocking)
  const { queueUnblockIP } = await import('./jobQueue');
  await queueUnblockIP(ip, async (ip: string) => {
    try { await firewall.unblockIP(ip); } catch {}
    try { await removeDeny(ip); await reloadNginxIfConfigured(); } catch {}
    await redis.del(TEMPBAN_KEY(ip));
    await redis.zrem(TEMPBAN_INDEX, ip);
    // PERFORMANCE: Notify event asynchronously (non-blocking)
    notifyEvent('auto_unban', { ip, ts: Date.now() }).catch(() => {});
  });
}

export async function isTempBanned(ip: string): Promise<boolean> {
  const v = await redis.get(TEMPBAN_KEY(ip));
  return !!v;
}