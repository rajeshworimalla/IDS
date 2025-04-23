import mongoose from 'mongoose';
import User from './models/User';
import { config } from './config/env';

const createTestUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create test user
    const testUser = new User({
      name: 'New Test User',
      email: 'newtest@example.com',
      password: 'password123',
      role: 'user'
    });

    await testUser.save();
    console.log('Test user created successfully:', {
      id: testUser._id,
      email: testUser.email,
      name: testUser.name
    });

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
};

createTestUser(); 