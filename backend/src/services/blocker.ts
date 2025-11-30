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
 */
export async function enforceTempBan(ip: string, reason: string, opts?: { ttlSeconds?: number }): Promise<TempBanRecord> {
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