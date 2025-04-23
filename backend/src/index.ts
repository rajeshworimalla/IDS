import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';

// Load environment variables
dotenv.config();

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

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ids';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    console.log('Database URI:', MONGODB_URI);
    
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

// Routes
app.use('/api/auth', authRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to IDS API' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 