import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';
import packetRoutes from './routes/packets';
import httpServer from './socket';
import { PacketCaptureService } from './services/packetCapture';
import { config } from './config/env';

const app = express();

// CORS configuration
const corsOptions = {
  origin: 'http://localhost:5173', // Vite's default port
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/packets', packetRoutes);

// Database connection
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

    // Start packet capture
    const packetCapture = new PacketCaptureService();
    packetCapture.startCapture();
    console.log('Real packet capture started');
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
  res.json({ message: 'Welcome to IDS API' });
});

// Start server
httpServer.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
}); 