import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { config } from '../config/env';

// Generate JWT token
const generateToken = (userId: string, role: string): string => {
  // Use the JWT secret from config if not set in env
  const jwtSecret = process.env.JWT_SECRET || config.JWT_SECRET;
  
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not defined in environment variables or config');
  }
  
  console.log('Generating token with:', {
    userId,
    role,
    secretExists: !!jwtSecret,
    secretLength: jwtSecret.length
  });

  const payload = { 
    _id: userId, 
    id: userId, 
    role 
  };
  
  console.log('Token payload:', payload);
  
  const token = jwt.sign(
    payload,
    jwtSecret,
    { 
      expiresIn: '24h',
      algorithm: 'HS256' // Explicitly set the algorithm
    }
  );
  
  console.log('Generated token length:', token.length);
  console.log('Generated token format:', token.split('.').length === 3 ? 'Valid JWT format' : 'Invalid JWT format');
  
  return token;
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Create new user
    const user = new User({
      email,
      password,
      name,
      role: 'user', // Default role
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id.toString(), user.role);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    // Find user
    const user = await User.findOne({ email });
    console.log('User found:', user ? 'Yes' : 'No');
    
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if locked
    if ((user as any).isLocked) {
      const remaining = user.lockUntil ? Math.max(0, Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000)) : 60;
      return res.status(423).json({ message: `Too many failed attempts. Try again in ${remaining}s.` });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    console.log('Password match:', isMatch);
    
    if (!isMatch) {
      console.log('Password mismatch for user:', email);
      await (user as any).incLoginAttempts();
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Success: reset attempts
    await (user as any).resetLoginAttempts();

    // Generate token with correct payload structure
    const token = generateToken(user._id.toString(), user.role);
    console.log('Token generated successfully for user:', email);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

export const logout = (req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
};

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ message: 'Server error fetching user' });
  }
}; 