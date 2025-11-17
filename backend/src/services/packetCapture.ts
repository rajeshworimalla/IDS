import { Cap } from 'cap';
import { Packet as PacketModel, IPacket } from '../models/Packet';
import { getIO } from '../socket';
import axios from 'axios';

// Track packet frequencies for status determination with automatic cleanup
const packetFrequencies: { [key: string]: { count: number; timestamp: number } } = {};

// Cleanup old frequency data every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const tenMinutesAgo = Math.floor(now / 60000) - 10;

  Object.keys(packetFrequencies).forEach(key => {
    const keyMinute = parseInt(key.split('-').pop() || '0');
    if (keyMinute < tenMinutesAgo) {
      delete packetFrequencies[key];
    }
  });
}, 300000); // Run every 5 minutes

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

    // Initialize the capture device
    this.initializeCapture();
  }

  private initializeCapture() {
    const interfaces = Cap.deviceList();
    console.log('Available network interfaces:', interfaces);

    if (!interfaces || interfaces.length === 0) {
      throw new Error('No network interfaces found. Please make sure:\n' +
        '1. You are running the application with administrative privileges\n' +
        '2. WinPcap or Npcap is installed\n' +
        '3. You have at least one network interface enabled');
    }

    const interfacePreferences = [
    (iface: any) =>
      iface.addresses &&
      iface.addresses.length > 0 &&
      !iface.name?.toLowerCase().includes('loopback') &&
      !iface.description?.toLowerCase().includes('loopback') &&
      !iface.description?.toLowerCase().includes('miniport') &&
      !iface.description?.toLowerCase().includes('virtual') &&
      !iface.description?.toLowerCase().includes('vmware') &&
      !iface.description?.toLowerCase().includes('virtualbox') &&
      (iface.description?.toLowerCase().includes('wi-fi') ||
      iface.description?.toLowerCase().includes('ethernet') ||
      iface.description?.toLowerCase().includes('realtek') ||
      iface.description?.toLowerCase().includes('intel')),

    (iface: any) =>
      iface.addresses &&
      iface.addresses.length > 0 &&
      !iface.name?.toLowerCase().includes('loopback') &&
      !iface.description?.toLowerCase().includes('loopback'),

    (iface: any) =>
      !iface.name?.toLowerCase().includes('loopback') &&
      !iface.description?.toLowerCase().includes('loopback'),

    () => true
    ];

    let selectedInterface = null;
    let lastError = null;

    for (const preference of interfacePreferences) {
      const candidates = interfaces.filter(preference);

      for (const candidate of candidates) {
        try {
          console.log(`Trying interface: ${candidate.name} (${candidate.description})`);
          console.log('Interface addresses:', candidate.addresses);

          const device = candidate.name;
          const filter = '';  // Empty filter captures all packets
          const bufSize = 10 * 1024 * 1024;

          console.log('Opening capture device with filter:', filter || 'none');
          this.cap.open(device, filter, bufSize, this.buffer);

          // Set minimum bytes to capture immediately
          if (this.cap.setMinBytes) {
            this.cap.setMinBytes(0);
            console.log('Set minimum bytes to 0 for immediate capture');
          }

          // Try to set non-blocking mode if available
          if ('setNonBlock' in this.cap && typeof (this.cap as any).setNonBlock === 'function') {
            try {
              (this.cap as any).setNonBlock(true);
              console.log('Set non-blocking mode');
            } catch (err) {
              console.log('Could not set non-blocking mode:', err);
            }
          }

          selectedInterface = candidate;
          console.log('Successfully opened capture device:', device);
          break;
        } catch (err) {
          lastError = err;
          console.log(`Failed to open interface ${candidate.name}:`, err);
          continue;
        }
      }

      if (selectedInterface) break;
    }

    if (!selectedInterface) {
      throw new Error(`Failed to open any capture device. Last error: ${lastError}`);
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
      console.log(`Captured packet: ${nbytes} bytes, truncated: ${trunc}`);

      if (nbytes === 0) {
        console.log('Received packet with 0 bytes, skipping');
        return;
      }

      try {
        const raw = this.buffer.slice(0, nbytes);
        console.log(`Processing packet of ${raw.length} bytes`);
        this.processPacket(raw);
      } catch (err) {
        const error = err as Error;
        console.error('Error processing packet:', error);
      }
    };

    // Remove any existing listeners first (if method exists)
    if ('removeAllListeners' in this.cap && typeof this.cap.removeAllListeners === 'function') {
      (this.cap as any).removeAllListeners('packet');
    }

    // Add the packet handler
    this.cap.on('packet', this.packetHandler);

    console.log('Packet capture started, waiting for packets...');

    // Generate some test network traffic to verify capture is working
    this.generateTestTraffic();
  }

  stopCapture() {
    if (!this.isCapturing) {
      console.log('Packet capture not running');
      return;
    }

    this.isCapturing = false;
    console.log('Stopping packet capture...');

    try {
      // Remove packet handler first
      if (this.packetHandler) {
        if ('removeListener' in this.cap && typeof (this.cap as any).removeListener === 'function') {
          (this.cap as any).removeListener('packet', this.packetHandler);
        }
        this.packetHandler = null;
      }

      // Close the capture device with a small delay to prevent UV_HANDLE_CLOSING error
      setTimeout(() => {
        try {
          this.cap.close();
          console.log('Packet capture stopped successfully');
        } catch (err) {
          console.error('Error closing capture device:', err);
        }
      }, 100);

      // Reset the buffer
      this.buffer.fill(0);

    } catch (err) {
      const error = err as Error;
      console.error('Error stopping packet capture:', error);
    }
  }

  private async processPacket(raw: Buffer) {
    try {
      console.log(`Processing packet of ${raw.length} bytes`);

      // Check if packet has Ethernet header (minimum 14 bytes)
      if (raw.length < 14) {
        console.log('Packet too small for Ethernet header, skipping');
        return;
      }

      // Check if it's an IP packet (EtherType 0x0800)
      const etherType = raw.readUInt16BE(12);
      if (etherType !== 0x0800) {
        console.log(`Non-IP packet (EtherType: 0x${etherType.toString(16)}), skipping`);
        return;
      }

      // Check if packet has IP header (minimum 34 bytes total: 14 Ethernet + 20 IP)
      if (raw.length < 34) {
        console.log('Packet too small for IP header, skipping');
        return;
      }

      const sourceIP = this.getSourceIP(raw);
      const destIP = this.getDestinationIP(raw);
      const protocol = this.getProtocol(raw);

      console.log(`Packet: ${sourceIP} -> ${destIP} (${protocol})`);

      const packetData = {
        date: new Date(),
        start_ip: sourceIP,
        end_ip: destIP,
        protocol: protocol,
        frequency: this.updateFrequency(sourceIP),
        status: 'normal' as 'normal' | 'medium' | 'critical',
        description: this.generateDescription(raw),
        start_bytes: raw.length,
        end_bytes: raw.length,
        is_malicious: false,
        attack_type: 'normal',
        confidence: 0,
        user: this.userId
      };

      // Determine status based on protocol, frequency, IP addresses, and packet size
      packetData.status = this.determineStatus({
        protocol: packetData.protocol,
        frequency: packetData.frequency,
        start_ip: packetData.start_ip,
        end_ip: packetData.end_ip,
        start_bytes: packetData.start_bytes,
        end_bytes: packetData.end_bytes
      });

      console.log('Saving packet to database:', packetData);

      // Save to MongoDB
      const savedPacket = await PacketModel.create(packetData);
      console.log('Packet saved successfully with ID:', savedPacket._id);

      // Try to get predictions from ML service (non-blocking)
      try {
        const response = await axios.post(this.predictionServiceUrl, {
          packet: packetData
        }, { timeout: 5000 });

        const predictions = response.data;

        // Update packet with predictions - CRITICAL: Always use detector's attack_type if available
        savedPacket.is_malicious = predictions.binary_prediction === 'malicious';
        
        // CRITICAL FIX: Use attack_type from predictions (which comes from detector override)
        // Don't use 'normal' if it's marked as malicious
        if (predictions.attack_type && predictions.attack_type !== 'normal') {
          savedPacket.attack_type = predictions.attack_type;
        } else if (savedPacket.is_malicious && (!predictions.attack_type || predictions.attack_type === 'normal')) {
          // If malicious but attack_type is normal, infer from status/description
          if (packetData.status === 'critical' || packetData.status === 'medium') {
            const desc = (packetData.description || '').toLowerCase();
            if (desc.includes('syn') || desc.includes('flood') || desc.includes('dos')) {
              savedPacket.attack_type = 'dos';
            } else if (desc.includes('scan') || desc.includes('probe')) {
              savedPacket.attack_type = 'probe';
            } else if (desc.includes('brute') || desc.includes('login')) {
              savedPacket.attack_type = 'brute_force';
            } else {
              savedPacket.attack_type = 'unknown_attack';
            }
          } else {
            savedPacket.attack_type = predictions.attack_type || 'unknown_attack';
          }
        } else {
          savedPacket.attack_type = predictions.attack_type || 'normal';
        }
        
        savedPacket.confidence = predictions.confidence?.binary || predictions.confidence || 0.5;
        
        // Store attack type probabilities if available
        if (predictions.attack_type_probabilities) {
          savedPacket.attack_type_probabilities = predictions.attack_type_probabilities;
        }

        // Update in MongoDB
        await savedPacket.save();
        console.log('Packet updated with ML predictions:', {
          is_malicious: savedPacket.is_malicious,
          attack_type: savedPacket.attack_type,
          confidence: savedPacket.confidence,
          status: savedPacket.status
        });
      } catch (err) {
        console.log('ML service not available, continuing without predictions');
      }

      // Reload packet from DB to ensure we have latest ML predictions
      await savedPacket.populate('user');
      const packetToEmit = savedPacket.toObject();
      
      // CRITICAL: Ensure is_malicious and attack_type are correctly set
      packetToEmit.is_malicious = savedPacket.is_malicious ?? false;
      
      // CRITICAL FIX: Don't default to 'normal' if it's malicious or critical/medium
      if (packetToEmit.is_malicious || packetToEmit.status === 'critical' || packetToEmit.status === 'medium') {
        packetToEmit.attack_type = savedPacket.attack_type || 'unknown_attack';
      } else {
        packetToEmit.attack_type = savedPacket.attack_type || 'normal';
      }
      
      // Broadcast to connected clients
      const io = getIO();
      if (io) {
        console.log('Broadcasting new packet to clients:', {
          is_malicious: packetToEmit.is_malicious,
          attack_type: packetToEmit.attack_type,
          status: packetToEmit.status
        });
        io.emit('new-packet', packetToEmit);
      } else {
        console.error('Socket.IO not initialized');
      }

      // Auto-ban on critical events
      try {
        if (packetData.status === 'critical') {
          const { autoBan } = await import('./policy');
          await autoBan(packetData.start_ip, 'ids:critical');
        }
      } catch (e) {
        console.error('Auto-ban failed for critical packet:', e);
      }
    } catch (err) {
      const error = err as Error;
      console.error('Error processing packet:', error);
    }
  }

  private getSourceIP(raw: Buffer): string {
    try {
      // Skip Ethernet header (14 bytes) and get source IP from IP header
      const offset = 14;
      if (raw.length < offset + 20) {
        throw new Error('Buffer too small for IP header');
      }
      return `${raw[offset + 12]}.${raw[offset + 13]}.${raw[offset + 14]}.${raw[offset + 15]}`;
    } catch (err) {
      console.error('Error extracting source IP:', err);
      return '0.0.0.0';
    }
  }

  private getDestinationIP(raw: Buffer): string {
    try {
      // Skip Ethernet header (14 bytes) and get destination IP from IP header
      const offset = 14;
      if (raw.length < offset + 20) {
        throw new Error('Buffer too small for IP header');
      }
      return `${raw[offset + 16]}.${raw[offset + 17]}.${raw[offset + 18]}.${raw[offset + 19]}`;
    } catch (err) {
      console.error('Error extracting destination IP:', err);
      return '0.0.0.0';
    }
  }

  private getProtocol(raw: Buffer): string {
    try {
      // Skip Ethernet header (14 bytes) and get protocol from IP header
      const offset = 14;
      if (raw.length < offset + 10) {
        throw new Error('Buffer too small for protocol field');
      }
      const protocol = raw[offset + 9];
      switch (protocol) {
        case 6: return 'TCP';
        case 17: return 'UDP';
        case 1: return 'ICMP';
        case 2: return 'IGMP';
        case 4: return 'IPv4';
        case 41: return 'IPv6';
        case 47: return 'GRE';
        case 50: return 'ESP';
        case 51: return 'AH';
        default: return `PROTO_${protocol}`;
      }
    } catch (err) {
      console.error('Error extracting protocol:', err);
      return 'UNKNOWN';
    }
  }

  private updateFrequency(sourceIP: string): number {
    const now = Date.now();
    // Group by 1-minute intervals for proper per-minute frequency tracking
    const minuteKey = Math.floor(now / 60000);
    const key = `${sourceIP}-${minuteKey}`;

    // Clean up old entries first (older than 10 minutes to prevent memory leaks)
    const tenMinutesAgo = minuteKey - 10;
    Object.keys(packetFrequencies).forEach(k => {
      const keyMinute = parseInt(k.split('-').pop() || '0');
      if (keyMinute < tenMinutesAgo) {
        delete packetFrequencies[k];
      }
    });

    if (!packetFrequencies[key]) {
      packetFrequencies[key] = { count: 1, timestamp: now };
      return 1;
    }

    packetFrequencies[key].count++;
    packetFrequencies[key].timestamp = now;

    return packetFrequencies[key].count;
  }

  private determineStatus(packet: { protocol: string; frequency: number; start_ip: string; end_ip: string; start_bytes: number; end_bytes: number }): 'critical' | 'medium' | 'normal' {
    // Very conservative thresholds based on realistic network behavior

    const isPrivateIP = (ip: string) => {
      return ip.startsWith('192.168.') || ip.startsWith('10.') ||
             (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31);
    };

    const isLocalhost = (ip: string) => {
      return ip.startsWith('127.') || ip === '::1' || ip === 'localhost';
    };

    const isBroadcast = (ip: string) => {
      return ip.endsWith('.255') || ip === '255.255.255.255';
    };

    // Never flag localhost or loopback traffic
    if (isLocalhost(packet.start_ip) || isLocalhost(packet.end_ip)) {
      return 'normal';
    }

    // Analyze packet size for anomaly detection
    const totalBytes = packet.start_bytes + packet.end_bytes;
    const isLargePacket = totalBytes > 1500; // Larger than typical MTU
    const isSmallPacket = totalBytes < 64;   // Smaller than minimum Ethernet frame

    // Internal network traffic - thresholds (lowered for testing)
    if (isPrivateIP(packet.start_ip) && isPrivateIP(packet.end_ip)) {
      // Critical: Extremely high frequency that indicates definite attack patterns
      if (packet.protocol === 'TCP' && packet.frequency > 500) return 'critical';
      if (packet.protocol === 'UDP' && packet.frequency > 1000) return 'critical';
      if (packet.protocol === 'ICMP' && packet.frequency > 200) return 'critical';

      // Medium: High frequency with suspicious characteristics
      if (packet.protocol === 'TCP' && packet.frequency > 200) return 'medium';
      if (packet.protocol === 'UDP' && packet.frequency > 300) return 'medium';
      if (packet.protocol === 'ICMP' && packet.frequency > 50) return 'medium';

      // Low: Moderate frequency (for testing - lower threshold)
      if (packet.protocol === 'TCP' && packet.frequency > 50) return 'normal'; // Will show as low threat in UI
      if (packet.protocol === 'UDP' && packet.frequency > 100) return 'normal';
      if (packet.protocol === 'ICMP' && packet.frequency > 20) return 'normal';

      return 'normal';
    }

    // External traffic - more sensitive but still realistic
    if (isBroadcast(packet.start_ip) || isBroadcast(packet.end_ip)) {
      // Broadcast traffic - flag high frequency
      if (packet.frequency > 100) return 'medium';
      return 'normal';
    }

    // Critical: Very high frequency external traffic (likely DDoS or scan)
    if (packet.protocol === 'TCP' && packet.frequency > 1000) return 'critical';
    if (packet.protocol === 'UDP' && packet.frequency > 2000) return 'critical';
    if (packet.protocol === 'ICMP' && packet.frequency > 500) return 'critical';

    // Medium: Moderately high frequency with suspicious patterns
    if (packet.protocol === 'TCP' && packet.frequency > 300 && isSmallPacket) return 'medium';
    if (packet.protocol === 'UDP' && packet.frequency > 600) return 'medium';
    if (packet.protocol === 'ICMP' && packet.frequency > 100) return 'medium';

    // Port scan detection - many small TCP packets
    if (packet.protocol === 'TCP' && packet.frequency > 200 && totalBytes < 100) return 'medium';

    return 'normal';
  }

  private generateDescription(raw: Buffer): string {
    try {
      const protocol = this.getProtocol(raw);
      const offset = 14; // Skip Ethernet header

      // Get IP header length
      const ipHeaderLength = (raw[offset] & 0x0F) * 4;

      // Get source and destination ports for TCP/UDP
      if ((protocol === 'TCP' || protocol === 'UDP') && raw.length >= offset + ipHeaderLength + 4) {
        const srcPort = raw.readUInt16BE(offset + ipHeaderLength);
        const dstPort = raw.readUInt16BE(offset + ipHeaderLength + 2);

        // Add common port descriptions
        const portDesc = this.getPortDescription(dstPort);
        return `${protocol} ${srcPort} -> ${dstPort}${portDesc ? ` (${portDesc})` : ''}`;
      }

      return `${protocol} packet (${raw.length} bytes)`;
    } catch (err) {
      console.error('Error generating description:', err);
      return `Packet (${raw.length} bytes)`;
    }
  }

  private getPortDescription(port: number): string {
    const commonPorts: { [key: number]: string } = {
      20: 'FTP Data',
      21: 'FTP Control',
      22: 'SSH',
      23: 'Telnet',
      25: 'SMTP',
      53: 'DNS',
      67: 'DHCP Server',
      68: 'DHCP Client',
      80: 'HTTP',
      110: 'POP3',
      143: 'IMAP',
      443: 'HTTPS',
      993: 'IMAPS',
      995: 'POP3S'
    };

    return commonPorts[port] || '';
  }

  private generateTestTraffic() {
    // Generate some HTTP requests to create network traffic for testing
    setTimeout(() => {
      console.log('Generating test network traffic...');

      // Make a few HTTP requests to generate packets
      const testUrls = [
        'http://httpbin.org/ip',
        'http://httpbin.org/user-agent',
        'https://api.github.com'
      ];

      testUrls.forEach((url, index) => {
        setTimeout(() => {
          axios.get(url, { timeout: 5000 })
            .then(() => console.log(`Test request ${index + 1} completed`))
            .catch(() => console.log(`Test request ${index + 1} failed (expected)`));
        }, index * 1000);
      });
    }, 2000); // Wait 2 seconds after starting capture
  }
}
