import { Cap } from 'cap';
import { Packet as PacketModel, IPacket } from '../models/Packet';
import { io } from '../socket';

// Track packet frequencies for status determination
const packetFrequencies: { [key: string]: { count: number; timestamp: number } } = {};

export class PacketCaptureService {
  private cap: Cap;
  private isCapturing: boolean = false;
  private linkType: string;
  private buffer: Buffer;

  constructor() {
    this.cap = new Cap();
    this.linkType = 'ETHERNET';
    this.buffer = Buffer.alloc(65535);
    
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
    if (this.isCapturing) return;
    this.isCapturing = true;

    this.cap.on('packet', (nbytes: number, trunc: boolean) => {
      if (nbytes === 0) return;

      try {
        const raw = this.buffer.slice(0, nbytes);
        this.processPacket(raw);
      } catch (err) {
        const error = err as Error;
        console.error('Error processing packet:', error);
      }
    });
  }

  stopCapture() {
    if (!this.isCapturing) return;
    this.cap.close();
    this.isCapturing = false;
  }

  private async processPacket(raw: Buffer) {
    try {
      // Skip packets that are too small to contain IP headers
      if (raw.length < 34) return;

      const packetData: IPacket = {
        date: new Date(),
        start_ip: this.getSourceIP(raw),
        end_ip: this.getDestinationIP(raw),
        protocol: this.getProtocol(raw),
        frequency: this.updateFrequency(this.getSourceIP(raw)),
        status: 'normal',
        description: this.generateDescription(raw),
        start_bytes: raw.length,
        end_bytes: 0
      };

      // Determine status based on protocol and frequency
      packetData.status = this.determineStatus(packetData);

      // Save to MongoDB
      const savedPacket = await PacketModel.create(packetData);
      
      // Broadcast to connected clients
      io.emit('new-packet', savedPacket);
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

  private determineStatus(packet: IPacket): 'critical' | 'medium' | 'normal' {
    // Critical conditions
    if (packet.protocol === 'TCP' && packet.frequency > 10) return 'critical';
    if (packet.protocol === 'UDP' && packet.frequency > 20) return 'critical';
    
    // Medium conditions
    if (packet.protocol === 'TCP' && packet.frequency > 5) return 'medium';
    if (packet.protocol === 'UDP' && packet.frequency > 10) return 'medium';
    
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