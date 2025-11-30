/**
 * Global throttle manager for alert and blocking operations
 * This persists across packet capture restarts and can be accessed from anywhere
 */

// Global throttle map: IP:attackType -> timestamp
const alertThrottle: Map<string, number> = new Map();

// Global blocking in progress set
const blockingInProgress: Set<string> = new Set();

/**
 * Check if an alert should be throttled for a given IP and attack type
 * @returns true if throttled (should skip), false if allowed
 */
export function isAlertThrottled(ip: string, attackType: string, throttleMs: number = 2000): boolean {
  const throttleKey = `${ip}:${attackType}`;
  const lastAlertTime = alertThrottle.get(throttleKey) || 0;
  const timeSinceLastAlert = Date.now() - lastAlertTime;
  
  if (timeSinceLastAlert < throttleMs) {
    return true; // Throttled
  }
  
  // Update throttle
  alertThrottle.set(throttleKey, Date.now());
  
  // Clean old entries (older than 1 minute)
  if (alertThrottle.size > 100) {
    const now = Date.now();
    for (const [key, alertTime] of alertThrottle.entries()) {
      if (now - alertTime > 60000) {
        alertThrottle.delete(key);
      }
    }
  }
  
  return false; // Not throttled
}

/**
 * Clear all throttle entries for a specific IP
 * Called when an IP is manually unblocked
 */
export function clearThrottleForIP(ip: string): void {
  const keysToDelete: string[] = [];
  for (const throttleKey of alertThrottle.keys()) {
    if (throttleKey.startsWith(`${ip}:`)) {
      keysToDelete.push(throttleKey);
    }
  }
  keysToDelete.forEach(key => alertThrottle.delete(key));
  
  // Also remove from blocking in progress
  blockingInProgress.delete(ip);
  
  if (keysToDelete.length > 0) {
    console.log(`[THROTTLE] 🧹 Cleared ${keysToDelete.length} throttle entries for ${ip}`);
  } else {
    console.log(`[THROTTLE] ℹ No throttle entries found for ${ip} (may have been cleared already)`);
  }
}

/**
 * Check if an IP is currently being blocked
 */
export function isBlockingInProgress(ip: string): boolean {
  return blockingInProgress.has(ip);
}

/**
 * Mark an IP as blocking in progress
 */
export function setBlockingInProgress(ip: string): void {
  blockingInProgress.add(ip);
  
  // Auto-remove after 10 seconds (blocking should complete by then)
  setTimeout(() => {
    blockingInProgress.delete(ip);
  }, 10000);
}

/**
 * Clear blocking in progress for an IP
 */
export function clearBlockingInProgress(ip: string): void {
  blockingInProgress.delete(ip);
}

