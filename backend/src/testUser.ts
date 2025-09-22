import mongoose from 'mongoose';
import { User } from './models/User';
import bcrypt from 'bcryptjs';

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/ids', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    } as any);

    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'newtest@example.com' });
    if (existingUser) {
      await User.deleteOne({ email: 'newtest@example.com' });
      console.log('Removed existing test user');
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);

    // Create test user
    const user = new User({
      email: 'newtest@example.com',
      password: hashedPassword,
      name: 'Test User',
      role: 'user',
    });

    await user.save();
    console.log('Test user created successfully:', {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
}

createTestUser(); 