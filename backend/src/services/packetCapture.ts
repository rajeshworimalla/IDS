import { Cap } from 'cap';
import { Packet as PacketModel, IPacket } from '../models/Packet';
import { getIO } from '../socket';
import axios from 'axios';

// Track packet frequencies for status determination
const packetFrequencies: { [key: string]: { count: number; timestamp: number } } = {};

export class PacketCaptureService {
  private cap: Cap;
  private isCapturing: boolean = false;
  private linkType: string;
  private buffer: Buffer;
  private predictionServiceUrl: string;
  private packetHandler: ((nbytes: number, trunc: boolean) => void) | null = null;
  private userId: string;

  constructor(userId: string) {
    this.cap = new Cap();
    this.linkType = 'ETHERNET';
    this.buffer = Buffer.alloc(65535);
    this.predictionServiceUrl = 'http://127.0.0.1:5002/predict';
    this.userId = userId;
    
    // List all available interfaces
    const interfaces = Cap.deviceList();
    console.log('Available network interfaces:', interfaces);

    if (!interfaces || interfaces.length === 0) {
      throw new Error('No network interfaces found. Please make sure:\n' +
        '1. You are running the application with administrative privileges\n' +
        '2. WinPcap or Npcap is installed\n' +
        '3. You have at least one network interface enabled');
    }

    // Use the first available interface
    const device = interfaces[0].name;
    console.log('Using network interface:', device);

    const filter = 'ip';
    const bufSize = 10 * 1024 * 1024;

    try {
      this.cap.open(device, filter, bufSize, this.buffer);
      if (this.cap.setMinBytes) {
        this.cap.setMinBytes(0);
      }
      console.log('Successfully opened capture device');
    } catch (err) {
      const error = err as Error;
      console.error('Error opening capture device:', error);
      throw new Error(`Failed to open capture device: ${error.message || 'Unknown error'}`);
    }
  }

  startCapture() {
    if (this.isCapturing) {
      console.log('Packet capture already running');
      return;
    }
    
    this.isCapturing = true;
    console.log('Starting packet capture...');

    // Create new packet handler
    this.packetHandler = (nbytes: number, trunc: boolean) => {
      if (nbytes === 0) return;

      try {
        const raw = this.buffer.slice(0, nbytes);
        this.processPacket(raw);
      } catch (err) {
        const error = err as Error;
        console.error('Error processing packet:', error);
      }
    };

    // Add the packet handler
    this.cap.on('packet', this.packetHandler);
  }

  stopCapture() {
    if (!this.isCapturing) {
      console.log('Packet capture not running');
      return;
    }
    
    this.isCapturing = false;
    console.log('Stopping packet capture...');
    
    try {
      // Close the capture device - this will automatically remove all listeners
      this.cap.close();
      
      // Reset the buffer
      this.buffer.fill(0);
      
      // Reset the packet handler
      this.packetHandler = null;
      
      console.log('Packet capture stopped successfully');
    } catch (err) {
      const error = err as Error;
      console.error('Error stopping packet capture:', error);
      throw error;
    }
  }

  private async processPacket(raw: Buffer) {
    try {
      // Skip packets that are too small to contain IP headers
      if (raw.length < 34) return;

      const packetData = {
        date: new Date(),
        start_ip: this.getSourceIP(raw),
        end_ip: this.getDestinationIP(raw),
        protocol: this.getProtocol(raw),
        frequency: this.updateFrequency(this.getSourceIP(raw)),
        status: 'normal',
        description: this.generateDescription(raw),
        start_bytes: raw.length,
        end_bytes: raw.length,
        is_malicious: false,
        attack_type: 'normal',
        confidence: 0,
        user: this.userId
      };

      // Determine status based on protocol and frequency
      packetData.status = this.determineStatus(packetData);

      // Save to MongoDB
      const savedPacket = await PacketModel.create(packetData);

      try {
        // Get predictions from ML service
        const response = await axios.post(this.predictionServiceUrl, {
          packet: packetData
        });
        const predictions = response.data;

        // Update packet with predictions
        savedPacket.is_malicious = predictions.binary_prediction === 'malicious';
        savedPacket.attack_type = predictions.attack_type;
        savedPacket.confidence = predictions.confidence.binary;

        // Update in MongoDB
        await savedPacket.save();
      } catch (err) {
        console.error('Error getting predictions:', err);
      }
      
      // Broadcast to connected clients
      const io = getIO();
      if (io) {
        console.log('Emitting new packet to clients');
        io.emit('new-packet', savedPacket);
      } else {
        console.error('Socket.IO not initialized');
      }
    } catch (err) {
      const error = err as Error;
      console.error('Error saving packet:', error);
    }
  }

  private getSourceIP(raw: Buffer): string {
    // Skip Ethernet header (14 bytes) and get source IP from IP header
    const offset = 14;
    return `${raw[offset + 12]}.${raw[offset + 13]}.${raw[offset + 14]}.${raw[offset + 15]}`;
  }

  private getDestinationIP(raw: Buffer): string {
    // Skip Ethernet header (14 bytes) and get destination IP from IP header
    const offset = 14;
    return `${raw[offset + 16]}.${raw[offset + 17]}.${raw[offset + 18]}.${raw[offset + 19]}`;
  }

  private getProtocol(raw: Buffer): string {
    // Skip Ethernet header (14 bytes) and get protocol from IP header
    const offset = 14;
    const protocol = raw[offset + 9];
    switch (protocol) {
      case 6: return 'TCP';
      case 17: return 'UDP';
      case 1: return 'ICMP';
      default: return 'OTHER';
    }
  }

  private updateFrequency(ip: string): number {
    const now = Date.now();
    const key = `${ip}-${Math.floor(now / 60000)}`; // Group by minute

    if (!packetFrequencies[key]) {
      packetFrequencies[key] = { count: 0, timestamp: now };
    }

    packetFrequencies[key].count++;
    return packetFrequencies[key].count;
  }

  private determineStatus(packet: { protocol: string; frequency: number }): 'critical' | 'medium' | 'normal' {
    // Critical conditions
    if (packet.protocol === 'TCP' && packet.frequency > 20) return 'critical';
    if (packet.protocol === 'UDP' && packet.frequency > 40) return 'critical';
    
    // Medium conditions
    if (packet.protocol === 'TCP' && packet.frequency > 10) return 'medium';
    if (packet.protocol === 'UDP' && packet.frequency > 20) return 'medium';
    
    // Normal by default
    return 'normal';
  }

  private generateDescription(raw: Buffer): string {
    const protocol = this.getProtocol(raw);
    const offset = 14; // Skip Ethernet header
    
    // Get source and destination ports for TCP/UDP
    if (protocol === 'TCP' || protocol === 'UDP') {
      const srcPort = raw.readUInt16BE(offset + 20);
      const dstPort = raw.readUInt16BE(offset + 22);
      return `${protocol} ${srcPort} -> ${dstPort}`;
    }
    
    return `${protocol} packet`;
  }
} 