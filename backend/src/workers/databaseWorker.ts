/**
 * WORKER 2: Database Logging Worker
 * 
 * Handles:
 * - Storing alerts
 * - Packet metadata
 * - Attack history
 * 
 * Runs async, doesn't block detection.
 */

import { Packet as PacketModel } from '../models/Packet';
import { BlockedIP } from '../models/BlockedIP';

/**
 * Save packet to database (batched, non-blocking)
 */
export async function savePacketWorker(packetData: any): Promise<void> {
  try {
    await PacketModel.create(packetData);
  } catch (err) {
    // Silently fail - packet is already in batch queue
    console.warn('[DB-WORKER] Failed to save packet:', (err as Error)?.message);
  }
}

/**
 * Batch save packets (called periodically)
 */
export async function batchSavePacketsWorker(packets: any[]): Promise<void> {
  if (packets.length === 0) return;
  
  try {
    await PacketModel.insertMany(packets, { ordered: false });
  } catch (err) {
    // Try saving critical packets individually
    const criticalPackets = packets.filter(p => p.status === 'critical');
    for (const packet of criticalPackets) {
      try {
        await PacketModel.create(packet);
      } catch {}
    }
  }
}

/**
 * Save blocked IP record
 */
export async function saveBlockedIPWorker(userId: string, ip: string, reason: string, method: string): Promise<void> {
  try {
    await BlockedIP.findOneAndUpdate(
      { user: userId, ip },
      {
        $setOnInsert: { blockedAt: new Date() },
        $set: { reason, method }
      },
      { new: true, upsert: true }
    );
  } catch (err) {
    console.warn('[DB-WORKER] Failed to save blocked IP:', (err as Error)?.message);
  }
}

