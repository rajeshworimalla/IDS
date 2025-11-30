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

// Get system information
router.get('/system-info', (req, res) => {
  const { config } = require('../config/env');
  const os = require('os');
  
  res.json({
    backend: {
      port: config.PORT,
      host: '0.0.0.0',
      url: `http://${os.networkInterfaces()?.[Object.keys(os.networkInterfaces())[0]]?.[0]?.address || 'localhost'}:${config.PORT}`,
      status: 'running'
    },
    frontend: {
      port: process.env.FRONTEND_PORT || 3000,
      url: `http://${os.networkInterfaces()?.[Object.keys(os.networkInterfaces())[0]]?.[0]?.address || 'localhost'}:${process.env.FRONTEND_PORT || 3000}`
    },
    mlService: {
      port: 5002,
      url: 'http://127.0.0.1:5002'
    },
    database: {
      type: 'MongoDB',
      uri: config.MONGODB_URI.replace(/\/\/.*@/, '//***@'), // Hide credentials
      status: 'connected'
    },
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch()
    }
  });
});

export default router; 