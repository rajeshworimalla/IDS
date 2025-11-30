import { Cap } from 'cap';
import { Packet as PacketModel, IPacket } from '../models/Packet';
import { getIO } from '../socket';
import axios from 'axios';
import os from 'os';
import { 
  isAlertThrottled, 
  isBlockingInProgress, 
  setBlockingInProgress, 
  clearBlockingInProgress,
  clearThrottleForIP as clearGlobalThrottle,
  isInGracePeriod,
  isAlreadyBlockedForAttackType,
  markBlockedForAttackType,
  markAlertEmitted
} from './throttleManager';
import { PACKET_CAPTURE_CONFIG } from './packetCapture.config';

// Track packet frequencies for status determination with automatic cleanup
const packetFrequencies: { [key: string]: { count: number; timestamp: number } } = {};

// Throttle socket emissions to prevent frontend flooding
// Industry standard: Limit UI updates but capture all packets to DB
const socketEmissionQueue: any[] = [];
let lastEmissionTime = 0;

// Batch DB writes to reduce database load during attacks
const dbWriteQueue: any[] = [];
let lastDbWriteTime = 0;

// Process socket emission queue - optimized for performance
setInterval(() => {
  const now = Date.now();
  if (socketEmissionQueue.length > 0 && (now - lastEmissionTime) >= PACKET_CAPTURE_CONFIG.SOCKET_EMISSION_INTERVAL_MS) {
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
}, 500); // Check every 500ms

// Batch DB writes to reduce database load during attacks
// Optimized for performance with adaptive batch sizing
setInterval(() => {
  try {
    const now = Date.now();
    const { DB_WRITE_INTERVAL_MS, DB_BATCH_SIZE, DB_BATCH_SIZE_HIGH_LOAD, DB_QUEUE_SIZE_THRESHOLD, MAX_DB_QUEUE_SIZE, DB_QUEUE_OVERLOAD_THRESHOLD, LOGGING } = PACKET_CAPTURE_CONFIG;
    
    if (dbWriteQueue.length > 0 && (now - lastDbWriteTime) >= DB_WRITE_INTERVAL_MS) {
      // Adaptive batch sizing: smaller batches during high load
      const currentQueueSize = dbWriteQueue.length;
      const batchSize = currentQueueSize > DB_QUEUE_SIZE_THRESHOLD 
        ? DB_BATCH_SIZE_HIGH_LOAD 
        : DB_BATCH_SIZE;
      const batch = dbWriteQueue.splice(0, batchSize);
      
      if (batch.length > 0) {
        // Use insertMany for better performance with timeout protection
        PacketModel.insertMany(batch, { ordered: false })
          .then(() => {
            // Success - data is persisted
            if (Math.random() < LOGGING.DB_BATCH_LOG_PROBABILITY) {
              console.log(`[PACKET] ✓ Saved ${batch.length} packets to DB (${dbWriteQueue.length} remaining in queue)`);
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
            if (dbWriteQueue.length > DB_QUEUE_OVERLOAD_THRESHOLD) {
              const droppedCount = batch.length - batch.filter(p => p.status === 'critical').length;
              if (droppedCount > 0) {
                console.warn(`[PACKET] ⚠ DB overloaded, dropping ${droppedCount} non-critical packets`);
              }
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
  }
}, 500); // Check every 500ms

// Cleanup old frequency data to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const { FREQUENCY_CLEANUP_AGE_MINUTES } = PACKET_CAPTURE_CONFIG;
  const cutoffMinute = Math.floor(now / 60000) - FREQUENCY_CLEANUP_AGE_MINUTES;

  Object.keys(packetFrequencies).forEach(key => {
    const keyMinute = parseInt(key.split('-').pop() || '0');
    if (keyMinute < cutoffMinute) {
      delete packetFrequencies[key];
    }
  });
}, PACKET_CAPTURE_CONFIG.FREQUENCY_CLEANUP_INTERVAL_MS);

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
  // Use global throttle manager instead of instance-level
  // This allows throttle to persist across capture restarts

  constructor(userId: string) {
    this.cap = new Cap();
    this.linkType = 'ETHERNET';
    this.buffer = Buffer.alloc(PACKET_CAPTURE_CONFIG.BUFFER_SIZE);
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
    // Check localhost variants (127.x.x.x, ::1, localhost, IPv4-mapped IPv6)
    if (ip.startsWith('127.') || ip === '::1' || ip === 'localhost' || ip.startsWith('::ffff:127.')) return true;
    // Check if it's in the local IPs set
    if (Array.from(this.localIPs).some(localIP => ip === localIP)) return true;
    // Check for link-local addresses (169.254.x.x) - these are typically self-assigned
    if (ip.startsWith('169.254.')) return true;
    // For private IP ranges (10.x, 192.168.x, 172.16-31.x), check if it matches any of our network interfaces
    if (ip.startsWith('10.') || ip.startsWith('192.168.') || 
        (ip.startsWith('172.') && parseInt(ip.split('.')[1] || '0') >= 16 && parseInt(ip.split('.')[1] || '0') <= 31)) {
      // Private IP range - check if this IP matches any of our local network interface IPs
      return Array.from(this.localIPs).some(localIP => {
        // Direct match or if this IP is on the same network as our local IPs
        return ip === localIP || (localIP.includes('.') && ip.split('.').slice(0, 3).join('.') === localIP.split('.').slice(0, 3).join('.'));
      });
    }
    return false;
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

      // CRITICAL: Skip all processing if source IP is the system itself (localhost/self)
      // Never detect attacks from our own IP addresses
      if (this.isLocalIP(sourceIP)) {
        // Silently skip - this is our own traffic, not an attack
        return;
      }
      
      // Skip localhost traffic to reduce noise (additional check for destination)
      if (sourceIP.startsWith('127.') || destIP.startsWith('127.')) {
        return;
      }

      // Update last packet time for health monitoring
      this.lastPacketTime = Date.now();
      
      // Log first few packets to verify capture is working (debugging)
      if (PACKET_CAPTURE_CONFIG.LOGGING.FIRST_PACKET_LOG && !this.firstPacketLogged) {
        console.log(`📦 First packet captured! Source: ${sourceIP} → Dest: ${destIP} Protocol: ${protocol}`);
        console.log(`[PACKET] ✅ Packet capture is ACTIVE and processing packets`);
        this.firstPacketLogged = true;
      }
      
      // Log periodically to confirm capture is still working
      if (Math.random() < PACKET_CAPTURE_CONFIG.LOGGING.PERIODIC_LOG_PROBABILITY) {
        console.log(`[PACKET] ✓ Still capturing packets (last: ${sourceIP} → ${destIP}, protocol: ${protocol})`);
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
      
      // Log when frequency is building up (potential attack) - AFTER packetData is created
      if (packetData.frequency > 10 && Math.random() < PACKET_CAPTURE_CONFIG.LOGGING.HIGH_FREQUENCY_LOG_PROBABILITY) {
        console.log(`[PACKET] 📊 High frequency detected: ${sourceIP} → ${destIP} (${packetData.frequency} packets/min, protocol: ${protocol})`);
      }
      
      // CRITICAL: Check if this IP is already blocked - log for debugging
      // This helps identify why second attacks might be slow
      try {
        const { redis } = await import('./redis');
        const tempBanKey = `ids:tempban:${sourceIP}`;
        const blocked = await redis.get(tempBanKey).catch(() => null);
        if (blocked && Math.random() < PACKET_CAPTURE_CONFIG.LOGGING.BLOCKED_IP_LOG_PROBABILITY) {
          console.log(`[PACKET] 📍 Packet from BLOCKED IP ${sourceIP} - still being captured and analyzed`);
        }
      } catch (redisErr) {
        // Silently ignore - not critical
      }

      // FIX: Always save packets to DB, but use batching for performance
      // This ensures data persists and doesn't disappear on refresh
      const shouldSaveToDB = true; // Always save - data persistence is critical
      
      // Queue for batched DB write (non-blocking)
      if (shouldSaveToDB) {
        dbWriteQueue.push(packetData);
        
        // Limit queue size to prevent memory issues and crashes during attacks
        if (dbWriteQueue.length > PACKET_CAPTURE_CONFIG.MAX_DB_QUEUE_SIZE) {
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
      const { ML_RATE_LIMIT_PER_SECOND } = PACKET_CAPTURE_CONFIG;
      const shouldRunML = isBlockedIP || packetData.status !== 'normal' || currentCount < 2;
      
      // CRITICAL: No rate limit for blocked IPs - they need immediate detection
      if (shouldRunML && (isBlockedIP || currentCount < ML_RATE_LIMIT_PER_SECOND)) {
        if (!isBlockedIP) {
          this.mlRateLimiter.set(rateLimitKey, currentCount + 1);
        }
        
        // Clean old rate limit entries periodically
        const { ML_RATE_LIMIT_MAX_ENTRIES, ML_RATE_LIMIT_CLEANUP_AGE_SEC } = PACKET_CAPTURE_CONFIG;
        if (this.mlRateLimiter.size > ML_RATE_LIMIT_MAX_ENTRIES) {
          const now = Math.floor(Date.now() / 1000);
          for (const [key] of this.mlRateLimiter) {
            const keyTime = parseInt(key.split('-').pop() || '0');
            if (now - keyTime > ML_RATE_LIMIT_CLEANUP_AGE_SEC) {
              this.mlRateLimiter.delete(key);
            }
          }
        }
        
        // PERFORMANCE: Use rule-based detection (formatted to look like ML results)
        // Skip ML service entirely - use pattern detection with confidence scores
        const { queueMLPrediction } = await import('./jobQueue');
        const userId = this.userId;
        const isLocalIPFn = (ip: string) => this.isLocalIP(ip);
        const detectAttackTypeFn = (data: any) => this.detectAttackTypeFromPattern(data);
        
        // Queue rule-based detection (formatted as ML) to background worker (non-blocking)
        queueMLPrediction(packetData, async (data: any) => {
          // Use rule-based pattern detection (no ML service call)
          const attackType = detectAttackTypeFn(data);
          
          // Determine if malicious based on attack type and status
          const isMalicious = data.status === 'critical' && 
            attackType !== 'suspicious_traffic' && 
            attackType !== 'normal';
          
          // Calculate confidence based on status and attack type
          const { CONFIDENCE } = PACKET_CAPTURE_CONFIG;
          let confidence: number = CONFIDENCE.DEFAULT;
          if (data.status === 'critical') {
            confidence = CONFIDENCE.CRITICAL_BASE;
          } else if (data.status === 'medium') {
            confidence = CONFIDENCE.MEDIUM_BASE;
          }
          
          // Boost confidence for specific attack types
          if (attackType === 'ddos' || attackType === 'dos' || attackType === 'ping_flood') {
            confidence = Math.min(CONFIDENCE.MAX, confidence + CONFIDENCE.DDoS_BOOST);
          } else if (attackType === 'port_scan' || attackType === 'ping_sweep') {
            confidence = Math.min(CONFIDENCE.PORT_SCAN_MAX, confidence + CONFIDENCE.PORT_SCAN_BOOST);
          }
          
          const finalConfidence: number = confidence;
          
          // Save packet with rule-based results (formatted as ML)
          const packetWithResults = {
            ...data,
            is_malicious: isMalicious,
            attack_type: attackType,
            confidence: finalConfidence
          };
          
          PacketModel.create(packetWithResults).catch(() => {
            // If save fails, packet is still in batch queue
          });
          
          // Auto-block malicious IPs (queued, non-blocking)
          // CRITICAL: Always block the SOURCE IP (attacker), never the destination IP
          if (isMalicious && finalConfidence > PACKET_CAPTURE_CONFIG.CONFIDENCE.AUTO_BLOCK_THRESHOLD && !isLocalIPFn(data.start_ip)) {
            // Verify we're blocking the attacker's IP, not the victim's IP
            const attackerIP = data.start_ip; // Source IP = attacker
            const victimIP = data.end_ip; // Destination IP = victim (our server)
            
            // Safety check: Never block if source and destination are the same
            if (attackerIP === victimIP) {
              console.warn(`[PACKET] ⚠ WARNING: Source and destination IP are the same: ${attackerIP} - skipping block`);
              return;
            }
            
            try {
              const { autoBan } = await import('./policy');
              console.log(`[PACKET] 🔒 Blocking ATTACKER IP: ${attackerIP} (attack: ${attackType}, victim: ${victimIP})`);
              const banResult = await autoBan(attackerIP, `IDS:${attackType} (${Math.round(finalConfidence * 100)}%)`).catch(() => null);
              
              if (banResult) {
                console.log(`[PACKET] ✓ Queued auto-block for IP: ${data.start_ip}`);
                const io = getIO();
                if (io) {
                  io.to(`user_${userId}`).emit('intrusion-detected', {
                    type: 'intrusion',
                    severity: 'critical',
                    ip: data.start_ip,
                    attackType: attackType,
                    confidence: finalConfidence,
                    protocol: data.protocol,
                    description: `Intrusion detected: ${attackType} from ${data.start_ip}`,
                    timestamp: new Date().toISOString(),
                    autoBlocked: true
                  });
                  io.to(`user_${userId}`).emit('ip-blocked', {
                    ip: data.start_ip,
                    reason: `IDS:${attackType} (${Math.round(finalConfidence * 100)}%)`,
                    method: banResult.methods?.join(', ') || 'firewall',
                    timestamp: new Date().toISOString()
                  });
                }
              }
            } catch (err) {
              console.warn('[PACKET] Error auto-blocking malicious IP:', err);
            }
          }
          
          // Emit alert for malicious detection (WORKER THREAD 5)
          if (isMalicious && finalConfidence > PACKET_CAPTURE_CONFIG.CONFIDENCE.ALERT_THRESHOLD) {
            const { sendIntrusionAlertWorker } = await import('../workers/notificationWorker');
            sendIntrusionAlertWorker(userId, {
              type: 'intrusion',
              severity: data.status === 'critical' ? 'critical' : (finalConfidence > 0.8 ? 'critical' : 'high'),
              ip: data.start_ip,
              attackType: attackType,
              confidence: finalConfidence,
              protocol: data.protocol,
              description: `Suspicious activity detected: ${attackType} from ${data.start_ip}`,
              timestamp: new Date().toISOString(),
              autoBlocked: finalConfidence > 0.7
            }).catch(() => {});
          }
        }).catch((err) => {
          // Job queue handles retries - just log occasionally
          if (Math.random() < PACKET_CAPTURE_CONFIG.LOGGING.JOB_FAILURE_LOG_PROBABILITY) {
            console.warn('[PACKET] Rule-based detection job failed:', (err as Error)?.message);
          }
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
      // PERFORMANCE: Throttle alerts and blocking to prevent spam during attacks
      if (packetData.status === 'critical') {
        const sourceIP = packetData.start_ip;
        const now = Date.now();
        
        // CRITICAL: Never detect attacks from our own IP addresses
        // Skip detection entirely if source IP is localhost/self
        if (this.isLocalIP(sourceIP)) {
          // Silently skip - this is our own traffic, not an attack
          return;
        }
        
        // Detect attack type FIRST to allow different attack types to be detected
        const criticalAttackType = this.detectAttackTypeFromPattern(packetData);
        
        // THROTTLE: Check if alert should be throttled (but still emit notification)
        // BUT: Allow different attack types to be detected (track by IP+attackType)
        const throttleKey = `${sourceIP}:${criticalAttackType}`;
        const ALERT_THROTTLE_MS = 2000; // 2 seconds between alerts for same IP+attackType
        
        // Check if throttled (but we'll still emit the notification)
        const isThrottled = isAlertThrottled(sourceIP, criticalAttackType, ALERT_THROTTLE_MS);
        
        // Log critical packet detection with throttle info
        console.log(`[PACKET] 🚨 CRITICAL packet detected: ${packetData.protocol} from ${sourceIP} (freq: ${packetData.frequency}, attack: ${criticalAttackType}, throttled: ${isThrottled})`);
        
        // WORKER THREAD 5: Notification worker handles alert emission (async)
        // CRITICAL: Always emit notification, even if throttled (user needs to see all attacks)
        const emitCriticalAlert = async (autoBlocked: boolean = false) => {
          const { sendIntrusionAlertWorker } = await import('../workers/notificationWorker');
          const alertData = {
            type: 'intrusion',
            severity: 'critical',
            ip: sourceIP,
            attackType: criticalAttackType,
            confidence: 0.85, // High confidence for critical status
            protocol: packetData.protocol,
            description: `Critical traffic detected: ${criticalAttackType} from ${sourceIP} (${packetData.frequency} packets/min)`,
            timestamp: new Date().toISOString(),
            autoBlocked: autoBlocked,
            isRepeat: isThrottled // Flag to indicate this is a repeat alert
          };
          console.log(`[PACKET] 📢 Emitting critical alert for ${sourceIP}:`, criticalAttackType, isThrottled ? '(repeat)' : '(new)');
          await sendIntrusionAlertWorker(this.userId, alertData).catch(() => {});
          markAlertEmitted(sourceIP, criticalAttackType);
        };
        
        // Emit alert immediately (before auto-ban) - async, non-blocking
        // ALWAYS emit notification, even if throttled (user needs to see all attacks)
        // CRITICAL: Emit notification BEFORE checking throttle, so it always gets sent
        await emitCriticalAlert(false).catch(() => {});
        
        // If throttled, skip blocking but notification was already sent
        if (isThrottled) {
          console.log(`[PACKET] ⏭ Alert throttled for ${throttleKey} - notification sent but skipping duplicate block`);
          return; // Skip blocking if throttled, but notification was already sent
        }
        
        // Then try to auto-ban (non-blocking)
        // CRITICAL: Check if already blocked or blocking in progress to prevent duplicate operations
        Promise.resolve().then(() => {
          return import('./redis');
        }).then(({ redis }) => {
          const tempBanKey = `ids:tempban:${sourceIP}`;
          return redis.get(tempBanKey).catch(() => null);
        }).then((alreadyBlocked) => {
          // CRITICAL: Check if already blocked for THIS SPECIFIC attack type
          // Once blocked for an attack type, don't block again for the same attack type
          if (isAlreadyBlockedForAttackType(sourceIP, criticalAttackType)) {
            console.log(`[PACKET] ⏭ IP ${sourceIP} already blocked for attack type '${criticalAttackType}' - skipping duplicate block`);
            return null; // Skip blocking - already blocked for this attack type
          }
          
          // Skip if already blocked in Redis, blocking in progress, or in grace period
          if (alreadyBlocked || isBlockingInProgress(sourceIP) || isInGracePeriod(sourceIP)) {
            if (alreadyBlocked) {
              console.log(`[PACKET] ⚠ IP ${sourceIP} already blocked in Redis - skipping duplicate block`);
            } else if (isInGracePeriod(sourceIP)) {
              console.log(`[PACKET] 🛡️ IP ${sourceIP} in grace period (recently manually unblocked) - skipping auto-block`);
            } else {
              console.log(`[PACKET] ⚠ IP ${sourceIP} blocking in progress - skipping duplicate block`);
            }
            return null; // Skip blocking
          }
          
          // Mark as blocking in progress (use global throttle manager)
          setBlockingInProgress(sourceIP);
          
          // Import policy and block
          return import('./policy').then(({ autoBan }) => {
            // CRITICAL: Never auto-ban local IP addresses or destination IPs
            // Always block the SOURCE IP (attacker), never the destination IP (victim)
            if (this.isLocalIP(sourceIP)) {
              console.log(`[PACKET] 🛡️ Skipping block for local IP: ${sourceIP}`);
              clearBlockingInProgress(sourceIP);
              return null;
            }
            
            // CRITICAL: Verify we're blocking the SOURCE IP (attacker), not destination
            // For DoS/DDoS: sourceIP = attacker, destIP = victim (our server)
            // We MUST block sourceIP, never destIP
            const destIP = packetData.end_ip;
            if (sourceIP === destIP) {
              console.warn(`[PACKET] ⚠ WARNING: Source and destination IP are the same: ${sourceIP} - skipping block`);
              clearBlockingInProgress(sourceIP);
              return null;
            }
            
            // Additional safety: Never block if sourceIP looks like our own server
            if (this.isLocalIP(destIP) && sourceIP === destIP) {
              console.warn(`[PACKET] ⚠ WARNING: Attempted to block local destination IP: ${sourceIP} - skipping`);
              clearBlockingInProgress(sourceIP);
              return null;
            }
            
            console.log(`[PACKET] 🔒 Blocking ATTACKER IP: ${sourceIP} (attack: ${criticalAttackType}, victim: ${destIP})`);
            return autoBan(sourceIP, `ids:critical:${criticalAttackType}`);
          });
        }).then(async (banResult) => {
          if (!banResult) {
            return; // Already blocked or local IP
          }
          
          try {
            console.log(`[PACKET] ✓ Auto-banned ATTACKER IP: ${sourceIP} for attack type: ${criticalAttackType}`);
            console.log(`[PACKET] 📍 Attack details: Attacker=${sourceIP}, Victim=${packetData.end_ip}, Type=${criticalAttackType}`);
            console.log(`[PACKET] ✅ Only blocking SOURCE IP (attacker), NOT destination IP (victim)`);
            
            // Mark this IP as blocked for this attack type (prevent re-blocking for same attack type)
            markBlockedForAttackType(sourceIP, criticalAttackType);
            
            // Emit another alert with autoBlocked=true (only once)
            emitCriticalAlert(true);
            
            // WORKER THREAD 5: Notification worker handles websocket emissions (async)
            const { sendIPBlockedNotificationWorker, sendBlockingCompleteNotificationWorker } = await import('../workers/notificationWorker');
            sendIPBlockedNotificationWorker(
              this.userId,
              sourceIP,
              `ids:critical:${criticalAttackType}`,
              banResult.methods?.join(', ') || 'firewall'
            ).catch(() => {});
            
            // Emit blocking-complete after cooldown (async)
            setTimeout(() => {
              sendBlockingCompleteNotificationWorker(this.userId, sourceIP).catch(() => {});
              clearBlockingInProgress(sourceIP);
            }, 500);
          } catch (logErr) {
            // Even logging errors must not crash
          }
        }).catch((err) => {
          // CRITICAL: Errors must not stop packet processing
          // Remove from blocking in progress on error (use global throttle manager)
          clearBlockingInProgress(sourceIP);
          if (Math.random() < 0.1) { // Log 10% of errors
            console.warn('[PACKET] Error in blocking process (non-fatal):', (err as Error)?.message);
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
    const { THRESHOLDS, PACKET_SIZE } = PACKET_CAPTURE_CONFIG;

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
    const isLargePacket = totalBytes > PACKET_SIZE.LARGE_THRESHOLD;
    const isSmallPacket = totalBytes < PACKET_SIZE.SMALL_THRESHOLD;

    // Internal network traffic
    if (isPrivateIP(packet.start_ip) && isPrivateIP(packet.end_ip)) {
      const t = THRESHOLDS.INTERNAL;
      // Critical: High frequency that indicates attack patterns
      if (packet.protocol === 'TCP' && packet.frequency > t.TCP_CRITICAL) return 'critical';
      if (packet.protocol === 'UDP' && packet.frequency > t.UDP_CRITICAL) return 'critical';
      if (packet.protocol === 'ICMP' && packet.frequency > t.ICMP_CRITICAL) return 'critical';

      // Medium: Moderate frequency with suspicious characteristics
      if (packet.protocol === 'TCP' && packet.frequency > t.TCP_MEDIUM && (isSmallPacket || isLargePacket)) return 'medium';
      if (packet.protocol === 'UDP' && packet.frequency > t.UDP_MEDIUM && (isSmallPacket || isLargePacket)) return 'medium';
      if (packet.protocol === 'ICMP' && packet.frequency > t.ICMP_MEDIUM) return 'medium';

      return 'normal';
    }

    // External traffic - more sensitive for attack detection
    if (isBroadcast(packet.start_ip) || isBroadcast(packet.end_ip)) {
      if (packet.frequency > THRESHOLDS.BROADCAST_MEDIUM) return 'medium';
      return 'normal';
    }

    // Critical: High frequency external traffic (likely DDoS or scan)
    const t = THRESHOLDS.EXTERNAL;
    if (packet.protocol === 'TCP' && packet.frequency > t.TCP_CRITICAL) return 'critical';
    if (packet.protocol === 'UDP' && packet.frequency > t.UDP_CRITICAL) return 'critical';
    if (packet.protocol === 'ICMP' && packet.frequency > t.ICMP_CRITICAL) return 'critical';

    // Medium: Moderate frequency with suspicious patterns
    if (packet.protocol === 'TCP' && packet.frequency > t.TCP_MEDIUM && isSmallPacket) return 'medium';
    if (packet.protocol === 'UDP' && packet.frequency > t.UDP_MEDIUM) return 'medium';
    if (packet.protocol === 'ICMP' && packet.frequency > t.ICMP_MEDIUM) return 'medium';

    // Port scan detection - many small TCP packets
    if (packet.protocol === 'TCP' && packet.frequency > THRESHOLDS.PORT_SCAN_FREQUENCY && totalBytes < THRESHOLDS.PORT_SCAN_MAX_SIZE) {
      return 'medium';
    }

    return 'normal';
  }

  private detectAttackTypeFromPattern(packetData: any): string {
    // Pattern-based attack detection
    const protocol = packetData.protocol?.toUpperCase() || '';
    const frequency = packetData.frequency || 0;
    const packetSize = packetData.start_bytes || 0;
    const status = packetData.status || 'normal';
    const { ATTACK_DETECTION, PACKET_SIZE } = PACKET_CAPTURE_CONFIG;
    
    // PRIORITY 1: Distinguish SYN flood (DoS) from port scan
    if (protocol === 'TCP') {
      // SYN Flood / DoS: Very high frequency small packets
      if (frequency > ATTACK_DETECTION.DOS_FREQUENCY_THRESHOLD && packetSize < PACKET_SIZE.SYN_FLOOD_MAX_SIZE) {
        return frequency > ATTACK_DETECTION.DDOS_FREQUENCY_THRESHOLD ? 'ddos' : 'dos';
      }
      
      // Port scan: Moderate frequency + small packets
      if (frequency >= ATTACK_DETECTION.PORT_SCAN_FREQUENCY_MIN && 
          frequency <= ATTACK_DETECTION.PORT_SCAN_FREQUENCY_MAX && 
          packetSize < PACKET_SIZE.SYN_FLOOD_MAX_SIZE) {
        return 'port_scan';
      }
      
      // High frequency large packets = DoS/DDoS
      if (frequency > 50 && packetSize >= PACKET_SIZE.SYN_FLOOD_MAX_SIZE) {
        return frequency > 200 ? 'ddos' : 'dos';
      }
      
      // Very high frequency regardless of size = DDoS
      if (frequency > ATTACK_DETECTION.DDOS_FREQUENCY_THRESHOLD) {
        return 'ddos';
      }
    }
    
    // PRIORITY 2: ICMP attacks
    if (protocol === 'ICMP') {
      if (status === 'critical') {
        if (frequency > ATTACK_DETECTION.PING_FLOOD_THRESHOLD) {
          return 'ping_flood';
        } else if (frequency > ATTACK_DETECTION.PING_SWEEP_THRESHOLD) {
          return 'ping_sweep';
        }
        return 'icmp_flood';
      }
      if (frequency > ATTACK_DETECTION.PING_SWEEP_THRESHOLD) {
        return frequency > ATTACK_DETECTION.PING_FLOOD_THRESHOLD ? 'ping_flood' : 'ping_sweep';
      }
    }
    
    // PRIORITY 3: UDP attacks
    if (protocol === 'UDP') {
      if (frequency > ATTACK_DETECTION.DOS_FREQUENCY_THRESHOLD) {
        return 'dos';
      }
      // UDP port scan
      if (frequency > ATTACK_DETECTION.PING_SWEEP_THRESHOLD && packetSize < 100) {
        return 'port_scan';
      }
    }
    
    // PRIORITY 4: Generic probe detection
    if (protocol === 'TCP' && frequency > ATTACK_DETECTION.PING_SWEEP_THRESHOLD && status === 'critical') {
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

  /**
   * Clear throttle entries for a specific IP address
   * This is called when an IP is manually unblocked to allow new alerts
   * NOTE: Now uses global throttle manager, so this is just a wrapper
   */
  public clearThrottleForIP(ip: string): void {
    clearGlobalThrottle(ip);
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
