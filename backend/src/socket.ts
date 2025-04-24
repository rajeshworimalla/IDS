import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { PacketCaptureService } from './services/packetCapture';

const app = express();
const httpServer = createServer(app);
let packetCapture: PacketCaptureService | null = null;

export const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173", // Your frontend URL
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket: Socket) => {
  console.log('Client connected:', socket.id);

  socket.on('start-scanning', () => {
    console.log('Starting packet capture...');
    if (!packetCapture) {
      packetCapture = new PacketCaptureService();
    }
    packetCapture.startCapture();
    socket.emit('scanning-status', { isScanning: true });
  });

  socket.on('stop-scanning', () => {
    console.log('Stopping packet capture...');
    if (packetCapture) {
      packetCapture.stopCapture();
    }
    socket.emit('scanning-status', { isScanning: false });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Stop scanning when client disconnects to prevent orphaned captures
    if (packetCapture) {
      packetCapture.stopCapture();
    }
  });
});

export default httpServer; 