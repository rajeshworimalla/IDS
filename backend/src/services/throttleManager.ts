/**
 * Global throttle manager for alert and blocking operations
 * This persists across packet capture restarts and can be accessed from anywhere
 */

// Global throttle map: IP:attackType -> timestamp
const alertThrottle: Map<string, number> = new Map();

// Global blocking in progress set
const blockingInProgress: Set<string> = new Set();

// Grace period for manually unblocked IPs (prevent immediate re-blocking)
// IP -> timestamp when unblocked (grace period expires after 5 minutes)
const unblockGracePeriod: Map<string, number> = new Map();
const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes grace period after manual unblock

// Track which IPs have been blocked for which attack types
// IP -> Set of attack types that this IP has been blocked for
// Once blocked for an attack type, don't block again for the same attack type
const blockedAttackTypes: Map<string, Set<string>> = new Map();

// Track which IPs have had alerts emitted for which attack types
// IP -> Set of attack types that have had alerts emitted
// This ensures we always emit at least ONE alert per attack type, even if throttled
const emittedAlerts: Map<string, Set<string>> = new Map();

/**
 * Check if an alert should be throttled for a given IP and attack type
 * @returns true if throttled (should skip), false if allowed
 * NOTE: Always returns false for the FIRST alert of an attack type (ensures at least one alert is emitted)
 */
export function isAlertThrottled(ip: string, attackType: string, throttleMs: number = 2000): boolean {
  // CRITICAL: Always emit the FIRST alert for an attack type, even if throttled
  // This ensures users always see popup notifications
  if (!hasEmittedAlertForAttackType(ip, attackType)) {
    return false; // Not throttled - this is the first alert for this attack type
  }
  
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
 * Check if we've already emitted an alert for this IP and attack type
 */
export function hasEmittedAlertForAttackType(ip: string, attackType: string): boolean {
  const attackTypes = emittedAlerts.get(ip);
  if (!attackTypes) {
    return false; // No alerts emitted yet for this IP
  }
  return attackTypes.has(attackType);
}

/**
 * Mark that we've emitted an alert for this IP and attack type
 */
export function markAlertEmitted(ip: string, attackType: string): void {
  if (!emittedAlerts.has(ip)) {
    emittedAlerts.set(ip, new Set());
  }
  emittedAlerts.get(ip)!.add(attackType);
}

/**
 * Clear all throttle entries for a specific IP
 * Called when an IP is manually unblocked
 * Also sets a grace period to prevent immediate re-blocking
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
  
  // Set grace period to prevent immediate re-blocking after manual unblock
  unblockGracePeriod.set(ip, Date.now());
  console.log(`[THROTTLE] 🛡️ Grace period set for ${ip} (5 minutes - auto-blocking disabled)`);
  
  // Clear blocked attack types so IP can be blocked again if it attacks with same type
  clearBlockedAttackTypes(ip);
  
  // Clear emitted alerts so new alerts can be shown for this IP
  emittedAlerts.delete(ip);
  console.log(`[THROTTLE] 🧹 Cleared emitted alerts for ${ip} (new alerts will be shown)`);
  
  // Clean up expired grace periods
  const now = Date.now();
  for (const [graceIP, unblockTime] of unblockGracePeriod.entries()) {
    if (now - unblockTime > GRACE_PERIOD_MS) {
      unblockGracePeriod.delete(graceIP);
    }
  }
  
  if (keysToDelete.length > 0) {
    console.log(`[THROTTLE] 🧹 Cleared ${keysToDelete.length} throttle entries for ${ip}`);
  } else {
    console.log(`[THROTTLE] ℹ No throttle entries found for ${ip} (may have been cleared already)`);
  }
}

/**
 * Check if an IP is in grace period (recently manually unblocked)
 * Auto-blocking should be disabled during grace period
 */
export function isInGracePeriod(ip: string): boolean {
  const unblockTime = unblockGracePeriod.get(ip);
  if (!unblockTime) {
    return false; // Not in grace period
  }
  
  const timeSinceUnblock = Date.now() - unblockTime;
  if (timeSinceUnblock > GRACE_PERIOD_MS) {
    // Grace period expired, remove it
    unblockGracePeriod.delete(ip);
    return false;
  }
  
  return true; // Still in grace period
}

/**
 * Check if an IP has already been blocked for a specific attack type
 * Once blocked for an attack type, don't block again for the same attack type
 */
export function isAlreadyBlockedForAttackType(ip: string, attackType: string): boolean {
  const attackTypes = blockedAttackTypes.get(ip);
  if (!attackTypes) {
    return false; // Not blocked for any attack type yet
  }
  return attackTypes.has(attackType);
}

/**
 * Mark an IP as blocked for a specific attack type
 * This prevents re-blocking for the same attack type
 */
export function markBlockedForAttackType(ip: string, attackType: string): void {
  if (!blockedAttackTypes.has(ip)) {
    blockedAttackTypes.set(ip, new Set());
  }
  blockedAttackTypes.get(ip)!.add(attackType);
  console.log(`[THROTTLE] ✓ Marked ${ip} as blocked for attack type: ${attackType}`);
}

/**
 * Clear blocked attack types for an IP (called when manually unblocked)
 * This allows the IP to be blocked again if it attacks with the same type
 */
export function clearBlockedAttackTypes(ip: string): void {
  const attackTypes = blockedAttackTypes.get(ip);
  if (attackTypes && attackTypes.size > 0) {
    console.log(`[THROTTLE] 🧹 Cleared ${attackTypes.size} blocked attack types for ${ip}: ${Array.from(attackTypes).join(', ')}`);
    blockedAttackTypes.delete(ip);
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

