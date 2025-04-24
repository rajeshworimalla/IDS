import mongoose from 'mongoose';
import { User } from '../models/User';
import dotenv from 'dotenv';

dotenv.config();

const createTestUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ids');
    console.log('Connected to MongoDB');

    // Create test user
    const testUser = new User({
      email: 'test@example.com',
      password: 'password123', // This will be hashed automatically
      name: 'Test User',
      role: 'admin',
    });

    await testUser.save();
    console.log('Test user created:', {
      email: testUser.email,
      name: testUser.name,
      role: testUser.role,
      createdAt: testUser.createdAt,
    });

    // Disconnect
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

createTestUser(); 