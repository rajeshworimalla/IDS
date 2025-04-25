import express from 'express';
import { getPackets, getPacketStats, resetPackets } from '../controllers/packetController';
import { Packet } from '../models/Packet';
import { authenticate } from '../middleware/auth';

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

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Get packets with filters
router.get('/', getPackets);

// Get packet statistics
router.get('/stats', getPacketStats);

// Get all packets
router.get('/all', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    console.log('Fetching all packets from MongoDB for user:', req.user._id);
    const packets = await Packet.find({ user: req.user._id }).sort({ date: -1 });
    console.log(`Found ${packets.length} packets for user ${req.user._id}`);
    res.json(packets);
  } catch (error) {
    console.error('Error fetching packets:', error);
    res.status(500).json({ error: 'Error fetching packets' });
  }
});

// Filter packets by date range
router.get('/filter', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Missing from or to date parameters' });
    }

    const fromDate = new Date(from as string);
    const toDate = new Date(to as string);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    const packets = await Packet.find({
      user: req.user._id,
      date: {
        $gte: fromDate,
        $lte: toDate
      }
    }).sort({ date: -1 });
    
    res.json(packets);
  } catch (error) {
    console.error('Error filtering packets:', error);
    res.status(500).json({ error: 'Error filtering packets' });
  }
});

// Search packets
router.get('/search', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Missing search query' });
    }

    const searchQuery = q as string;
    
    const packets = await Packet.find({
      user: req.user._id,
      $or: [
        { start_ip: { $regex: searchQuery, $options: 'i' } },
        { end_ip: { $regex: searchQuery, $options: 'i' } },
        { protocol: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ]
    }).sort({ date: -1 });
    
    res.json(packets);
  } catch (error) {
    console.error('Error searching packets:', error);
    res.status(500).json({ error: 'Error searching packets' });
  }
});

// Reset user's packets
router.post('/reset', resetPackets);

// Debug route to check packet count
router.get('/debug/count', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const count = await Packet.countDocuments({ user: req.user._id });
    const sample = await Packet.findOne({ user: req.user._id });
    
    res.json({
      count,
      sample,
      userId: req.user._id
    });
  } catch (error) {
    console.error('Error checking packet count:', error);
    res.status(500).json({ error: 'Error checking packet count' });
  }
});

// Get alerts
router.get('/alerts', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    console.log('Fetching alerts from MongoDB for user:', req.user._id);
    const alerts = await Packet.find({ 
      user: req.user._id,
      $or: [
        { status: 'critical' },
        { status: 'medium' }
      ]
    }).sort({ date: -1 });
    
    // Transform packets into alerts format
    const formattedAlerts = alerts.map(packet => ({
      id: packet._id,
      date: packet.date,
      source: packet.start_ip,
      destination: packet.end_ip,
      protocol: packet.protocol,
      severity: packet.status === 'critical' ? 'critical' : 'medium',
      status: 'open',
      description: packet.description,
      confidence: packet.confidence,
      attack_type: packet.attack_type
    }));
    
    console.log(`Found ${formattedAlerts.length} alerts for user ${req.user._id}`);
    res.json(formattedAlerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Error fetching alerts' });
  }
});

// Get recent alerts
router.get('/alerts/recent', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const limit = parseInt(req.query.limit as string) || 10;
    console.log('Fetching recent alerts from MongoDB for user:', req.user._id);
    
    const alerts = await Packet.find({ 
      user: req.user._id,
      $or: [
        { status: 'critical' },
        { status: 'medium' }
      ]
    })
    .sort({ date: -1 })
    .limit(limit);
    
    // Transform packets into alerts format
    const formattedAlerts = alerts.map(packet => ({
      id: packet._id,
      date: packet.date,
      source: packet.start_ip,
      destination: packet.end_ip,
      protocol: packet.protocol,
      severity: packet.status === 'critical' ? 'critical' : 'medium',
      status: 'open',
      description: packet.description,
      confidence: packet.confidence,
      attack_type: packet.attack_type
    }));
    
    console.log(`Found ${formattedAlerts.length} recent alerts for user ${req.user._id}`);
    res.json(formattedAlerts);
  } catch (error) {
    console.error('Error fetching recent alerts:', error);
    res.status(500).json({ error: 'Error fetching recent alerts' });
  }
});

// Filter alerts by date range
router.get('/alerts/filter', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Missing from or to date parameters' });
    }

    const fromDate = new Date(from as string);
    const toDate = new Date(to as string);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    const alerts = await Packet.find({
      user: req.user._id,
      date: {
        $gte: fromDate,
        $lte: toDate
      },
      $or: [
        { status: 'critical' },
        { status: 'medium' }
      ]
    }).sort({ date: -1 });
    
    // Transform packets into alerts format
    const formattedAlerts = alerts.map(packet => ({
      id: packet._id,
      date: packet.date,
      source: packet.start_ip,
      destination: packet.end_ip,
      protocol: packet.protocol,
      severity: packet.status === 'critical' ? 'critical' : 'medium',
      status: 'open',
      description: packet.description,
      confidence: packet.confidence,
      attack_type: packet.attack_type
    }));
    
    res.json(formattedAlerts);
  } catch (error) {
    console.error('Error filtering alerts:', error);
    res.status(500).json({ error: 'Error filtering alerts' });
  }
});

export default router; 