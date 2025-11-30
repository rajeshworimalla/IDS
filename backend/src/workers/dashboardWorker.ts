/**
 * WORKER 4: Dashboard Updater Worker
 * 
 * Handles:
 * - Fetching latest stats
 * - Generating summaries
 * - Caching to Redis
 * 
 * Dashboard reads from Redis cache, NOT directly from MongoDB.
 */

import { redis } from '../services/redis';
import { Packet } from '../models/Packet';

const CACHE_KEY_STATS = (userId: string) => `ids:dashboard:stats:${userId}`;
const CACHE_KEY_ALERTS = (userId: string) => `ids:dashboard:alerts:${userId}`;
const CACHE_TTL = 5; // 5 seconds cache (updated every 2 seconds, so 5s TTL is safe)

/**
 * Update dashboard stats cache (called periodically)
 */
export async function updateDashboardStatsWorker(userId: string): Promise<void> {
  try {
    // Fetch only recent data (last 24 hours) with limits
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [totalPackets, criticalCount, mediumCount, normalCount, maliciousCount] = await Promise.all([
      Packet.countDocuments({ user: userId, date: { $gte: oneDayAgo } }),
      Packet.countDocuments({ user: userId, status: 'critical', date: { $gte: oneDayAgo } }),
      Packet.countDocuments({ user: userId, status: 'medium', date: { $gte: oneDayAgo } }),
      Packet.countDocuments({ user: userId, status: 'normal', date: { $gte: oneDayAgo } }),
      Packet.countDocuments({ user: userId, is_malicious: true, date: { $gte: oneDayAgo } })
    ]);

    const stats = {
      totalPackets,
      criticalCount,
      mediumCount,
      normalCount,
      maliciousCount,
      criticalPercentage: totalPackets > 0 ? (criticalCount / totalPackets) * 100 : 0,
      mediumPercentage: totalPackets > 0 ? (mediumCount / totalPackets) * 100 : 0,
      normalPercentage: totalPackets > 0 ? (normalCount / totalPackets) * 100 : 0,
      maliciousPercentage: totalPackets > 0 ? (maliciousCount / totalPackets) * 100 : 0,
      updatedAt: Date.now()
    };

    // Cache in Redis
    await redis.set(CACHE_KEY_STATS(userId), JSON.stringify(stats), 'EX', CACHE_TTL);
  } catch (err) {
    console.warn('[DASHBOARD-WORKER] Failed to update stats:', (err as Error)?.message);
  }
}

/**
 * Update dashboard alerts cache (called periodically)
 */
export async function updateDashboardAlertsWorker(userId: string): Promise<void> {
  try {
    // Fetch only recent critical/medium alerts with limit
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const alerts = await Packet.find({
      user: userId,
      $or: [{ status: 'critical' }, { status: 'medium' }],
      date: { $gte: oneDayAgo }
    })
      .sort({ date: -1 })
      .limit(500) // Max 500 alerts
      .lean();

    const alertStats = {
      critical: alerts.filter(a => a.status === 'critical').length,
      high: alerts.filter(a => a.status === 'critical' && a.is_malicious).length,
      medium: alerts.filter(a => a.status === 'medium').length,
      low: 0,
      total: alerts.length,
      updatedAt: Date.now()
    };

    // Cache in Redis
    await redis.set(CACHE_KEY_ALERTS(userId), JSON.stringify(alertStats), 'EX', CACHE_TTL);
  } catch (err) {
    console.warn('[DASHBOARD-WORKER] Failed to update alerts:', (err as Error)?.message);
  }
}

/**
 * Get cached dashboard stats (for API endpoints)
 */
export async function getCachedStats(userId: string): Promise<any | null> {
  try {
    const cached = await redis.get(CACHE_KEY_STATS(userId));
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // Cache miss - return null, caller will fetch from DB
  }
  return null;
}

/**
 * Get cached dashboard alerts (for API endpoints)
 */
export async function getCachedAlerts(userId: string): Promise<any | null> {
  try {
    const cached = await redis.get(CACHE_KEY_ALERTS(userId));
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // Cache miss - return null, caller will fetch from DB
  }
  return null;
}

