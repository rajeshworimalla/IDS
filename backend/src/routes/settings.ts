import express from 'express';
import { authenticate } from '../middleware/auth';
import { getSettings, updateSettings, resetSettings, recreateIndexes } from '../controllers/settingsController';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Get all settings
router.get('/', getSettings);

// Update settings
router.put('/', updateSettings);

// Reset settings to default
router.post('/reset', resetSettings);

// Recreate indexes
router.post('/recreate-indexes', recreateIndexes);

export default router; 