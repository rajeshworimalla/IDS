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
    
    // PERFORMANCE: Limit query to prevent fetching 50k+ documents
    const limit = parseInt(req.query.limit as string) || 1000; // Default 1000, max 5000
    const maxLimit = Math.min(limit, 5000);
    
    console.log(`Fetching packets from MongoDB for user: ${req.user._id} (limit: ${maxLimit})`);
    const packets = await Packet.find({ user: req.user._id })
      .sort({ date: -1 })
      .limit(maxLimit);
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

// Get alerts with filtering support
router.get('/alerts', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { severity, status, from, to, timeRange, sourceIP, destinationIP } = req.query;
    
    // Build filter query
    const filter: any = { user: req.user._id };
    
    // Add source IP filter
    if (sourceIP && String(sourceIP).trim()) {
      filter.start_ip = { $regex: String(sourceIP).trim(), $options: 'i' };
    }
    
    // Add destination IP filter
    if (destinationIP && String(destinationIP).trim()) {
      filter.end_ip = { $regex: String(destinationIP).trim(), $options: 'i' };
    }
    
    // Add severity filters
    if (severity) {
      const severities = Array.isArray(severity) ? severity : [severity];
      const statusFilters = severities
        .map((sev) => {
          const sevStr = String(sev);
          if (sevStr === 'critical' || sevStr === 'high') return { status: 'critical' };
          if (sevStr === 'medium') return { status: 'medium' };
          if (sevStr === 'low') return { status: 'normal' };
          return null;
        })
        .filter(Boolean);
      
      if (statusFilters.length > 0) {
        filter.$or = statusFilters;
      }
    } else {
      // Default: only show critical and medium severity alerts
      filter.$or = [
        { status: 'critical' },
        { status: 'medium' }
      ];
    }
    
    // Add date range filters
    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    
    if (from && to) {
      fromDate = new Date(String(from));
      toDate = new Date(String(to));
    } else if (timeRange) {
      toDate = new Date();
      const now = new Date();
      
      const timeRangeStr = String(timeRange);
      switch (timeRangeStr) {
        case '1h':
          fromDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
        default:
          // No date filter for 'all'
          break;
      }
    }
    
    if (fromDate && toDate) {
      filter.date = {
        $gte: fromDate,
        $lte: toDate
      };
    }
    
    // PERFORMANCE: Limit query to prevent fetching 50k+ documents
    const limit = parseInt(req.query.limit as string) || 500; // Default 500 alerts
    const maxLimit = Math.min(limit, 5000); // Max 5000
    
    // WORKER THREAD 4: Try to get cached alerts first (fast)
    // Only use cache if no filters are applied (cache contains recent alerts only)
    const hasFilters = severity || status || from || to || timeRange || sourceIP || destinationIP;
    if (!hasFilters) {
      const { getCachedAlerts } = await import('../workers/dashboardWorker');
      const cachedAlerts = await getCachedAlerts(req.user._id);
      if (cachedAlerts) {
        console.log(`Returning cached alerts for user: ${req.user._id}`);
        // Return cached alert stats (not full alerts, but summary)
        return res.json({
          critical: cachedAlerts.critical || 0,
          high: cachedAlerts.high || 0,
          medium: cachedAlerts.medium || 0,
          low: cachedAlerts.low || 0,
          total: cachedAlerts.total || 0,
          cached: true
        });
      }
    }
    
    console.log(`Fetching alerts from MongoDB for user: ${req.user._id} (limit: ${maxLimit})`);
    const alerts = await Packet.find(filter)
      .sort({ date: -1 })
      .limit(maxLimit);
    
    // Transform packets into alerts format
    const formattedAlerts = alerts.map(packet => {
      let severity = 'low';
      let alertStatus = 'active';
      
      // Map packet status to alert severity
      if (packet.status === 'critical') severity = 'critical';
      else if (packet.status === 'medium') severity = 'medium';
      else if (packet.status === 'normal') severity = 'low';
      
      // Set default alert status (packets don't have investigation status)
      alertStatus = 'active'; // Default status for new alerts
      
      return {
        _id: packet._id,
        id: packet._id,
        date: packet.date,
        source: packet.start_ip,
        destination: packet.end_ip,
        protocol: packet.protocol,
        severity,
        status: alertStatus,
        description: packet.description,
        confidence: packet.confidence,
        attack_type: packet.attack_type,
        type: packet.attack_type || 'Network Anomaly',
        timestamp: packet.date
      };
    });
    
    // Apply status filter on formatted alerts if specified
    let filteredAlerts = formattedAlerts;
    if (status) {
      const statusArray = Array.isArray(status) ? status : [status];
      const statusStrings = statusArray.map(s => String(s));
      if (statusStrings.length > 0) {
        filteredAlerts = formattedAlerts.filter(alert => 
          statusStrings.includes(alert.status)
        );
      }
    }
    
    console.log(`Found ${filteredAlerts.length} alerts for user ${req.user._id}`);
    res.json(filteredAlerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Error fetching alerts' });
  }
});

// Get packet capture status
router.get('/capture-status', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Import userCaptures from socket.ts
    const { getUserCaptureStatus } = await import('../socket');
    const status = getUserCaptureStatus ? getUserCaptureStatus(req.user._id) : null;
    
    // Also check recent packet activity
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentPacketCount = await Packet.countDocuments({
      user: req.user._id,
      date: { $gte: oneMinuteAgo }
    });
    
    res.json({
      isCapturing: status?.isCapturing || false,
      lastPacketTime: status?.lastPacketTime || null,
      recentPacketCount,
      hasRecentActivity: recentPacketCount > 0
    });
  } catch (error) {
    console.error('Error getting capture status:', error);
    res.status(500).json({ error: 'Error getting capture status' });
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