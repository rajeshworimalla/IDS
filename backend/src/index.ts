import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { createServer } from 'http';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import packetRoutes from './routes/packets';
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
const httpServer = createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

console.log('Starting server with config:', config);

// CORS configuration
const corsOptions = {
  origin: 'http://localhost:5173', // Your frontend URL
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

// Database connection
console.log('Connecting to MongoDB...');
mongoose.connect(config.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    console.log('Database URI:', config.MONGODB_URI);
    
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
httpServer.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
}); 