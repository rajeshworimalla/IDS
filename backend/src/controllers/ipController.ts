import { Request, Response } from 'express';
import { BlockedIP } from '../models/BlockedIP';
import { isIP } from 'net';

// Extend Express Request type to include user
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

export const getBlockedIPs = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });

    const items = await BlockedIP.find({ user: req.user._id }).sort({ blockedAt: -1 });
    const result = items.map(item => ({ ip: item.ip, reason: item.reason, blockedAt: item.blockedAt }));
    return res.json(result);
  } catch (e) {
    console.error('getBlockedIPs error:', e);
    return res.status(500).json({ error: 'Failed to fetch blocked IPs' });
  }
};

export const blockIP = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    const { ip, reason } = req.body as { ip?: string; reason?: string };
    if (!ip) return res.status(400).json({ error: 'ip is required' });

    // Validate IPv4/IPv6
    if (isIP(ip) === 0) {
      return res.status(400).json({ error: 'Invalid IP address' });
    }

    const doc = await BlockedIP.findOneAndUpdate(
      { user: req.user._id, ip },
      { $setOnInsert: { reason, blockedAt: new Date() }, $set: { reason } },
      { new: true, upsert: true }
    );

    return res.status(201).json({ ip: doc.ip, reason: doc.reason, blockedAt: doc.blockedAt });
  } catch (e: any) {
    console.error('blockIP error:', e);
    // Handle duplicate key
    if (e?.code === 11000) {
      return res.status(200).json({ message: 'Already blocked' });
    }
    return res.status(500).json({ error: 'Failed to block IP' });
  }
};

export const unblockIP = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    const { ip } = req.params;
    if (!ip) return res.status(400).json({ error: 'ip param is required' });

    await BlockedIP.deleteOne({ user: req.user._id, ip });
    return res.json({ message: 'Unblocked' });
  } catch (e) {
    console.error('unblockIP error:', e);
    return res.status(500).json({ error: 'Failed to unblock IP' });
  }
};