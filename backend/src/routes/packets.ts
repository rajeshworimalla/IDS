import express from 'express';
import { getPackets, getPacketStats } from '../controllers/packetController';
import { Packet } from '../models/Packet';

const router = express.Router();

// Get packets with filters
router.get('/', getPackets);

// Get packet statistics
router.get('/stats', getPacketStats);

// Get all packets
router.get('/all', async (req, res) => {
  try {
    console.log('Fetching all packets from MongoDB...');
    const packets = await Packet.find().sort({ date: -1 });
    console.log(`Found ${packets.length} packets`);
    res.json(packets);
  } catch (error) {
    console.error('Error fetching packets:', error);
    res.status(500).json({ error: 'Error fetching packets' });
  }
});

// Filter packets by date range
router.get('/filter', async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = new Date(from as string);
    const toDate = new Date(to as string);
    
    const packets = await Packet.find({
      date: {
        $gte: fromDate,
        $lte: toDate
      }
    }).sort({ date: -1 });
    
    res.json(packets);
  } catch (error) {
    res.status(500).json({ error: 'Error filtering packets' });
  }
});

// Search packets
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const searchQuery = q as string;
    
    const packets = await Packet.find({
      $or: [
        { start_ip: { $regex: searchQuery, $options: 'i' } },
        { end_ip: { $regex: searchQuery, $options: 'i' } },
        { protocol: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ]
    }).sort({ date: -1 });
    
    res.json(packets);
  } catch (error) {
    res.status(500).json({ error: 'Error searching packets' });
  }
});

// Reset all packets
router.post('/reset', async (req, res) => {
  try {
    console.log('Attempting to reset packets...');
    const result = await Packet.deleteMany({});
    console.log(`Deleted ${result.deletedCount} packets`);
    res.json({ message: 'All packets cleared successfully', deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error clearing packets:', error);
    res.status(500).json({ error: 'Error clearing packets' });
  }
});

export default router; 