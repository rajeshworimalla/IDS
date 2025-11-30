/**
 * Worker Scheduler
 * 
 * Periodically runs background workers to update caches and perform maintenance
 */

import { updateDashboardStatsWorker, updateDashboardAlertsWorker } from './dashboardWorker';
import { batchSavePacketsWorker } from './databaseWorker';

// Track active users for dashboard updates
const activeUsers = new Set<string>();

/**
 * Register a user as active (called when they connect)
 */
export function registerActiveUser(userId: string): void {
  activeUsers.add(userId);
}

/**
 * Unregister a user (called when they disconnect)
 */
export function unregisterActiveUser(userId: string): void {
  activeUsers.delete(userId);
}

/**
 * Start background schedulers
 */
export function startSchedulers(): void {
  // Update dashboard stats every 2 seconds for active users (as recommended)
  // This ensures cache is always fresh and dashboard never hits MongoDB directly
  setInterval(() => {
    for (const userId of activeUsers) {
      updateDashboardStatsWorker(userId).catch(() => {});
      updateDashboardAlertsWorker(userId).catch(() => {});
    }
  }, 2000); // Every 2 seconds (as recommended for smooth dashboard)

  console.log('[SCHEDULER] Background workers started (updating cache every 2 seconds)');
}

