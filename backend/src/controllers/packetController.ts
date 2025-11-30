import { Request, Response } from 'express';
import { Packet } from '../models/Packet';
import { IUser } from '../models/User';
import mongoose from 'mongoose';

// Extend Express Request type to include user with proper typing
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        id: string;
        role: string;
      };
    }
  }
}

export const getPackets = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const query: any = { user: req.user._id };
    const { startDate, endDate, search } = req.query;

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    if (search) {
      query.$or = [
        { start_ip: { $regex: search, $options: 'i' } },
        { end_ip: { $regex: search, $options: 'i' } },
        { protocol: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const packets = await Packet.find(query).sort({ date: -1 });
    res.json(packets);
  } catch (error) {
    console.error('Error fetching packets:', error);
    res.status(500).json({ error: 'Error fetching packets' });
  }
};

export const getPacketStats = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // WORKER THREAD 4: Try to get cached stats first (fast)
    const { getCachedStats } = await import('../workers/dashboardWorker');
    const cachedStats = await getCachedStats(req.user._id);
    
    if (cachedStats) {
      console.log('Returning cached stats for user:', req.user._id);
      return res.json(cachedStats);
    }

    // Cache miss - fetch from DB (fallback)
    console.log('Fetching packet stats from DB for user:', req.user._id);
    
    // Convert string ID to ObjectId
    const userId = new mongoose.Types.ObjectId(req.user._id);
    
    const stats = await Packet.aggregate([
      {
        $match: { 
          user: userId  // Use the converted ObjectId
        }
      },
      {
        $facet: {
          stats: [
            {
              $group: {
                _id: null,
                totalPackets: { $sum: 1 },
                totalBytes: { $sum: { $add: ['$start_bytes', '$end_bytes'] } },
                avgBytes: { $avg: { $add: ['$start_bytes', '$end_bytes'] } },
                criticalCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'critical'] }, 1, 0] }
                },
                mediumCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'medium'] }, 1, 0] }
                },
                normalCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'normal'] }, 1, 0] }
                },
                maliciousCount: {
                  $sum: { $cond: [{ $eq: ['$is_malicious', true] }, 1, 0] }
                }
              }
            }
          ],
          samplePacket: [
            { $limit: 1 }
          ]
        }
      }
    ]);

    console.log('Raw aggregation result:', JSON.stringify(stats, null, 2));

    // Extract stats from facet result
    const statsResult = stats[0]?.stats[0] || {
      totalPackets: 0,
      totalBytes: 0,
      avgBytes: 0,
      criticalCount: 0,
      mediumCount: 0,
      normalCount: 0,
      maliciousCount: 0
    };

    // Calculate percentages
    const total = statsResult.totalPackets || 1; // Avoid division by zero
    const result = {
      ...statsResult,
      criticalPercentage: (statsResult.criticalCount / total) * 100,
      mediumPercentage: (statsResult.mediumCount / total) * 100,
      normalPercentage: (statsResult.normalCount / total) * 100,
      maliciousPercentage: (statsResult.maliciousCount / total) * 100
    };

    // Format numbers
    result.totalBytes = Math.round(result.totalBytes);
    result.avgBytes = Math.round(result.avgBytes);
    result.criticalPercentage = Math.round(result.criticalPercentage * 100) / 100;
    result.mediumPercentage = Math.round(result.mediumPercentage * 100) / 100;
    result.normalPercentage = Math.round(result.normalPercentage * 100) / 100;
    result.maliciousPercentage = Math.round(result.maliciousPercentage * 100) / 100;

    console.log('Final stats result:', JSON.stringify(result, null, 2));
    
    // Also log a sample packet to verify data structure
    console.log('Sample packet:', JSON.stringify(stats[0]?.samplePacket[0], null, 2));
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching packet stats:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    }
    res.status(500).json({ error: 'Error fetching packet stats' });
  }
};

export const resetPackets = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('Attempting to reset packets for user:', req.user._id);
    const result = await Packet.deleteMany({ user: req.user._id });
    console.log(`Deleted ${result.deletedCount} packets for user ${req.user._id}`);
    
    res.json({ message: 'Packets reset successfully', deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error resetting packets:', error);
    res.status(500).json({ error: 'Error resetting packets' });
  }
}; 