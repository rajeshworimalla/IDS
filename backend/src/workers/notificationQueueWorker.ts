/**
 * NOTIFICATION QUEUE WORKER - Dedicated Thread for Notifications
 * 
 * This worker thread handles all notification operations:
 * - Queues notifications from packet analyzer
 * - Throttles duplicate notifications
 * - Sends notifications via websocket (non-blocking)
 * - Prevents packet processing thread from being blocked
 */

// @ts-ignore - worker_threads is a Node.js built-in module
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
// @ts-ignore - path is a Node.js built-in module
import * as path from 'path';

// Notification queue (in-memory, per worker instance)
interface NotificationItem {
  type: 'intrusion' | 'ip-blocked' | 'blocking-complete';
  userId: string;
  data: any;
  timestamp: number;
}

// Throttle map: IP:attackType -> last sent timestamp
const notificationThrottle: Map<string, number> = new Map();
const NOTIFICATION_QUEUE: NotificationItem[] = [];
const MAX_QUEUE_SIZE = 1000; // Max notifications in queue
let processing = false;

// Throttle durations (ms)
const THROTTLE_DURATIONS = {
  intrusion: {
    gracePeriod: 30000, // 30 seconds for grace period
    normal: {
      dos: 10000, // 10 seconds for DoS/DDoS
      other: 2000 // 2 seconds for others
    }
  },
  'ip-blocked': 5000, // 5 seconds
  'blocking-complete': 2000 // 2 seconds
};

/**
 * Check if notification should be throttled
 */
function shouldThrottle(item: NotificationItem): boolean {
  if (item.type === 'intrusion') {
    const ip = item.data.ip || 'unknown';
    const attackType = item.data.attackType || 'unknown';
    const inGracePeriod = item.data.inGracePeriod || false;
    
    const throttleKey = `${ip}:${attackType}`;
    const lastSent = notificationThrottle.get(throttleKey) || 0;
    const now = Date.now();
    
    // Determine throttle duration
    let throttleDuration: number;
    if (inGracePeriod) {
      throttleDuration = THROTTLE_DURATIONS.intrusion.gracePeriod;
    } else {
      const isDoS = attackType === 'dos' || attackType === 'ddos';
      throttleDuration = isDoS 
        ? THROTTLE_DURATIONS.intrusion.normal.dos 
        : THROTTLE_DURATIONS.intrusion.normal.other;
    }
    
    if (now - lastSent < throttleDuration) {
      return true; // Throttled
    }
    
    // Update throttle timestamp
    notificationThrottle.set(throttleKey, now);
    return false; // Not throttled
  } else if (item.type === 'ip-blocked') {
    const ip = item.data.ip || 'unknown';
    const throttleKey = `blocked:${ip}`;
    const lastSent = notificationThrottle.get(throttleKey) || 0;
    const now = Date.now();
    
    if (now - lastSent < THROTTLE_DURATIONS['ip-blocked']) {
      return true; // Throttled
    }
    
    notificationThrottle.set(throttleKey, now);
    return false; // Not throttled
  } else if (item.type === 'blocking-complete') {
    const ip = item.data.ip || 'unknown';
    const throttleKey = `complete:${ip}`;
    const lastSent = notificationThrottle.get(throttleKey) || 0;
    const now = Date.now();
    
    if (now - lastSent < THROTTLE_DURATIONS['blocking-complete']) {
      return true; // Throttled
    }
    
    notificationThrottle.set(throttleKey, now);
    return false; // Not throttled
  }
  
  return false; // Default: don't throttle
}

/**
 * Process notification queue (runs in worker thread)
 */
async function processQueue(): Promise<void> {
  if (processing || NOTIFICATION_QUEUE.length === 0) {
    return;
  }
  
  processing = true;
  
  try {
    // Process up to 10 notifications per batch
    const batchSize = Math.min(10, NOTIFICATION_QUEUE.length);
    const batch: NotificationItem[] = [];
    
    for (let i = 0; i < batchSize; i++) {
      const item = NOTIFICATION_QUEUE.shift();
      if (item) {
        // Check throttling
        if (!shouldThrottle(item)) {
          batch.push(item);
        } else {
          // Throttled - skip this notification
          console.log(`[NOTIFICATION-QUEUE] ⏭ Throttled ${item.type} notification for ${item.data.ip || 'unknown'}`);
        }
      }
    }
    
    // Send notifications (non-blocking)
    for (const item of batch) {
      try {
        // Import socket dynamically (can't import at top level in worker)
        const { getIO } = await import('../socket');
        const io = getIO();
        
        if (io) {
          if (item.type === 'intrusion') {
            io.to(`user_${item.userId}`).emit('intrusion-detected', item.data);
            console.log(`[NOTIFICATION-QUEUE] ✅ Sent intrusion alert for ${item.data.ip}:${item.data.attackType}`);
          } else if (item.type === 'ip-blocked') {
            io.to(`user_${item.userId}`).emit('ip-blocked', item.data);
            console.log(`[NOTIFICATION-QUEUE] ✅ Sent IP blocked notification for ${item.data.ip}`);
          } else if (item.type === 'blocking-complete') {
            io.to(`user_${item.userId}`).emit('blocking-complete', item.data);
            console.log(`[NOTIFICATION-QUEUE] ✅ Sent blocking complete notification for ${item.data.ip}`);
          }
        }
      } catch (err: unknown) {
        console.error(`[NOTIFICATION-QUEUE] ❌ Failed to send ${item.type} notification:`, (err as Error)?.message);
      }
    }
  } catch (err: unknown) {
    console.error('[NOTIFICATION-QUEUE] ❌ Error processing queue:', (err as Error)?.message);
  } finally {
    processing = false;
  }
}

/**
 * Worker thread message handler
 */
if (!isMainThread && parentPort) {
  parentPort.on('message', async (message: { type: string; item?: NotificationItem }) => {
    try {
      if (message.type === 'enqueue') {
        const item = message.item;
        if (!item) return;
        
        // Prevent queue overflow
        if (NOTIFICATION_QUEUE.length >= MAX_QUEUE_SIZE) {
          // Drop oldest notification
          const dropped = NOTIFICATION_QUEUE.shift();
          console.warn(`[NOTIFICATION-QUEUE] ⚠ Queue full, dropped oldest notification: ${dropped?.type}`);
        }
        
        // Add to queue
        NOTIFICATION_QUEUE.push({
          ...item,
          timestamp: Date.now()
        });
        
        // Process queue asynchronously
        processQueue().catch((err: unknown) => {
          console.error('[NOTIFICATION-QUEUE] Error in processQueue:', (err as Error)?.message);
        });
      } else if (message.type === 'process') {
        // Manual trigger to process queue
        await processQueue();
      }
    } catch (err: unknown) {
      console.error('[NOTIFICATION-QUEUE] Error handling message:', (err as Error)?.message);
    }
  });
  
  // Process queue periodically (every 100ms)
  setInterval(() => {
    processQueue().catch((err: unknown) => {
      console.error('[NOTIFICATION-QUEUE] Error in periodic processQueue:', (err as Error)?.message);
    });
  }, 100);
  
  console.log('[NOTIFICATION-QUEUE] Worker thread started');
}

/**
 * Notification Queue Manager (Main Thread)
 */
export class NotificationQueueManager {
  private worker: Worker | null = null;
  private isRunning = false;

  constructor() {
    // Don't initialize worker in constructor - do it explicitly
  }

  /**
   * Start the notification worker thread
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    try {
      // @ts-ignore - worker_threads path resolution
      const workerPath = path.join(process.cwd(), 'dist', 'workers', 'notificationQueueWorker.js');
      
      this.worker = new Worker(workerPath, {
        workerData: {}
      });

      this.worker.on('message', (message: any) => {
        // Handle messages from worker if needed
        console.log('[NOTIFICATION-QUEUE] Worker message:', message);
      });

      this.worker.on('error', (err: Error) => {
        console.error('[NOTIFICATION-QUEUE] Worker error:', err);
        this.isRunning = false;
      });

      this.worker.on('exit', (code: number) => {
        console.log(`[NOTIFICATION-QUEUE] Worker stopped with exit code ${code}`);
        this.isRunning = false;
        this.worker = null;
        
        // Restart worker if it crashed
        if (code !== 0) {
          console.log('[NOTIFICATION-QUEUE] Restarting worker...');
          setTimeout(() => {
            this.start();
          }, 1000);
        }
      });

      this.isRunning = true;
      console.log('[NOTIFICATION-QUEUE] ✅ Notification queue worker started');
    } catch (err: unknown) {
      console.error('[NOTIFICATION-QUEUE] ❌ Failed to start worker:', (err as Error)?.message);
      this.isRunning = false;
    }
  }

  /**
   * Enqueue a notification (non-blocking)
   */
  enqueue(type: 'intrusion' | 'ip-blocked' | 'blocking-complete', userId: string, data: any): void {
    if (!this.isRunning || !this.worker) {
      // Fallback: send directly if worker not available
      console.warn('[NOTIFICATION-QUEUE] Worker not available, sending directly');
      this.sendDirectly(type, userId, data).catch(() => {});
      return;
    }

    try {
      this.worker.postMessage({
        type: 'enqueue',
        item: {
          type,
          userId,
          data,
          timestamp: Date.now()
        }
      });
    } catch (err: unknown) {
      console.error('[NOTIFICATION-QUEUE] Failed to enqueue notification:', (err as Error)?.message);
      // Fallback: send directly
      this.sendDirectly(type, userId, data).catch(() => {});
    }
  }

  /**
   * Fallback: Send notification directly (if worker fails)
   */
  private async sendDirectly(type: 'intrusion' | 'ip-blocked' | 'blocking-complete', userId: string, data: any): Promise<void> {
    try {
      const { getIO } = await import('../socket');
      const io = getIO();
      
      if (io) {
        if (type === 'intrusion') {
          io.to(`user_${userId}`).emit('intrusion-detected', data);
        } else if (type === 'ip-blocked') {
          io.to(`user_${userId}`).emit('ip-blocked', data);
        } else if (type === 'blocking-complete') {
          io.to(`user_${userId}`).emit('blocking-complete', data);
        }
      }
    } catch (err: unknown) {
      console.error('[NOTIFICATION-QUEUE] Failed to send directly:', (err as Error)?.message);
    }
  }

  /**
   * Stop the notification worker thread
   */
  stop(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isRunning = false;
      console.log('[NOTIFICATION-QUEUE] Worker stopped');
    }
  }
}

// Export singleton instance
export const notificationQueue = new NotificationQueueManager();

