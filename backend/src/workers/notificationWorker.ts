/**
 * WORKER 5: Notification System Worker
 * 
 * Handles:
 * - Writing logs
 * - Sending email/SMS/API notifications
 * - Informing front-end via websockets
 * 
 * Completely async, never blocks detection.
 */

import { getIO } from '../socket';
import { notifyEvent } from '../services/aggregator';

/**
 * Send intrusion alert notification (websocket)
 * NOW USES QUEUE WORKER - Non-blocking, dedicated thread
 */
export async function sendIntrusionAlertWorker(userId: string, alertData: any): Promise<void> {
  try {
    // Use notification queue worker (dedicated thread, non-blocking)
    const { notificationQueue } = await import('./notificationQueueWorker');
    notificationQueue.enqueue('intrusion', userId, alertData);
  } catch (err: unknown) {
    console.warn('[NOTIFICATION-WORKER] Failed to queue intrusion alert:', (err as Error)?.message);
    // Fallback: send directly if queue fails
    try {
      const io = getIO();
      if (io) {
        io.to(`user_${userId}`).emit('intrusion-detected', alertData);
      }
    } catch (fallbackErr: unknown) {
      console.warn('[NOTIFICATION-WORKER] Fallback also failed:', (fallbackErr as Error)?.message);
    }
  }
}

/**
 * Send IP blocked notification (websocket)
 * NOW USES QUEUE WORKER - Non-blocking, dedicated thread
 */
export async function sendIPBlockedNotificationWorker(userId: string, ip: string, reason: string, method: string): Promise<void> {
  try {
    // Use notification queue worker (dedicated thread, non-blocking)
    const { notificationQueue } = await import('./notificationQueueWorker');
    notificationQueue.enqueue('ip-blocked', userId, {
      ip,
      reason,
      method,
      timestamp: new Date().toISOString()
    });
  } catch (err: unknown) {
    console.warn('[NOTIFICATION-WORKER] Failed to queue IP blocked notification:', (err as Error)?.message);
    // Fallback: send directly if queue fails
    try {
      const io = getIO();
      if (io) {
        io.to(`user_${userId}`).emit('ip-blocked', {
          ip,
          reason,
          method,
          timestamp: new Date().toISOString()
        });
      }
    } catch (fallbackErr: unknown) {
      console.warn('[NOTIFICATION-WORKER] Fallback also failed:', (fallbackErr as Error)?.message);
    }
  }
}

/**
 * Send blocking complete notification (websocket)
 * NOW USES QUEUE WORKER - Non-blocking, dedicated thread
 */
export async function sendBlockingCompleteNotificationWorker(userId: string, ip: string): Promise<void> {
  try {
    // Use notification queue worker (dedicated thread, non-blocking)
    const { notificationQueue } = await import('./notificationQueueWorker');
    notificationQueue.enqueue('blocking-complete', userId, {
      ip,
      message: `IP ${ip} has been blocked. System ready for next attack.`,
      timestamp: new Date().toISOString()
    });
  } catch (err: unknown) {
    console.warn('[NOTIFICATION-WORKER] Failed to queue blocking complete notification:', (err as Error)?.message);
    // Fallback: send directly if queue fails
    try {
      const io = getIO();
      if (io) {
        io.to(`user_${userId}`).emit('blocking-complete', {
          ip,
          message: `IP ${ip} has been blocked. System ready for next attack.`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (fallbackErr: unknown) {
      console.warn('[NOTIFICATION-WORKER] Fallback also failed:', (fallbackErr as Error)?.message);
    }
  }
}

/**
 * Log event to aggregator (async)
 */
export async function logEventWorker(type: string, payload: any): Promise<void> {
  try {
    await notifyEvent(type, payload);
  } catch (err) {
    // Silently fail - logging is not critical
  }
}

