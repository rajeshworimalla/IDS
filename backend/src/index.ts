import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { createServer } from 'http';
import authRoutes from './routes/auth';
import packetRoutes from './routes/packets';
import { config } from './config/env';
import { initializeSocket } from './socket';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

console.log('Starting server with config:', config);

// Enable pre-flight requests for all routes
app.options('*', cors());

// CORS configuration
const corsOptions = {
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['Content-Length', 'X-Requested-With', 'Authorization'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200
};

console.log('Setting up CORS with options:', corsOptions);

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

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