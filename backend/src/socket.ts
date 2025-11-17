import { Server, Socket } from 'socket.io';
import { PacketCaptureService } from './services/packetCapture';
import { authenticate } from './middleware/auth';
import jwt from 'jsonwebtoken';
import { config } from './config/env';

let io: Server | null = null;
const userCaptures: { [userId: string]: PacketCaptureService } = {};

// Socket authentication middleware
const authenticateSocket = (socket: Socket, next: (err?: Error) => void) => {
  try {
    // Try to get token from auth first, then from headers
    const authToken = socket.handshake.auth.token;
    const headerToken = socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    const token = authToken || headerToken;
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    // Use the JWT secret from config if not set in env
    const jwtSecret = process.env.JWT_SECRET || config.JWT_SECRET;
    console.log('Using JWT secret for socket auth:', jwtSecret ? 'Secret exists' : 'No secret');

    if (!jwtSecret) {
      return next(new Error('Authentication error: JWT secret not configured'));
    }

    try {
      const decoded = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256']
      }) as {
        _id: string;
        id: string;
        role: string;
      };

      if (!decoded._id || !decoded.id || !decoded.role) {
        return next(new Error('Authentication error: Invalid token structure'));
      }

      socket.data.user = {
        _id: decoded._id,
        id: decoded.id,
        role: decoded.role
      };

      next();
    } catch (error) {
      console.error('Socket auth error:', error);
      if (error instanceof jwt.JsonWebTokenError) {
        return next(new Error('Authentication error: Invalid token'));
      }
      if (error instanceof jwt.TokenExpiredError) {
        return next(new Error('Authentication error: Token expired'));
      }
      return next(new Error('Authentication error: Unknown error'));
    }
  } catch (error) {
    console.error('Socket auth error:', error);
    return next(new Error('Authentication error: Unknown error'));
  }
};

export function initializeSocket(server: any) {
  if (!io) {
    io = new Server(server, {
      cors: {
        origin: true, // Allow all origins (localhost, IP addresses, etc.)
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["Authorization"]
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 45000,
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      cookie: {
        name: "io",
        path: "/",
        httpOnly: true,
        sameSite: "lax"
      }
    });

    // Apply authentication middleware
    io.use(authenticateSocket);

    io.on('connection', (socket) => {
      const userId = socket.data.user._id;
      console.log('Client connected:', socket.id, 'User:', userId);

      // Join user to their own room for targeted broadcasts
      socket.join(`user_${userId}`);

      socket.on('start-scanning', (data) => {
        console.log('Starting packet capture for user:', userId);
        try {
          // Verify token
          if (!data.token) {
            throw new Error('No token provided');
          }

          // Clean up existing capture if any
          if (userCaptures[userId]) {
            console.log('Stopping existing capture for user:', userId);
            userCaptures[userId].stopCapture();
            delete userCaptures[userId];
          }

          // Create new capture instance for this user
          console.log('Creating new packet capture service for user:', userId);
          userCaptures[userId] = new PacketCaptureService(userId);
          userCaptures[userId].startCapture();

          // Notify client
          socket.emit('scanning-status', { isScanning: true });
          console.log('Packet capture started successfully for user:', userId);
        } catch (error) {
          console.error('Error starting packet capture:', error);
          socket.emit('scanning-status', { isScanning: false, error: `Failed to start packet capture: ${error}` });
        }
      });

      socket.on('stop-scanning', (data) => {
        console.log('Stopping packet capture for user:', userId);
        try {
          // Verify token
          if (!data.token) {
            throw new Error('No token provided');
          }

          if (userCaptures[userId]) {
            userCaptures[userId].stopCapture();
            delete userCaptures[userId];
          }
          socket.emit('scanning-status', { isScanning: false });
          console.log('Packet capture stopped successfully for user:', userId);
        } catch (error) {
          console.error('Error stopping packet capture:', error);
          socket.emit('scanning-status', { isScanning: true, error: 'Failed to stop packet capture' });
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, 'User:', userId, 'Reason:', reason);
        try {
          if (userCaptures[userId]) {
            userCaptures[userId].stopCapture();
            delete userCaptures[userId];
          }
        } catch (error) {
          console.error('Error stopping packet capture on disconnect:', error);
        }
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    });
  }
  return io;
}

export function getIO() {
  if (!io) {
    console.error('Socket.IO not initialized');
    return null;
  }
  return io;
}

export function getPacketCapture(userId: string) {
  return userCaptures[userId];
} 