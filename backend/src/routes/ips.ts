import express from 'express';
import { authenticate } from '../middleware/auth';
import { getBlockedIPs, blockIP, unblockIP } from '../controllers/ipController';

const router = express.Router();

router.use(authenticate);

router.get('/blocked', getBlockedIPs);
router.post('/block', blockIP);
router.delete('/block/:ip', unblockIP);

// Policy endpoints for automatic blocking
router.get('/policy', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    const { getPolicy } = await import('../services/policy');
    const p = await getPolicy();
    res.json(p);
  } catch (e) {
    console.error('get policy error', e);
    res.status(500).json({ error: 'Failed to get policy' });
  }
});

router.put('/policy', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
    const { setPolicy, getPolicy } = await import('../services/policy');
    await setPolicy(req.body || {});
    const p = await getPolicy();
    res.json(p);
  } catch (e) {
    console.error('set policy error', e);
    res.status(500).json({ error: 'Failed to set policy' });
  }
});

export default router;
