const mongoose = require('mongoose');
const User = require('./src/models/User');

async function createTestUser() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/ids');
    console.log('Connected to MongoDB');

    const user = new User({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'user'
    });

    await user.save();
    console.log('Test user created:', user);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestUser(); 