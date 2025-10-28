import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        id: string;
        role: string;
      };
    }
  }
}

export const auth = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Allow CORS preflight requests to pass through without auth
    if (req.method === 'OPTIONS') {
      return next();
    }

    // Get token from header
    const authHeader = req.header('Authorization');
    console.log('Auth header:', authHeader);
    
    const token = authHeader?.replace('Bearer ', '');
    console.log('Extracted token:', token ? 'Token exists' : 'No token');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Use the JWT secret from config if not set in env
    const jwtSecret = process.env.JWT_SECRET || config.JWT_SECRET;
    console.log('Using JWT secret:', jwtSecret ? 'Secret exists' : 'No secret');

    if (!jwtSecret) {
      console.error('JWT_SECRET is not defined in environment variables or config');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    console.log('Token length:', token.length);
    console.log('Token format:', token.split('.').length === 3 ? 'Valid JWT format' : 'Invalid JWT format');

    // Verify token
    try {
      const decoded = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256']
      }) as {
        _id: string;
        id: string;
        role: string;
      };
      console.log('Decoded token:', decoded);

      // Validate decoded token structure
      if (!decoded._id || !decoded.id || !decoded.role) {
        console.error('Invalid token structure:', decoded);
        return res.status(401).json({ message: 'Invalid token structure' });
      }

      // Add user to request
      req.user = {
        _id: decoded._id,
        id: decoded.id,
        role: decoded.role
      };

      next();
    } catch (verifyError) {
      console.error('Token verification error:', verifyError);
      if (verifyError instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ message: 'Invalid token' });
      }
      if (verifyError instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ message: 'Token expired' });
      }
      return res.status(401).json({ message: 'Token verification failed' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Server error during authentication' });
  }
};

// Export authenticate as an alias for auth
export const authenticate = auth;

// Middleware to check if user is admin
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  
  next();
}; 
