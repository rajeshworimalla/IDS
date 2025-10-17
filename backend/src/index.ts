import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { createServer } from 'http';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import packetRoutes from './routes/packets';
import settingsRoutes from './routes/settings';
import ipsRoutes from './routes/ips';
import { firewall } from './services/firewall';
import { BlockedIP } from './models/BlockedIP';
import { config } from './config/env';
import { initializeSocket } from './socket';

// Load environment variables
dotenv.config();

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

// Initialize Socket.IO
initializeSocket(server);

console.log('Starting server with config:', config);

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'Authorization'],
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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