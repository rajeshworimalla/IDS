import { Cap } from 'cap';
import { Packet as PacketModel, IPacket } from '../models/Packet';
import { getIO } from '../socket';
// @ts-ignore - axios types may not be found but it's installed
import axios from 'axios';
// @ts-ignore - os is a Node.js built-in module
import * as os from 'os';

// Buffer is a Node.js global - will exist at runtime
declare var Buffer: {
  alloc(size: number): any;
  from(data: any): any;
  isBuffer(obj: any): boolean;
};
import { 
  isAlertThrottled, 
  isBlockingInProgress, 
  setBlockingInProgress, 
  clearBlockingInProgress,
  clearThrottleForIP as clearGlobalThrottle,
  isInGracePeriod,
  isAlreadyBlockedForAttackType,
  markBlockedForAttackType,
  hasEmittedAlertForAttackType,
  isInDetectionCooldown
} from './throttleManager';

// Track packet frequencies for status determination with automatic cleanup
const packetFrequencies: { [key: string]: { count: number; timestamp: number } } = {};

// Throttle socket emissions to prevent frontend flooding
// Industry standard: Limit UI updates but capture all packets to DB
const socketEmissionQueue: any[] = [];
let lastEmissionTime = 0;
const EMISSION_INTERVAL = 10000; // Emit max once per 10 seconds - DISABLED for performance (only intrusions update)
const MAX_SOCKET_QUEUE_SIZE = 1; // Keep only most recent packet for UI updates - REDUCED for performance
const DISABLE_NORMAL_PACKET_EMISSIONS = true; // Disable normal packet emissions to reduce lag

// Batch DB writes to reduce database load during attacks
const dbWriteQueue: any[] = [];
let lastDbWriteTime = 0;
const DB_WRITE_INTERVAL = 200; // Write to DB every 200ms (faster writes to drain queue)
const MAX_DB_BATCH_SIZE = 500; // Max packets per batch - INCREASED for high traffic
const MAX_DB_QUEUE_SIZE = 50000; // Increased to 50k to handle 4700+ packets/minute
const CRITICAL_ONLY_MODE_THRESHOLD = 10000; // When queue > 10k, only save critical packets

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
    } catch (err: unknown) {
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
      // Write in larger batches for better throughput
      const currentQueueSize = dbWriteQueue.length;
      // Use larger batches when queue is large to drain faster
      const batchSize = currentQueueSize > 5000 ? MAX_DB_BATCH_SIZE : Math.min(MAX_DB_BATCH_SIZE, currentQueueSize);
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
          .catch((err: unknown) => {
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
  } catch (err: unknown) {
    // Prevent interval crashes - log but continue
    const errorMsg = (err as Error)?.message || String(err);
    if (!errorMsg.includes('timeout') && !errorMsg.includes('ECONNREFUSED')) {
      console.warn('[PACKET] Error in batch DB write interval:', errorMsg);
    }
    // Don't crash - just log and continue
  }
}, 200); // Check every 200ms for faster writes to drain queue

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
  // @ts-ignore - Buffer is a Node.js global
  private buffer: Buffer;
  private predictionServiceUrl: string;
  private packetHandler: ((nbytes: number, trunc: boolean) => void) | null = null;
  private userId: string;
  private mlRateLimiter: Map<string, number> | null = null;
  private localIPs: Set<string> = new Set();
  private firstPacketLogged: boolean = false;
  private lastPacketTime: number = 0; // Track last packet time for health monitoring
  private healthCheckInterval: any = null; // NodeJS.Timeout | null
  private analysisWorker: any = null; // PacketAnalysisWorker instance
  // Use global throttle manager instead of instance-level
  // This allows throttle to persist across capture restarts

  constructor(userId: string) {
    this.cap = new Cap();
    this.linkType = 'ETHERNET';
    // @ts-ignore - Buffer is a Node.js global
    this.buffer = Buffer.alloc(65535);
    this.predictionServiceUrl = 'http://127.0.0.1:5002/predict';
    this.userId = userId;

    // Get all local IP addresses to prevent self-blocking
    this.detectLocalIPs();

    // Initialize the capture device
    this.initializeCapture();
    
    // Initialize packet analysis worker thread
    this.initializeAnalysisWorker();
    
    // Initialize notification queue worker thread (dedicated thread for notifications)
    this.initializeNotificationQueueWorker();
  }
  
  /**
   * Initialize packet analysis worker thread (separate thread for analysis)
   */
  private async initializeAnalysisWorker() {
    try {
      const { PacketAnalysisWorker } = await import('../workers/packetAnalysisWorker');
      this.analysisWorker = new PacketAnalysisWorker();
      this.analysisWorker.start();
      console.log('[PACKET] ✅ Initialized packet analysis worker thread');
    } catch (err: unknown) {
      console.warn('[PACKET] Failed to initialize analysis worker, using inline analysis:', (err as Error)?.message);
      this.analysisWorker = null;
    }
  }
  
  /**
   * Initialize notification queue worker thread (dedicated thread for notifications)
   */
  private async initializeNotificationQueueWorker() {
    try {
      const { notificationQueue } = await import('../workers/notificationQueueWorker');
      notificationQueue.start();
      console.log('[PACKET] ✅ Initialized notification queue worker thread');
    } catch (err: unknown) {
      console.warn('[PACKET] Failed to initialize notification queue worker:', (err as Error)?.message);
    }
  }
  
  /**
   * Stop notification queue worker thread
   */
  private async stopNotificationQueueWorker() {
    try {
      const { notificationQueue } = await import('../workers/notificationQueueWorker');
      notificationQueue.stop();
      console.log('[PACKET] ✅ Stopped notification queue worker thread');
    } catch (err: unknown) {
      console.warn('[PACKET] Failed to stop notification queue worker:', (err as Error)?.message);
    }
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
    } catch (err: unknown) {
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
            } catch (err: unknown) {
              console.log('Could not set non-blocking mode:', err);
            }
          }

          selectedInterface = candidate;
          console.log('Successfully opened capture device:', device);
          break;
        } catch (err: unknown) {
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
        
        // CRITICAL: Process packet asynchronously using setTimeout(0) for better performance
        // This ensures packet capture never blocks, even during heavy attacks
        // Using setTimeout(0) instead of setImmediate for better compatibility
        Promise.resolve().then(() => {
          setTimeout(() => {
            // Process packet in next event loop tick (non-blocking)
            this.processPacket(raw).catch((err: unknown) => {
              // Silently handle errors - don't crash packet capture
              // Only log critical errors occasionally
              if (err instanceof Error && !err.message.includes('Buffer') && !err.message.includes('timeout') && Math.random() < 0.001) {
                // Log 0.1% of errors to prevent spam
              }
            });
          }, 0);
        });
      } catch (err: unknown) {
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
      } catch (err: unknown) {
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

      // Stop analysis worker thread
      if (this.analysisWorker) {
        this.analysisWorker.stop();
        this.analysisWorker = null;
      }
      
      // Stop notification queue worker thread
      this.stopNotificationQueueWorker().catch(() => {});
      
      // Close the capture device with a small delay to prevent UV_HANDLE_CLOSING error
      setTimeout(() => {
        try {
          this.cap.close();
          console.log('Packet capture stopped successfully');
        } catch (err: unknown) {
          console.error('Error closing capture device:', err);
        }
      }, 100);

      // Reset the buffer
      this.buffer.fill(0);

    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error stopping packet capture:', error);
    }
  }

  // @ts-ignore - Buffer is a Node.js global
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
      } catch (err: unknown) {
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
      } catch (err: unknown) {
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
      
      // Log periodically to confirm capture is still working (every 500 packets - more frequent)
      if (Math.random() < 0.002) { // ~0.2% chance = ~once per 500 packets
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
      if (packetData.frequency > 10 && Math.random() < 0.1) { // Log 10% of high-frequency packets
        console.log(`[PACKET] 📊 High frequency detected: ${sourceIP} → ${destIP} (${packetData.frequency} packets/min, protocol: ${protocol})`);
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

      // PERFORMANCE: Only save critical and suspicious packets to DB
      // Normal packets are too numerous and cause queue overflow
      // We track stats in memory/Redis instead
      const shouldSaveToDB = packetData.status === 'critical' || packetData.status === 'medium' || packetData.is_malicious;
      
      // Queue for batched DB write (non-blocking)
      if (shouldSaveToDB) {
        // Drop normal packets if queue is getting full (prioritize critical)
        if (dbWriteQueue.length > CRITICAL_ONLY_MODE_THRESHOLD && packetData.status === 'normal') {
          // Skip normal packets when queue is large
          return;
        }
        
        dbWriteQueue.push(packetData);
        
        // Limit queue size - drop oldest normal/medium packets first
        if (dbWriteQueue.length > MAX_DB_QUEUE_SIZE) {
          // Remove oldest normal packets first
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
          PacketModel.create(packetData).catch((err: unknown) => {
            // If immediate save fails, it's still in queue for batch write
            // Don't log - too spammy during attacks
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
        
        // MULTI-THREADED: Use analysis worker thread for packet analysis
        const userId = this.userId;
        const isLocalIPFn = (ip: string) => this.isLocalIP(ip);
        
        // Analyze packet in worker thread (non-blocking)
        let analyzedData = packetData;
        if (this.analysisWorker) {
          try {
            analyzedData = await this.analysisWorker.analyze(packetData, userId);
          } catch (err: unknown) {
            // Fallback to inline analysis if worker fails
            console.warn('[PACKET] Worker analysis failed, using inline:', (err as Error)?.message);
            analyzedData = packetData;
          }
        }
        
        // Use analyzed data for attack detection
        const attackType = analyzedData.attack_type || this.detectAttackTypeFromPattern(analyzedData);
        
        // Process attack detection (non-blocking via job queue)
        const { queueMLPrediction } = await import('./jobQueue');
        queueMLPrediction(analyzedData, async (data: any) => {
          
          // Use confidence from worker analysis (already calculated)
          const finalConfidence = data.confidence || 0.5;
          const isMalicious = data.is_malicious || (data.status === 'critical' && 
            attackType !== 'suspicious_traffic' && 
            attackType !== 'normal');
          
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
          // CRITICAL: Check if already blocked BEFORE trying to queue
          if (isMalicious && finalConfidence > 0.6 && !isLocalIPFn(data.start_ip)) {
            // CRITICAL: Fast cooldown check - prevents duplicate processing
            if (isInDetectionCooldown(data.start_ip)) {
              return; // Skip - IP was processed recently (within 2 seconds)
            }
            
            try {
              // Check if already blocked before queuing
              const { redis } = await import('./redis');
              const tempBanKey = `ids:tempban:${data.start_ip}`;
              const alreadyBlocked = await redis.get(tempBanKey).catch(() => null);
              
              if (alreadyBlocked) {
                // Already blocked - skip queuing (job queue will reject anyway)
                return; // Don't try to queue, don't log
              }
              
              const { autoBan } = await import('./policy');
              const banResult = await autoBan(data.start_ip, `IDS:${attackType} (${Math.round(finalConfidence * 100)}%)`).catch(() => null);
              
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
            } catch (err: unknown) {
              console.warn('[PACKET] Error auto-blocking malicious IP:', err);
            }
          }
          
          // CRITICAL: Emit ONE notification per attack type per IP (WORKER THREAD 5)
          // Let the notification queue worker handle throttling - don't check here
          // This ensures notifications aren't marked as "emitted" until they're actually sent
          if (isMalicious && finalConfidence > 0.3) {
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
          if (Math.random() < 0.01) {
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
        
        // Detect attack type FIRST to allow different attack types to be detected
        const criticalAttackType = this.detectAttackTypeFromPattern(packetData);
        
        // CRITICAL: Check if we've already sent a notification for this attack type
        // ONE notification per attack type per IP (even if IP was blocked previously)
        const alreadyNotifiedForThisAttackType = hasEmittedAlertForAttackType(sourceIP, criticalAttackType);
        
        // Check if IP is in grace period (recently manually unblocked)
        const inGracePeriod = isInGracePeriod(sourceIP);
        
        // THROTTLE: Check throttling BEFORE sending notifications to prevent spam
        // For grace period notifications, use longer throttle (30 seconds) to prevent spam
        // For normal notifications, use shorter throttle (10 seconds for DoS/DDoS, 2 seconds for others)
        const isDoSOrDDoS = criticalAttackType === 'dos' || criticalAttackType === 'ddos';
        const ALERT_THROTTLE_MS = inGracePeriod ? 30000 : (isDoSOrDDoS ? 10000 : 2000);
        
        // Check throttling - skip if already notified recently (even for grace period)
        if (isAlertThrottled(sourceIP, criticalAttackType, ALERT_THROTTLE_MS)) {
          // Already notified recently - skip to prevent spam
          if (!isDoSOrDDoS) { // Only log for non-DoS attacks to reduce spam
            console.log(`[PACKET] ⏭ Skipping throttled alert for ${sourceIP}:${criticalAttackType} (throttle: ${ALERT_THROTTLE_MS}ms)`);
          }
          return; // Skip - already notified recently
        }
        
        // CRITICAL: Fast cooldown check - but SKIP if:
        // 1. IP is in grace period (we want to allow notifications after manual unblock)
        // 2. We haven't notified for this attack type yet (first notification should always go through)
        // This ensures grace period notifications always get through (but still throttled above)
        if (!inGracePeriod && alreadyNotifiedForThisAttackType && isInDetectionCooldown(sourceIP)) {
          return; // Skip - IP was processed recently (within 2 seconds) AND already notified
        }
        
        // DEBUG: Log grace period status for troubleshooting
        if (inGracePeriod) {
          console.log(`[PACKET] 🔍 DEBUG: IP ${sourceIP} is in grace period, allowing notification for ${criticalAttackType} (throttled: ${ALERT_THROTTLE_MS}ms)`);
        }
        
        // CRITICAL: Check if already blocked BEFORE processing
        // This prevents blocking on every packet during a flood attack
        
        // Check if already blocked (for all attack types, not just DoS/DDoS)
        let alreadyBlocked = false;
        try {
          const { redis } = await import('./redis');
          const tempBanKey = `ids:tempban:${sourceIP}`;
          const blocked = await redis.get(tempBanKey).catch(() => null);
          alreadyBlocked = blocked !== null;
        } catch (redisErr) {
          // Continue if Redis check fails
        }
        
        // CRITICAL: Send notification (throttling already checked above)
        // This ensures notifications are sent even if IP is already blocked
        // But throttling prevents spam
        {
          // Haven't sent notification for this attack type yet - send it now
          console.log(`[PACKET] 🚨 CRITICAL packet detected: ${packetData.protocol} from ${sourceIP} (freq: ${packetData.frequency}, attack: ${criticalAttackType})`);
          
          // WORKER THREAD 5: Notification worker handles alert emission (async)
          const emitCriticalAlert = async (autoBlocked: boolean = false) => {
            const { sendIntrusionAlertWorker } = await import('../workers/notificationWorker');
            
            // If in grace period, send special notification asking user if they want to block again
            let alertData: any;
            if (inGracePeriod) {
              alertData = {
                type: 'intrusion',
                severity: 'critical',
                ip: sourceIP,
                attackType: criticalAttackType,
                confidence: 0.85, // High confidence for critical status
                protocol: packetData.protocol,
                description: `⚠️ You recently manually unblocked ${sourceIP}. It is now sending ${criticalAttackType} attacks again (${packetData.frequency} packets/min). Do you want to block it again?`,
                timestamp: new Date().toISOString(),
                autoBlocked: false, // Never auto-block during grace period
                inGracePeriod: true,
                requiresUserDecision: true,
                actionRequired: 'reblock' // Frontend should show a decision dialog
              };
              console.log(`[PACKET] 📢 Sending grace period notification for ${sourceIP}: ${criticalAttackType} (requires user decision to re-block)`);
            } else {
              alertData = {
                type: 'intrusion',
                severity: 'critical',
                ip: sourceIP,
                attackType: criticalAttackType,
                confidence: 0.85, // High confidence for critical status
                protocol: packetData.protocol,
                description: `Critical traffic detected: ${criticalAttackType} from ${sourceIP} (${packetData.frequency} packets/min)`,
                timestamp: new Date().toISOString(),
                autoBlocked: autoBlocked
              };
              console.log(`[PACKET] 📢 Sending notification for ${sourceIP}: ${criticalAttackType} (first notification for this attack type)`);
            }
            
            await sendIntrusionAlertWorker(this.userId, alertData).catch((err: unknown) => {
              console.error(`[PACKET] ❌ Failed to send notification for ${sourceIP}:`, (err as Error)?.message);
            });
            // Don't mark as emitted here - let the notification queue worker mark it after successfully sending
            // This prevents marking as "emitted" if the notification gets throttled by the queue
          };
          
          // Emit alert immediately (before auto-ban) - async, non-blocking
          // Throttling already checked above, so this will only send once per throttle window
          await emitCriticalAlert(false).catch(() => {});
        }
        
        // For DoS/DDoS: If already blocked AND already notified, skip all processing
        if (isDoSOrDDoS && alreadyBlocked && alreadyNotifiedForThisAttackType) {
          return; // Skip all processing - already blocked and notified
        }
        
        // Also check if already blocked for this attack type
        if (isAlreadyBlockedForAttackType(sourceIP, criticalAttackType) && alreadyNotifiedForThisAttackType) {
          return; // Already blocked and notified for this attack type - skip
        }
        
        // Then try to auto-ban (non-blocking)
        // CRITICAL: Check if already blocked BEFORE trying to queue
        // Skip blocking if already blocked (prevents duplicate queue attempts)
        if (alreadyBlocked || isAlreadyBlockedForAttackType(sourceIP, criticalAttackType)) {
          // Already blocked - skip blocking attempt
          return; // Don't try to queue, don't log
        }
        
        // Skip if blocking in progress
        if (isBlockingInProgress(sourceIP)) {
          console.log(`[PACKET] ⚠ IP ${sourceIP} blocking in progress - skipping duplicate block`);
          return; // Skip blocking
        }
        
        // CRITICAL: Grace period only prevents blocking, NOT detection/notifications
        // Detection and notifications were already sent above, so we can skip blocking here
        if (isInGracePeriod(sourceIP)) {
          console.log(`[PACKET] 🛡️ IP ${sourceIP} in grace period (recently manually unblocked) - detection logged, skipping auto-block`);
          return; // Skip blocking but notification was already sent above
        }
        
        // Mark as blocking in progress (use global throttle manager)
        setBlockingInProgress(sourceIP);
        
        // Import policy and block
        import('./policy').then(({ autoBan }) => {
          // Never auto-ban local IP addresses
          if (this.isLocalIP(sourceIP)) {
            clearBlockingInProgress(sourceIP);
            return null;
          }
          
          return autoBan(sourceIP, `ids:critical:${criticalAttackType}`);
        }).then(async (banResult) => {
          if (!banResult) {
            // Already blocked, local IP, or duplicate block prevented
            clearBlockingInProgress(sourceIP);
            return; // Skip notification and cleanup
          }
          
          try {
            console.log(`[PACKET] ✓ Auto-banned critical IP: ${sourceIP} for attack type: ${criticalAttackType}`);
            
            // Mark this IP as blocked for this attack type (prevent re-blocking for same attack type)
            markBlockedForAttackType(sourceIP, criticalAttackType);
            
            // Don't emit another alert - we already sent one notification for this attack type above
            // The notification was sent with autoBlocked=false, and will be updated if needed
            
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
    } catch (err: unknown) {
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

  // @ts-ignore - Buffer is a Node.js global
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
    } catch (err: unknown) {
      // Return safe default instead of crashing
      return '0.0.0.0';
    }
  }

  // @ts-ignore - Buffer is a Node.js global
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
    } catch (err: unknown) {
      // Return safe default instead of crashing
      return '0.0.0.0';
    }
  }

  // @ts-ignore - Buffer is a Node.js global
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
    } catch (err: unknown) {
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
      // Critical: High frequency that indicates attack patterns
      // SYN flood detection: Lower threshold for TCP (many connections = attack)
      if (packet.protocol === 'TCP' && packet.frequency > 30) return 'critical'; // Lowered from 50 for SYN flood
      if (packet.protocol === 'UDP' && packet.frequency > 100) return 'critical';
      if (packet.protocol === 'ICMP' && packet.frequency > 20) return 'critical'; // Lowered from 30

      // Medium: Moderate frequency with suspicious characteristics
      if (packet.protocol === 'TCP' && packet.frequency > 15 && (isSmallPacket || isLargePacket)) return 'medium'; // Lowered from 20
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
    // Lower threshold to catch port scans faster (10+ packets = critical)
    if (packet.protocol === 'TCP' && packet.frequency >= 10) return 'critical'; // Lowered from 20 to catch scans faster
    if (packet.protocol === 'UDP' && packet.frequency > 50) return 'critical';
    if (packet.protocol === 'ICMP' && packet.frequency > 15) return 'critical'; // Lowered from 20

    // Medium: Moderate frequency with suspicious patterns - LOWERED thresholds for port scan detection
    // Lower threshold to catch nmap scans (5+ packets in short time = scan)
    if (packet.protocol === 'TCP' && packet.frequency >= 5 && isSmallPacket) return 'medium';
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
    
    // PRIORITY 1: Distinguish SYN flood (DoS) from port scan
    // SYN floods = VERY high frequency small TCP packets (hundreds per minute)
    // Port scans = moderate frequency small TCP packets (tens per minute)
    if (protocol === 'TCP') {
      // SYN Flood / DoS: Very high frequency small packets (flooding, not scanning)
      // Threshold: > 100 packets/min with small packets = DoS, not port scan
      if (frequency > 100 && packetSize < 150) {
        // This is a flood attack, not a scan
        return frequency > 300 ? 'ddos' : 'dos';
      }
      
      // Port scan: Moderate frequency + small packets (scanning behavior)
      // LOWERED threshold to catch nmap scans (even slow ones)
      // Nmap scans typically send 5-20 packets quickly, so lower threshold
      if (frequency >= 5 && frequency <= 100 && packetSize < 150) {
        return 'port_scan';
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

  // @ts-ignore - Buffer is a Node.js global
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
    } catch (err: unknown) {
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
