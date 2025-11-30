import { Cap } from 'cap';
import { Packet as PacketModel, IPacket } from '../models/Packet';
import { getIO } from '../socket';
import axios from 'axios';
import os from 'os';

// Track packet frequencies for status determination with automatic cleanup
const packetFrequencies: { [key: string]: { count: number; timestamp: number } } = {};

// Throttle socket emissions to prevent frontend flooding
// Industry standard: Limit UI updates but capture all packets to DB
const socketEmissionQueue: any[] = [];
let lastEmissionTime = 0;
const EMISSION_INTERVAL = 10000; // Emit max once per 10 seconds - DISABLED for performance (only intrusions update)
const MAX_QUEUE_SIZE = 1; // Keep only most recent packet for UI updates - REDUCED for performance
const DISABLE_NORMAL_PACKET_EMISSIONS = true; // Disable normal packet emissions to reduce lag

// Batch DB writes to reduce database load during attacks
const dbWriteQueue: any[] = [];
let lastDbWriteTime = 0;
const DB_WRITE_INTERVAL = 1000; // Write to DB every 1 second (batched) - REDUCED for better persistence
const MAX_DB_BATCH_SIZE = 50; // Max packets per batch - REDUCED to prevent DB overload

// Process socket emission queue - optimized for performance (REDUCED frequency)
setInterval(() => {
  const now = Date.now();
  if (socketEmissionQueue.length > 0 && (now - lastEmissionTime) >= EMISSION_INTERVAL) {
    try {
      const io = getIO();
      if (io && socketEmissionQueue.length > 0) {
        // Emit only the most recent packet (UI limits to 300 anyway)
        const packet = socketEmissionQueue[socketEmissionQueue.length - 1];
        if (packet) {
          io.emit('new-packet', packet);
          lastEmissionTime = now;
          // Clear queue after emitting
          socketEmissionQueue.length = 0;
        }
      }
    } catch (err) {
      // Socket not ready, clear queue
      socketEmissionQueue.length = 0;
    }
  }
}, 500); // Check every 500ms (REDUCED frequency for performance)

// Batch DB writes to reduce database load during attacks
// FIX: More frequent writes to ensure data persistence with crash prevention
setInterval(() => {
  try {
    const now = Date.now();
    if (dbWriteQueue.length > 0 && (now - lastDbWriteTime) >= DB_WRITE_INTERVAL) {
      // Write in smaller batches more frequently
      // REDUCED batch size during high load to prevent crashes
      const currentQueueSize = dbWriteQueue.length;
      const batchSize = currentQueueSize > 200 ? 25 : MAX_DB_BATCH_SIZE; // Smaller batches when queue is large
      const batch = dbWriteQueue.splice(0, batchSize);
      
      if (batch.length > 0) {
        // Use insertMany for better performance with timeout protection
        PacketModel.insertMany(batch, { ordered: false })
          .then(() => {
            // Success - data is persisted
            if (batch.length > 0) {
              // Log occasionally to show progress
              if (Math.random() < 0.05) { // Log 5% of batches (reduced from 10%)
                console.log(`[PACKET] ✓ Saved ${batch.length} packets to DB (${dbWriteQueue.length} remaining in queue)`);
              }
            }
          })
          .catch(err => {
            // If batch write fails, try saving only critical packets individually (non-blocking)
            const errorMsg = (err as Error)?.message || String(err);
            if (!errorMsg.includes('timeout') && !errorMsg.includes('ECONNREFUSED')) {
              console.warn('[PACKET] Batch DB write error:', errorMsg);
            }
            // Only save critical packets individually to prevent overload
            batch.forEach(packet => {
              if (packet.status === 'critical') {
                PacketModel.create(packet).catch(() => {
                  // Ignore individual failures - already logged batch error
                });
              }
            });
            // Drop non-critical packets if DB is overloaded
            if (dbWriteQueue.length > 300) {
              console.warn(`[PACKET] ⚠ DB overloaded, dropping ${batch.length - batch.filter(p => p.status === 'critical').length} non-critical packets`);
            }
          });
        lastDbWriteTime = now;
      }
    }
  } catch (err) {
    // Prevent interval crashes - log but continue
    const errorMsg = (err as Error)?.message || String(err);
    if (!errorMsg.includes('timeout') && !errorMsg.includes('ECONNREFUSED')) {
      console.warn('[PACKET] Error in batch DB write interval:', errorMsg);
    }
    // Don't crash - just log and continue
  }
}, 500); // Check every 500ms for faster writes

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
  private mlRateLimiter: Map<string, number> | null = null;
  private localIPs: Set<string> = new Set();
  private firstPacketLogged: boolean = false;
  private lastPacketTime: number = 0; // Track last packet time for health monitoring
  private healthCheckInterval: any = null; // NodeJS.Timeout | null

  constructor(userId: string) {
    this.cap = new Cap();
    this.linkType = 'ETHERNET';
    this.buffer = Buffer.alloc(65535);
    this.predictionServiceUrl = 'http://127.0.0.1:5002/predict';
    this.userId = userId;

    // Get all local IP addresses to prevent self-blocking
    this.detectLocalIPs();

    // Initialize the capture device
    this.initializeCapture();
  }

  private detectLocalIPs() {
    try {
      const interfaces = os.networkInterfaces();
      if (interfaces) {
        for (const name of Object.keys(interfaces)) {
          const iface = interfaces[name];
          if (iface) {
            for (const addr of iface) {
              if (addr && !addr.internal && addr.family === 'IPv4') {
                this.localIPs.add(addr.address);
                console.log(`[PACKET] Detected local IP: ${addr.address}`);
              }
            }
          }
        }
      }
      // Always add localhost variants
      this.localIPs.add('127.0.0.1');
      this.localIPs.add('localhost');
      this.localIPs.add('::1');
    } catch (err) {
      console.warn('[PACKET] Error detecting local IPs:', err);
      // Fallback: at least add localhost
      this.localIPs.add('127.0.0.1');
      this.localIPs.add('localhost');
    }
  }

  private isLocalIP(ip: string): boolean {
    if (!ip) return false;
    // Check exact match
    if (this.localIPs.has(ip)) return true;
    // Check localhost variants
    if (ip.startsWith('127.') || ip === '::1' || ip === 'localhost') return true;
    // Check if it's in the local IPs set
    return Array.from(this.localIPs).some(localIP => ip === localIP);
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
      const errorMsg = lastError ? String(lastError) : 'Unknown error';
      console.error('❌ Failed to open any capture device. Last error:', errorMsg);
      throw new Error(`Failed to open any capture device. Last error: ${errorMsg}\n\n` +
        `Possible causes:\n` +
        `1. Missing permissions (try running with sudo/root)\n` +
        `2. No network interfaces available\n` +
        `3. WinPcap/Npcap not installed (Windows)\n` +
        `4. libpcap not installed (Linux)`);
    }
  }

  startCapture() {
    if (this.isCapturing) {
      console.log('Packet capture already running');
      return;
    }

    this.isCapturing = true;
    console.log('Starting packet capture...');

    // Create new packet handler (optimized for performance with crash prevention)
    this.packetHandler = (nbytes: number, trunc: boolean) => {
      try {
        if (nbytes === 0 || !this.buffer) {
          return; // Skip silently
        }

        // Validate buffer size
        if (nbytes > this.buffer.length) {
          console.warn(`[PACKET] Invalid packet size: ${nbytes} > ${this.buffer.length}`);
          return;
        }

        const raw = this.buffer.slice(0, nbytes);
        if (!raw || raw.length === 0) {
          return;
        }
        
        // Process asynchronously to avoid blocking packet capture
        // CRITICAL: Use setTimeout(0) and wrap in Promise.resolve to ensure errors don't stop capture
        setTimeout(() => {
          // Use Promise.resolve to ensure errors are caught
          Promise.resolve().then(() => {
            return this.processPacket(raw);
          }).catch((err) => {
            // CRITICAL: This catch must NEVER throw
            try {
              // Log only non-buffer errors to prevent spam
              if (err instanceof Error && !err.message.includes('Buffer') && !err.message.includes('timeout') && !err.message.includes('aborted')) {
                // Only log occasionally to prevent log spam during attacks
                if (Math.random() < 0.01) { // Log 1% of errors
                  console.warn('[PACKET] Error processing packet (non-fatal):', err.message);
                }
              }
            } catch (logErr) {
              // Even error logging must not crash - silently ignore
            }
          });
          
          // Also catch synchronous errors
          try {
            // processPacket is async, but we catch above
          } catch (syncErr) {
            // Prevent synchronous errors from crashing
            // Silently ignore - packet capture must continue
            if (syncErr instanceof Error && !syncErr.message.includes('Buffer') && Math.random() < 0.01) {
              console.warn('[PACKET] Synchronous error in packet handler (non-fatal):', syncErr.message);
            }
          }
        }, 0);
      } catch (err) {
        // Prevent handler crashes - log only critical errors
        if (err instanceof Error && !err.message.includes('Buffer') && !err.message.includes('slice')) {
          console.warn('[PACKET] Error in packet handler:', err.message);
        }
      }
    };

    // Remove any existing listeners first (if method exists)
    if ('removeAllListeners' in this.cap && typeof this.cap.removeAllListeners === 'function') {
      (this.cap as any).removeAllListeners('packet');
    }

    // Add the packet handler
    this.cap.on('packet', this.packetHandler);

    console.log('✅ Packet capture started, waiting for packets...');
    console.log('📡 Listening for network traffic. Make sure to start packet capture from Events Log page!');

    // Generate some test network traffic to verify capture is working
    this.generateTestTraffic();
    
    // Start health monitoring to detect if capture stops
    this.startHealthMonitoring();
  }
  
  private startHealthMonitoring() {
    // Check every 30 seconds if we're still receiving packets
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      try {
        const now = Date.now();
        const timeSinceLastPacket = now - this.lastPacketTime;
        
        // Log status periodically to help debug
        if (this.isCapturing) {
          if (this.lastPacketTime === 0) {
            console.log('[PACKET] Health: Capture running, waiting for first packet...');
          } else {
            const secondsSinceLastPacket = Math.floor(timeSinceLastPacket / 1000);
            if (secondsSinceLastPacket < 60) {
              // Log every 5 minutes if receiving packets normally
              if (Math.random() < 0.01) { // 1% chance = ~once per 5 minutes
                console.log(`[PACKET] Health: Capture active, last packet ${secondsSinceLastPacket}s ago`);
              }
            } else {
              console.warn(`[PACKET] ⚠ No packets received in ${secondsSinceLastPacket}s - capture may have stopped`);
            }
          }
        }
        
        // If we haven't received packets in 2 minutes and capture should be running, log warning
        if (this.isCapturing && this.lastPacketTime > 0 && timeSinceLastPacket > 120000) {
          console.error('[PACKET] ❌ CRITICAL: No packets received in 2 minutes - capture may have stopped!');
          console.error('[PACKET] Check if backend is still running and packet capture is active');
          // Don't auto-restart - let user restart manually to avoid loops
        }
      } catch (err) {
        // Don't crash on health check errors
        console.warn('[PACKET] Health check error:', err);
      }
    }, 30000); // Check every 30 seconds
  }

  stopCapture() {
    if (!this.isCapturing) {
      console.log('Packet capture not running');
      return;
    }

    this.isCapturing = false;
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
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
      // Enhanced validation with better error handling
      if (!raw || raw.length < 34) {
        return; // Too small, skip silently
      }

      // Check if it's an IP packet (EtherType 0x0800) with bounds checking
      if (raw.length < 14) {
        return; // Not enough bytes for Ethernet header
      }
      
      let etherType: number;
      try {
        etherType = raw.readUInt16BE(12);
      } catch (err) {
        // Buffer read error, skip packet
        return;
      }
      
      if (etherType !== 0x0800) {
        return; // Non-IP packet, skip silently
      }

      let sourceIP: string;
      let destIP: string;
      let protocol: string;
      
      try {
        sourceIP = this.getSourceIP(raw);
        destIP = this.getDestinationIP(raw);
        protocol = this.getProtocol(raw);
      } catch (err) {
        // Error extracting packet info, skip packet
        console.warn('[PACKET] Error extracting packet info:', (err as Error)?.message);
        return;
      }

      // Skip localhost traffic to reduce noise
      if (sourceIP.startsWith('127.') || destIP.startsWith('127.')) {
        return;
      }

      // Update last packet time for health monitoring
      this.lastPacketTime = Date.now();
      
      // Log first few packets to verify capture is working (debugging)
      if (!this.firstPacketLogged) {
        console.log(`📦 First packet captured! Source: ${sourceIP} → Dest: ${destIP} Protocol: ${protocol}`);
        console.log(`[PACKET] ✅ Packet capture is ACTIVE and processing packets`);
        this.firstPacketLogged = true;
      }
      
      // Log periodically to confirm capture is still working (every 1000 packets)
      if (Math.random() < 0.001) { // ~0.1% chance = ~once per 1000 packets
        console.log(`[PACKET] ✓ Still capturing packets (last: ${sourceIP} → ${destIP})`);
      }
      
      // CRITICAL: Check if this IP is already blocked - log for debugging
      // This helps identify why second attacks might be slow
      try {
        const { redis } = await import('./redis');
        const tempBanKey = `ids:tempban:${sourceIP}`;
        const blocked = await redis.get(tempBanKey).catch(() => null);
        if (blocked && Math.random() < 0.1) { // Log 10% of packets from blocked IPs
          console.log(`[PACKET] 📍 Packet from BLOCKED IP ${sourceIP} - still being captured and analyzed`);
        }
      } catch (redisErr) {
        // Silently ignore - not critical
      }

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

      // FIX: Always save packets to DB, but use batching for performance
      // This ensures data persists and doesn't disappear on refresh
      const shouldSaveToDB = true; // Always save - data persistence is critical
      
      // Queue for batched DB write (non-blocking)
      if (shouldSaveToDB) {
        dbWriteQueue.push(packetData);
        
        // Limit queue size to prevent memory issues and crashes during attacks
        // REDUCED from 1000 to 500 to prevent memory exhaustion
        if (dbWriteQueue.length > 500) {
          // Remove oldest normal packets first (never remove critical)
          const normalIndex = dbWriteQueue.findIndex(p => p.status === 'normal');
          if (normalIndex !== -1) {
            dbWriteQueue.splice(normalIndex, 1);
          } else {
            // If no normal packets, remove oldest medium packet
            const mediumIndex = dbWriteQueue.findIndex(p => p.status === 'medium');
            if (mediumIndex !== -1) {
              dbWriteQueue.splice(mediumIndex, 1);
            } else {
              // Last resort: remove oldest (but log if we're dropping critical)
              const removed = dbWriteQueue.shift();
              if (removed && removed.status === 'critical') {
                console.warn('[PACKET] ⚠ Dropped critical packet from queue (queue full)');
              }
            }
          }
        }
        
        // CRITICAL: Save critical packets immediately to ensure they're never lost
        if (packetData.status === 'critical') {
          // Save critical packets immediately (non-blocking)
          PacketModel.create(packetData).catch(err => {
            // If immediate save fails, it's still in queue for batch write
            console.warn('[PACKET] Immediate critical save failed, will retry in batch:', (err as Error)?.message);
          });
        }
      }
      
      // Create a promise that resolves with packet data for compatibility
      const savePromise = Promise.resolve({ _id: `temp_${Date.now()}_${Math.random()}`, ...packetData });

      // Enhanced ML prediction with auto-blocking and notifications
      // CRITICAL: Check if IP is already blocked - if so, prioritize detection (no rate limiting)
      let isBlockedIP = false;
      try {
        const { redis } = await import('./redis');
        const tempBanKey = `ids:tempban:${packetData.start_ip}`;
        const blocked = await redis.get(tempBanKey).catch(() => null);
        isBlockedIP = blocked !== null;
        if (isBlockedIP) {
          console.log(`[PACKET] ⚠ Packet from BLOCKED IP ${packetData.start_ip} - prioritizing detection`);
        }
      } catch (redisErr) {
        // Silently ignore Redis errors - continue processing
      }
      
      // PERFORMANCE: Only analyze suspicious/critical packets during high traffic
      // Rate limit ML predictions (max 5 per second per IP) to prevent overload
      // BUT: No rate limiting for blocked IPs - they need immediate detection
      if (!this.mlRateLimiter) {
        this.mlRateLimiter = new Map<string, number>();
      }
      const rateLimitKey = `${packetData.start_ip}-${Math.floor(Date.now() / 1000)}`;
      const currentCount = this.mlRateLimiter.get(rateLimitKey) || 0;
      
      // PERFORMANCE: Only run ML on suspicious/critical packets OR if rate limit allows
      // CRITICAL: Always run ML for blocked IPs (no rate limiting)
      const shouldRunML = isBlockedIP || packetData.status !== 'normal' || currentCount < 2; // Reduced from 20 to 2
      
      // CRITICAL: No rate limit for blocked IPs - they need immediate detection
      if (shouldRunML && (isBlockedIP || currentCount < 5)) { // Reduced from 20 to 5 per second
        if (!isBlockedIP) {
          this.mlRateLimiter.set(rateLimitKey, currentCount + 1);
        }
        
        // Clean old rate limit entries periodically
        if (this.mlRateLimiter.size > 1000) {
          const now = Math.floor(Date.now() / 1000);
          for (const [key] of this.mlRateLimiter) {
            const keyTime = parseInt(key.split('-').pop() || '0');
            if (now - keyTime > 60) {
              this.mlRateLimiter.delete(key);
            }
          }
        }
        
        // Run ML prediction on ALL packets for better attack detection
        // Wrap in try-catch to prevent crashes on HTTP flood or other attacks
        // CRITICAL: Use Promise.resolve().then() to ensure errors don't stop packet processing
        Promise.resolve().then(() => {
          return axios.post(this.predictionServiceUrl, {
            packet: packetData
          }, { 
            timeout: 1500, // Further reduced timeout to prevent hanging
            maxRedirects: 0,
            validateStatus: () => true // Accept any status to prevent throwing
          } as any).then((response: any) => {
          try {
            if (!response || !response.data) {
              console.warn('[PACKET] Invalid ML response');
              return;
            }
            
            const predictions = response.data;
            console.log(`[PACKET] ML prediction for ${packetData.start_ip}:`, {
              binary: predictions?.binary_prediction,
              attack_type: predictions?.attack_type,
              confidence: predictions?.confidence?.binary || predictions?.confidence
            });
            savePromise.then(async (savedPacket: any) => {
              try {
                if (!savedPacket) return;
                
                const isMalicious = predictions?.binary_prediction === 'malicious';
                let attackType = predictions?.attack_type || 'unknown';
                const confidence = predictions?.confidence?.binary || predictions?.confidence || 0;
                
                // If status is critical, it's definitely an attack - use pattern detection
                // Enhanced attack type detection based on packet patterns (fallback if ML doesn't classify)
                if (packetData.status === 'critical' || attackType === 'unknown' || attackType === 'normal') {
                  const patternType = this.detectAttackTypeFromPattern(packetData);
                  // Override with pattern detection if ML didn't classify or status is critical
                  if (packetData.status === 'critical' || attackType === 'normal' || attackType === 'unknown') {
                    attackType = patternType;
                    // If pattern detection found an attack, mark as malicious
                    if (patternType !== 'suspicious_traffic' && !isMalicious) {
                      // Update isMalicious based on pattern detection for critical packets
                      // We'll use a lower confidence for pattern-detected attacks
                    }
                  }
                }
                
                // If status is critical or pattern detection found an attack, mark as malicious
                const shouldBeMalicious = isMalicious || 
                  (packetData.status === 'critical' && attackType !== 'suspicious_traffic' && attackType !== 'normal');
                
                savedPacket.is_malicious = shouldBeMalicious;
                savedPacket.attack_type = attackType;
                // Use higher confidence for critical packets detected by pattern
                const finalConfidence = (packetData.status === 'critical' && !isMalicious) 
                  ? Math.max(confidence, 0.7) // Minimum 70% for critical pattern-detected attacks
                  : confidence;
                savedPacket.confidence = finalConfidence;
                await savedPacket.save().catch(() => {}); // Non-blocking update
                
                // Auto-block malicious IPs with high confidence (lowered threshold for faster response)
                // BUT NEVER block local IP addresses
                if (isMalicious && confidence > 0.6 && !this.isLocalIP(packetData.start_ip)) {
                  try {
                    const { autoBan } = await import('./policy');
                    const banResult = await autoBan(packetData.start_ip, `ML:${attackType} (${Math.round(confidence * 100)}%)`).catch((err) => {
                      console.warn('[PACKET] Auto-ban failed:', err);
                      return null;
                    });
                    
                    // Only emit if blocking actually succeeded
                    if (banResult) {
                      console.log(`[PACKET] ✓ Successfully auto-blocked IP: ${packetData.start_ip}`);
                      
                      // Emit intrusion alert notification with autoBlocked flag
                      try {
                        const io = getIO();
                        if (io) {
                          io.to(`user_${this.userId}`).emit('intrusion-detected', {
                            type: 'intrusion',
                            severity: 'critical',
                            ip: packetData.start_ip,
                            attackType: attackType,
                            confidence: confidence,
                            protocol: packetData.protocol,
                            description: `Intrusion detected: ${attackType} from ${packetData.start_ip}`,
                            timestamp: new Date().toISOString(),
                            autoBlocked: true
                          });
                          
                          // Also emit explicit ip-blocked event for Blocker page
                          io.to(`user_${this.userId}`).emit('ip-blocked', {
                            ip: packetData.start_ip,
                            reason: `ML:${attackType} (${Math.round(confidence * 100)}%)`,
                            method: banResult.methods?.join(', ') || 'firewall',
                            timestamp: new Date().toISOString()
                          });
                        }
                      } catch (emitErr) {
                        console.warn('[PACKET] Error emitting intrusion alert:', emitErr);
                      }
                    } else {
                      console.warn(`[PACKET] ⚠ Auto-block failed for IP: ${packetData.start_ip}`);
                    }
                  } catch (err) {
                    console.warn('[PACKET] Error auto-blocking malicious IP:', err);
                  }
                }
                
              // Emit alert for ANY malicious detection (lowered threshold to catch all attacks)
              if (isMalicious && confidence > 0.3) {
                  try {
                    const io = getIO();
                    if (io) {
                      io.to(`user_${this.userId}`).emit('intrusion-detected', {
                        type: 'intrusion',
                        severity: packetData.status === 'critical' ? 'critical' : (finalConfidence > 0.8 ? 'critical' : 'high'),
                        ip: packetData.start_ip,
                        attackType: attackType,
                        confidence: finalConfidence,
                        protocol: packetData.protocol,
                        description: `Suspicious activity detected: ${attackType} from ${packetData.start_ip}`,
                        timestamp: new Date().toISOString(),
                        autoBlocked: confidence > 0.7
                      });
                    }
                  } catch (emitErr) {
                    console.warn('[PACKET] Error emitting alert:', emitErr);
                  }
                }
              } catch (err) {
                console.warn('[PACKET] Error processing ML prediction result:', err);
              }
            }).catch((err) => {
              console.warn('[PACKET] Error in savePromise:', err);
            });
          } catch (err) {
            console.warn('[PACKET] Error processing ML response:', err);
          }
          }).catch((err) => {
            // ML service unavailable - log but continue (don't crash)
            // CRITICAL: This catch must NEVER throw or it will stop packet processing
            try {
              const errorCode = (err as any)?.code;
              const errorMessage = (err as any)?.message || String(err);
              
              // Only log errors occasionally to prevent spam
              if (Math.random() < 0.01) { // Log 1% of errors
                if (errorCode === 'ECONNREFUSED') {
                  console.warn(`[PACKET] ⚠ ML service not available (connection refused) - using pattern detection only`);
                } else if (errorCode === 'ETIMEDOUT' || errorCode === 'ECONNABORTED') {
                  // Don't log timeout errors - they're expected during high traffic
                } else {
                  // Silently ignore other ML errors to prevent log spam
                }
              }
            } catch (logErr) {
              // Even logging errors must not crash
              // Silently ignore
            }
          });
        }).catch((outerErr) => {
          // CRITICAL: Outer catch to prevent ANY error from stopping packet processing
          // This should never happen, but if it does, we must continue
          // Silently ignore - packet processing must continue
        });
      }

      // PERFORMANCE: DISABLED all normal packet emissions to eliminate lag
      // UI will fetch from DB via polling instead (every 30 seconds)
      // Only intrusion alerts are emitted in real-time via 'intrusion-detected' event
      // This code is disabled - no socket emissions for normal packets
      // if (DISABLE_NORMAL_PACKET_EMISSIONS) {
      //   // Normal packets: UI polls DB instead
      // }

      // Auto-ban on critical events with notification (non-blocking)
      // CRITICAL: Always emit alerts for critical packets, even if ML doesn't respond
      if (packetData.status === 'critical') {
        console.log(`[PACKET] 🚨 CRITICAL packet detected: ${packetData.protocol} from ${packetData.start_ip} (freq: ${packetData.frequency})`);
        
        // Detect attack type from pattern for critical packets
        const criticalAttackType = this.detectAttackTypeFromPattern(packetData);
        
        // Emit alert IMMEDIATELY (don't wait for auto-ban)
        const emitCriticalAlert = (autoBlocked: boolean = false) => {
          try {
            const io = getIO();
            if (io) {
              const alertData = {
                type: 'intrusion',
                severity: 'critical',
                ip: packetData.start_ip,
                attackType: criticalAttackType,
                confidence: 0.85, // High confidence for critical status
                protocol: packetData.protocol,
                description: `Critical traffic detected: ${criticalAttackType} from ${packetData.start_ip} (${packetData.frequency} packets/min)`,
                timestamp: new Date().toISOString(),
                autoBlocked: autoBlocked
              };
              console.log(`[PACKET] 📢 Emitting critical alert:`, alertData);
              io.to(`user_${this.userId}`).emit('intrusion-detected', alertData);
              console.log(`[PACKET] ✓ Critical alert emitted to user_${this.userId}`);
            } else {
              console.warn('[PACKET] ⚠ Socket.IO not available for critical alert');
            }
          } catch (emitErr) {
            console.error('[PACKET] ❌ Error emitting critical alert:', emitErr);
          }
        };
        
        // Emit alert immediately (before auto-ban)
        // CRITICAL: Wrap in try-catch to prevent crashes
        try {
          emitCriticalAlert(false);
        } catch (alertErr) {
          console.warn('[PACKET] Error emitting critical alert:', alertErr);
          // Continue - don't let alert errors stop processing
        }
        
        // Then try to auto-ban (non-blocking)
        // CRITICAL: Use Promise.resolve to ensure errors don't propagate
        Promise.resolve().then(() => {
          return import('./policy');
        }).then(({ autoBan }) => {
          // Never auto-ban local IP addresses
          if (!this.isLocalIP(packetData.start_ip)) {
            // CRITICAL: Wrap auto-ban in try-catch and use Promise.resolve
            Promise.resolve().then(() => {
              return autoBan(packetData.start_ip, `ids:critical:${criticalAttackType}`);
            }).then((banResult) => {
              try {
                console.log(`[PACKET] ✓ Auto-banned critical IP: ${packetData.start_ip}`);
                // Emit another alert with autoBlocked=true
                emitCriticalAlert(true);
                
                // Also emit explicit ip-blocked event for Blocker page
                try {
                  const io = getIO();
                  if (io && banResult) {
                    io.to(`user_${this.userId}`).emit('ip-blocked', {
                      ip: packetData.start_ip,
                      reason: `ids:critical:${criticalAttackType}`,
                      method: banResult.methods?.join(', ') || 'firewall',
                      timestamp: new Date().toISOString()
                    });
                    console.log(`[PACKET] ✓ Emitted ip-blocked event for ${packetData.start_ip}`);
                    
                    // Emit blocking-complete event after a brief cooldown (500ms - reduced for faster recovery)
                    // This lets the frontend know when it's safe to continue
                    // CRITICAL: Reduced cooldown to ensure faster detection of subsequent attacks
                    setTimeout(() => {
                      try {
                        if (io) {
                          io.to(`user_${this.userId}`).emit('blocking-complete', {
                            ip: packetData.start_ip,
                            message: `IP ${packetData.start_ip} has been blocked. System ready for next attack.`,
                            timestamp: new Date().toISOString()
                          });
                          console.log(`[PACKET] ✓ Blocking complete for ${packetData.start_ip} - system ready (packets from this IP will be prioritized)`);
                        }
                      } catch (cooldownErr) {
                        // Silently ignore cooldown errors
                      }
                    }, 500); // Reduced from 1000ms to 500ms for faster recovery
                  }
                } catch (emitErr) {
                  console.warn('[PACKET] Error emitting ip-blocked event:', emitErr);
                  // Continue - don't let emit errors stop processing
                }
              } catch (logErr) {
                // Even logging errors must not crash
                // Silently continue
              }
            }).catch((err) => {
              // CRITICAL: Auto-ban errors must not stop packet processing
              // Silently ignore - alert already emitted
              if (Math.random() < 0.1) { // Log 10% of auto-ban errors
                console.warn('[PACKET] Error auto-banning critical IP (non-fatal):', (err as Error)?.message);
              }
            });
          } else {
            console.log(`[PACKET] ⚠ Skipping auto-ban for local IP: ${packetData.start_ip}`);
            // Still emit alert for local IPs (for visibility, but don't block)
            try {
              emitCriticalAlert(false);
            } catch (alertErr) {
              // Silently ignore alert errors
            }
          }
        }).catch((err) => {
          // CRITICAL: Policy import errors must not stop packet processing
          // Silently ignore - alert already emitted
          if (Math.random() < 0.1) { // Log 10% of import errors
            console.warn('[PACKET] Error importing policy module (non-fatal):', (err as Error)?.message);
          }
        });
      }
    } catch (err) {
      // Enhanced error handling to prevent crashes
      if (err instanceof Error) {
        // Only log non-buffer related errors to prevent spam
        const errorMsg = err.message.toLowerCase();
        if (!errorMsg.includes('buffer') && 
            !errorMsg.includes('out of range') && 
            !errorMsg.includes('index')) {
          console.error('[PACKET] Error processing packet:', err.message);
        }
      }
      // Silently continue - never crash on packet processing errors
    }
  }

  private getSourceIP(raw: Buffer): string {
    try {
      // Skip Ethernet header (14 bytes) and get source IP from IP header
      const offset = 14;
      if (!raw || raw.length < offset + 20) {
        return '0.0.0.0';
      }
      // Validate indices are within bounds
      if (offset + 15 >= raw.length) {
        return '0.0.0.0';
      }
      return `${raw[offset + 12]}.${raw[offset + 13]}.${raw[offset + 14]}.${raw[offset + 15]}`;
    } catch (err) {
      // Return safe default instead of crashing
      return '0.0.0.0';
    }
  }

  private getDestinationIP(raw: Buffer): string {
    try {
      // Skip Ethernet header (14 bytes) and get destination IP from IP header
      const offset = 14;
      if (!raw || raw.length < offset + 20) {
        return '0.0.0.0';
      }
      // Validate indices are within bounds
      if (offset + 19 >= raw.length) {
        return '0.0.0.0';
      }
      return `${raw[offset + 16]}.${raw[offset + 17]}.${raw[offset + 18]}.${raw[offset + 19]}`;
    } catch (err) {
      // Return safe default instead of crashing
      return '0.0.0.0';
    }
  }

  private getProtocol(raw: Buffer): string {
    try {
      // Skip Ethernet header (14 bytes) and get protocol from IP header
      const offset = 14;
      if (!raw || raw.length < offset + 10) {
        return 'UNKNOWN';
      }
      // Validate index is within bounds
      if (offset + 9 >= raw.length) {
        return 'UNKNOWN';
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
      // Return safe default instead of crashing
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

    // Internal network traffic - LOWERED thresholds for better attack detection
    if (isPrivateIP(packet.start_ip) && isPrivateIP(packet.end_ip)) {
      // Critical: High frequency that indicates attack patterns (lowered from 2000)
      if (packet.protocol === 'TCP' && packet.frequency > 50) return 'critical';
      if (packet.protocol === 'UDP' && packet.frequency > 100) return 'critical';
      if (packet.protocol === 'ICMP' && packet.frequency > 30) return 'critical';

      // Medium: Moderate frequency with suspicious characteristics (lowered from 500)
      if (packet.protocol === 'TCP' && packet.frequency > 20 && (isSmallPacket || isLargePacket)) return 'medium';
      if (packet.protocol === 'UDP' && packet.frequency > 40 && (isSmallPacket || isLargePacket)) return 'medium';
      if (packet.protocol === 'ICMP' && packet.frequency > 10) return 'medium';

      return 'normal';
    }

    // External traffic - MUCH more sensitive for attack detection
    if (isBroadcast(packet.start_ip) || isBroadcast(packet.end_ip)) {
      // Broadcast traffic - flag high frequency (lowered from 100)
      if (packet.frequency > 20) return 'medium';
      return 'normal';
    }

    // Critical: High frequency external traffic (likely DDoS or scan) - LOWERED thresholds
    if (packet.protocol === 'TCP' && packet.frequency > 30) return 'critical';
    if (packet.protocol === 'UDP' && packet.frequency > 50) return 'critical';
    if (packet.protocol === 'ICMP' && packet.frequency > 20) return 'critical';

    // Medium: Moderate frequency with suspicious patterns - LOWERED thresholds
    if (packet.protocol === 'TCP' && packet.frequency > 10 && isSmallPacket) return 'medium';
    if (packet.protocol === 'UDP' && packet.frequency > 20) return 'medium';
    if (packet.protocol === 'ICMP' && packet.frequency > 5) return 'medium';

    // Port scan detection - many small TCP packets
    if (packet.protocol === 'TCP' && packet.frequency > 200 && totalBytes < 100) return 'medium';

    return 'normal';
  }

  private detectAttackTypeFromPattern(packetData: any): string {
    // Pattern-based attack detection as fallback
    const protocol = packetData.protocol?.toUpperCase() || '';
    const frequency = packetData.frequency || 0;
    const packetSize = packetData.start_bytes || 0;
    const status = packetData.status || 'normal';
    
    // PRIORITY 1: Port scan detection (check FIRST before DoS)
    // Port scans = many small TCP packets (typically < 100 bytes)
    // This is the most common attack type and should be detected first
    if (protocol === 'TCP') {
      // Port scan: moderate-high frequency + small packets
      if (frequency >= 10 && packetSize < 150) {
        // Very high frequency small packets = aggressive port scan
        if (frequency > 50 && packetSize < 100) {
          return 'port_scan';
        }
        // Moderate frequency small packets = stealth port scan
        if (frequency >= 10 && packetSize < 150) {
          return 'port_scan';
        }
      }
      // High frequency large packets = DoS/DDoS (not port scan)
      if (frequency > 50 && packetSize >= 150) {
        return frequency > 200 ? 'ddos' : 'dos';
      }
      // Very high frequency regardless of size = DoS
      if (frequency > 200) {
        return 'ddos';
      }
    }
    
    // PRIORITY 2: ICMP attacks
    if (protocol === 'ICMP') {
      if (status === 'critical') {
        if (frequency > 30) {
          return 'ping_flood'; // More specific than ping_sweep
        } else if (frequency > 20) {
          return 'ping_sweep';
        }
        return 'icmp_flood'; // Default for critical ICMP
      }
      // For non-critical
      if (frequency > 20) {
        return frequency > 30 ? 'ping_flood' : 'ping_sweep';
      }
    }
    
    // PRIORITY 3: UDP attacks
    if (protocol === 'UDP') {
      if (frequency > 100) {
        return 'dos';
      }
      // UDP port scan (less common but possible)
      if (frequency > 20 && packetSize < 100) {
        return 'port_scan';
      }
    }
    
    // PRIORITY 4: Generic probe detection (for TCP that didn't match above)
    if (protocol === 'TCP' && frequency > 20 && status === 'critical') {
      return 'probe';
    }
    
    // Default classifications
    if (status === 'critical') {
      return 'critical_traffic';
    }
    
    return 'suspicious_traffic';
  }

  private generateDescription(raw: Buffer): string {
    try {
      if (!raw || raw.length < 14) {
        return 'Unknown packet';
      }
      
      const protocol = this.getProtocol(raw);
      const offset = 14; // Skip Ethernet header

      // Get IP header length with bounds checking
      if (offset >= raw.length) {
        return `${protocol} packet`;
      }
      
      const ipHeaderLength = (raw[offset] & 0x0F) * 4;

      // Get source and destination ports for TCP/UDP with bounds checking
      if ((protocol === 'TCP' || protocol === 'UDP') && raw.length >= offset + ipHeaderLength + 4) {
        try {
          const srcPort = raw.readUInt16BE(offset + ipHeaderLength);
          const dstPort = raw.readUInt16BE(offset + ipHeaderLength + 2);

          // Add common port descriptions
          const portDesc = this.getPortDescription(dstPort);
          return `${protocol} ${srcPort} -> ${dstPort}${portDesc ? ` (${portDesc})` : ''}`;
        } catch (portErr) {
          // If port reading fails, return basic description
          return `${protocol} packet (${raw.length} bytes)`;
        }
      }

      return `${protocol} packet (${raw.length} bytes)`;
    } catch (err) {
      // Return safe default instead of crashing
      return `Packet (${raw?.length || 0} bytes)`;
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
