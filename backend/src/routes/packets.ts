import express from 'express';
import { getPackets, getPacketStats } from '../controllers/packetController';

const router = express.Router();

// Get packets with filters
router.get('/', getPackets);

// Get packet statistics
router.get('/stats', getPacketStats);

export default router; 