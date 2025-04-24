import { Server } from 'socket.io';
import { PacketCaptureService } from './services/packetCapture';

let io: Server | null = null;
let packetCapture: PacketCaptureService | null = null;

export function initializeSocket(server: any) {
  if (!io) {
    io = new Server(server, {
      cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 45000,
      transports: ['websocket', 'polling']
    });

    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('start-scanning', () => {
        console.log('Starting packet capture...');
        try {
          // Clean up existing capture if any
          if (packetCapture) {
            packetCapture.stopCapture();
            packetCapture = null;
          }
          
          // Create new capture instance
          packetCapture = new PacketCaptureService();
          packetCapture.startCapture();
          
          // Notify client
          socket.emit('scanning-status', { isScanning: true });
          console.log('Packet capture started successfully');
        } catch (error) {
          console.error('Error starting packet capture:', error);
          socket.emit('scanning-status', { isScanning: false, error: 'Failed to start packet capture' });
        }
      });

      socket.on('stop-scanning', () => {
        console.log('Stopping packet capture...');
        try {
          if (packetCapture) {
            packetCapture.stopCapture();
            packetCapture = null;
          }
          socket.emit('scanning-status', { isScanning: false });
          console.log('Packet capture stopped successfully');
        } catch (error) {
          console.error('Error stopping packet capture:', error);
          socket.emit('scanning-status', { isScanning: true, error: 'Failed to stop packet capture' });
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, 'Reason:', reason);
        try {
          if (packetCapture) {
            packetCapture.stopCapture();
            packetCapture = null;
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
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
}

export function getPacketCapture() {
  return packetCapture;
} 