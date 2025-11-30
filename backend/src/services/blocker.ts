import { queueBlockIP } from './jobQueue';
import { blockIPWorker } from '../workers/blockingWorker';
import { logEventWorker } from '../workers/notificationWorker';

export type TempBanRecord = {
  ip: string;
  reason?: string;
  blockedAt: number;
  expiresAt: number;
  methods?: string[];
};

/**
 * Queue a blocking operation (non-blocking, returns immediately)
 * MAIN THREAD: Only enqueues job, no heavy work
 * CRITICAL: Checks if IP is already blocked to prevent duplicates
 */
export async function enforceTempBan(ip: string, reason: string, opts?: { ttlSeconds?: number }): Promise<TempBanRecord | null> {
  // CRITICAL: Check if already blocked BEFORE queuing (prevents duplicate blocks)
  try {
    const { redis } = await import('./redis');
    const tempBanKey = `ids:tempban:${ip}`;
    const alreadyBlocked = await redis.get(tempBanKey).catch(() => null);
    
    if (alreadyBlocked) {
      // Already blocked - return null to indicate no action needed
      console.log(`[BLOCKER] ⚠ IP ${ip} already blocked - skipping duplicate block`);
      return null;
    }
  } catch (err: unknown) {
    // If Redis check fails, continue (better to try blocking than skip)
    console.warn(`[BLOCKER] Could not check if IP ${ip} is blocked:`, (err as Error)?.message);
  }
  
  // MAIN THREAD: Only enqueue - no blocking operations here
  await queueBlockIP(ip, reason, async (ip: string, reason: string) => {
    // WORKER THREAD 1: Blocking worker handles firewall operations
    const result = await blockIPWorker(ip, reason, opts);
    
    // WORKER THREAD 5: Notification worker handles logging (async, non-blocking)
    logEventWorker('auto_ban', result).catch(() => {});
    
    return result;
  });
  
  // Return immediately (actual blocking happens in worker thread)
  const { getPolicy } = await import('./policy');
  const policy = await getPolicy();
  const ttlSeconds = Math.max(1, Math.floor((opts?.ttlSeconds ?? (policy.banMinutes * 60))));
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  
  return {
    ip,
    reason,
    blockedAt: now,
    expiresAt,
    methods: ['queued'] // Will be updated when worker completes
  };
}

export async function removeTempBan(ip: string): Promise<void> {
  // MAIN THREAD: Only enqueue - no blocking operations here
  const { queueUnblockIP } = await import('./jobQueue');
  const { unblockIPWorker } = await import('../workers/blockingWorker');
  const { logEventWorker } = await import('../workers/notificationWorker');
  
  await queueUnblockIP(ip, async (ip: string) => {
    // WORKER THREAD 1: Blocking worker handles firewall operations
    await unblockIPWorker(ip);
    
    // WORKER THREAD 5: Notification worker handles logging (async, non-blocking)
    logEventWorker('auto_unban', { ip, ts: Date.now() }).catch(() => {});
  });
}

export async function isTempBanned(ip: string): Promise<boolean> {
  const { redis } = await import('./redis');
  const TEMPBAN_KEY = (ip: string) => `ids:tempban:${ip}`;
  const v = await redis.get(TEMPBAN_KEY(ip));
  return !!v;
}