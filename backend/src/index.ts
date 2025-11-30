import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { createServer } from 'http';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import packetRoutes from './routes/packets';
import settingsRoutes from './routes/settings';
import ipsRoutes from './routes/ips';
import eventsRoutes from './routes/events';
import { firewall } from './services/firewall';
import { BlockedIP } from './models/BlockedIP';
import { config } from './config/env';
import { initializeSocket } from './socket';
import { startSchedulers } from './workers/scheduler';

// Load environment variables
dotenv.config();

// CRITICAL: Global error handlers to prevent crashes during attacks
process.on('uncaughtException', (error: Error) => {
  console.error('❌ UNCAUGHT EXCEPTION - Backend will continue running:', error);
  console.error('Stack:', error.stack);
  console.error('⚠️  Backend is still running - packet capture may need to be restarted');
  // Don't exit - keep the server running
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ UNHANDLED REJECTION - Backend will continue running:', reason);
  console.error('⚠️  Backend is still running - packet capture may need to be restarted');
  // Don't exit - keep the server running
});

// Handle SIGTERM gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

// Handle SIGINT gracefully
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Set environment variables from config if not already set
process.env.JWT_SECRET = process.env.JWT_SECRET || config.JWT_SECRET;
process.env.MONGODB_URI = process.env.MONGODB_URI || config.MONGODB_URI;
process.env.PORT = process.env.PORT || config.PORT.toString();

console.log('Starting server with config:', {
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET ? '***' : 'Not set',
  PORT: process.env.PORT
});

const app = express();
const server = createServer(app);

// Trust proxy to respect X-Forwarded-For from nginx
app.set('trust proxy', true);

// Initialize Socket.IO
initializeSocket(server);

console.log('Starting server with config:', config);

// CORS configuration
// Allow all origins (demo sites on LAN, different ports, etc.)
const corsOptions = {
  origin: true as any,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'Authorization'],
  maxAge: 86400, // 24 hours
  // Let CORS terminate preflight with 204 instead of passing to auth-protected routers
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Apply CORS middleware
app.use(cors(corsOptions));
// Handle generic OPTIONS early
app.options('*', cors(corsOptions));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate-limit and auto-ban middleware (Redis-based)
(async () => {
  try {
    const { rateLimitMiddleware } = await import('./middleware/rateLimit');
    app.use(rateLimitMiddleware);
  } catch (e) {
    console.error('Rate limit middleware failed to init:', e);
  }
})();

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

console.log('Setting up routes...');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/packets', packetRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ips', ipsRoutes);
app.use('/api/events', eventsRoutes);

// Database connection
console.log('Connecting to MongoDB...');
mongoose.connect(config.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
} as any)
  .then(async () => {
    console.log('Connected to MongoDB');
    console.log('Database URI:', config.MONGODB_URI);

    // Ensure firewall base rules and sync existing blocked IPs
    try {
      await firewall.ensureBaseRules();
      const items = await BlockedIP.find({});
      const v4: string[] = [];
      const v6: string[] = [];
      for (const item of items) {
        // naive split based on validator
        if ((item.ip || '').includes(':')) v6.push(item.ip);
        else v4.push(item.ip);
      }
      await firewall.syncFromDB({ v4, v6 });
      console.log(`Synced firewall with ${v4.length + v6.length} blocked IP(s).`);
    } catch (e) {
      console.error('Failed to ensure firewall rules or sync blocklist:', e);
    }
    
    // Start background worker schedulers
    startSchedulers();
    console.log('✅ Worker-based architecture initialized');
    
    // Verify the database exists
    const db = mongoose.connection.db;
    db.listCollections().toArray()
      .then((collections) => {
        console.log('Available collections:', collections.map((c: { name: string }) => c.name));
      })
      .catch((error) => {
        console.error('Error listing collections:', error);
      });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    console.log('Please make sure:');
    console.log('1. MongoDB is installed and running');
    console.log('2. The MongoDB service is started');
    console.log('3. You can connect to mongodb://localhost:27017');
    process.exit(1);
  });

// Basic route
app.get('/', (req, res) => {
  console.log('Received request to root endpoint');
  res.json({ message: 'Welcome to IDS API' });
});

// Start server
console.log('Starting HTTP server...');
server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${config.PORT}`);
}); 