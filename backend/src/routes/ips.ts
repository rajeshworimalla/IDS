import express from 'express';
import { authenticate } from '../middleware/auth';
import { getBlockedIPs, blockIP, unblockIP } from '../controllers/ipController';

const router = express.Router();

router.use(authenticate);

router.get('/blocked', getBlockedIPs);
router.post('/block', blockIP);
router.delete('/block/:ip', unblockIP);

export default router;