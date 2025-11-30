/**
 * WORKER THREAD: Packet Analysis Worker
 * 
 * Handles:
 * - Packet analysis and attack detection
 * - ML prediction (rule-based)
 * - Attack type classification
 * - False positive reduction
 * 
 * This runs in a separate thread to prevent blocking packet capture.
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { Packet as PacketModel } from '../models/Packet';

// Attack detection thresholds (tuned to reduce false positives)
const DETECTION_THRESHOLDS = {
  // DoS: Very high frequency (> 200 packets/min)
  DOS_MIN_FREQUENCY: 200,
  DOS_MIN_PACKETS: 50, // Need at least 50 packets in 1 minute
  
  // DDoS: Extremely high frequency (> 500 packets/min)
  DDOS_MIN_FREQUENCY: 500,
  DDOS_MIN_PACKETS: 100,
  
  // Port Scan: Moderate frequency (10-100 packets/min) with small packets
  PORT_SCAN_MIN_FREQUENCY: 10,
  PORT_SCAN_MAX_FREQUENCY: 100,
  PORT_SCAN_MIN_PACKETS: 5, // Need at least 5 packets to detect scan
  
  // ICMP Flood: High ICMP frequency
  ICMP_FLOOD_MIN_FREQUENCY: 30,
  
  // UDP Flood: High UDP frequency
  UDP_FLOOD_MIN_FREQUENCY: 50,
  
  // Minimum packet size for flood detection (small packets = flood)
  FLOOD_MAX_PACKET_SIZE: 150
};

// Track packet frequencies per IP (for accurate detection)
const ipFrequencyTracker: Map<string, { count: number; startTime: number; packets: number[] }> = new Map();
const FREQUENCY_WINDOW_MS = 60000; // 1 minute window

/**
 * Calculate accurate frequency for an IP
 */
function calculateFrequency(ip: string, packetSize: number): number {
  const now = Date.now();
  let tracker = ipFrequencyTracker.get(ip);
  
  if (!tracker) {
    tracker = { count: 1, startTime: now, packets: [packetSize] };
    ipFrequencyTracker.set(ip, tracker);
    return 1;
  }
  
  // Remove packets outside the 1-minute window
  const windowStart = now - FREQUENCY_WINDOW_MS;
  if (tracker.startTime < windowStart) {
    // Reset if window expired
    tracker.count = 1;
    tracker.startTime = now;
    tracker.packets = [packetSize];
  } else {
    tracker.count++;
    tracker.packets.push(packetSize);
  }
  
  // Calculate packets per minute
  const elapsedMinutes = (now - tracker.startTime) / 60000;
  return Math.round(tracker.count / Math.max(elapsedMinutes, 0.016)); // At least 1 second
}

/**
 * Detect attack type with improved thresholds (reduces false positives)
 */
function detectAttackType(packetData: any): { attackType: string; confidence: number } {
  const protocol = (packetData.protocol || '').toUpperCase();
  const frequency = packetData.frequency || 0;
  const packetSize = packetData.start_bytes || 0;
  const status = packetData.status || 'normal';
  
  // Only detect attacks on medium/critical status (reduces false positives)
  if (status === 'normal') {
    return { attackType: 'normal', confidence: 0 };
  }
  
  // TCP-based attacks
  if (protocol === 'TCP') {
    // DDoS: Extremely high frequency
    if (frequency >= DETECTION_THRESHOLDS.DDOS_MIN_FREQUENCY && 
        ipFrequencyTracker.get(packetData.start_ip)?.packets.length >= DETECTION_THRESHOLDS.DDOS_MIN_PACKETS) {
      return { attackType: 'ddos', confidence: Math.min(0.95, 0.7 + (frequency / 1000) * 0.25) };
    }
    
    // DoS: High frequency but not DDoS level
    if (frequency >= DETECTION_THRESHOLDS.DOS_MIN_FREQUENCY && 
        frequency < DETECTION_THRESHOLDS.DDOS_MIN_FREQUENCY &&
        ipFrequencyTracker.get(packetData.start_ip)?.packets.length >= DETECTION_THRESHOLDS.DOS_MIN_PACKETS) {
      return { attackType: 'dos', confidence: Math.min(0.90, 0.6 + (frequency / 500) * 0.3) };
    }
    
    // Port Scan: Moderate frequency with small packets
    if (frequency >= DETECTION_THRESHOLDS.PORT_SCAN_MIN_FREQUENCY && 
        frequency <= DETECTION_THRESHOLDS.PORT_SCAN_MAX_FREQUENCY &&
        packetSize < DETECTION_THRESHOLDS.FLOOD_MAX_PACKET_SIZE &&
        ipFrequencyTracker.get(packetData.start_ip)?.packets.length >= DETECTION_THRESHOLDS.PORT_SCAN_MIN_PACKETS) {
      return { attackType: 'port_scan', confidence: Math.min(0.85, 0.5 + (frequency / 100) * 0.35) };
    }
  }
  
  // ICMP attacks
  if (protocol === 'ICMP') {
    if (frequency >= DETECTION_THRESHOLDS.ICMP_FLOOD_MIN_FREQUENCY) {
      return { attackType: 'ping_flood', confidence: Math.min(0.90, 0.6 + (frequency / 100) * 0.3) };
    }
    if (frequency >= 20 && frequency < DETECTION_THRESHOLDS.ICMP_FLOOD_MIN_FREQUENCY) {
      return { attackType: 'ping_sweep', confidence: 0.75 };
    }
  }
  
  // UDP attacks
  if (protocol === 'UDP') {
    if (frequency >= DETECTION_THRESHOLDS.UDP_FLOOD_MIN_FREQUENCY) {
      return { attackType: 'udp_flood', confidence: Math.min(0.90, 0.6 + (frequency / 200) * 0.3) };
    }
  }
  
  return { attackType: 'suspicious_traffic', confidence: 0.5 };
}

/**
 * Process packet analysis (called from worker)
 */
function analyzePacket(packetData: any): any {
  // Calculate accurate frequency
  const frequency = calculateFrequency(packetData.start_ip, packetData.start_bytes);
  packetData.frequency = frequency;
  
  // Detect attack type
  const detection = detectAttackType(packetData);
  packetData.attack_type = detection.attackType;
  packetData.confidence = detection.confidence;
  packetData.is_malicious = detection.attackType !== 'normal' && detection.attackType !== 'suspicious_traffic';
  
  return packetData;
}

// Worker thread handler
if (!isMainThread && parentPort) {
  parentPort.on('message', async (data: { type: string; packet: any; userId: string }) => {
    try {
      if (data.type === 'analyze') {
        const analyzedPacket = analyzePacket(data.packet);
        
        // Send result back to main thread
        parentPort!.postMessage({
          type: 'analyzed',
          packet: analyzedPacket,
          userId: data.userId
        });
      }
    } catch (err) {
      // Send error back
      parentPort!.postMessage({
        type: 'error',
        error: (err as Error).message,
        packet: data.packet
      });
    }
  });
}

/**
 * Create and manage packet analysis worker
 */
export class PacketAnalysisWorker {
  private worker: Worker | null = null;
  private isRunning = false;
  
  constructor() {
    // Worker is created on-demand
  }
  
  /**
   * Start the analysis worker
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.worker = new Worker(__filename);
    
    this.worker.on('error', (err) => {
      console.error('[ANALYSIS-WORKER] Error:', err);
      this.isRunning = false;
    });
    
    this.worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[ANALYSIS-WORKER] Worker stopped with exit code ${code}`);
      }
      this.isRunning = false;
    });
    
    console.log('[ANALYSIS-WORKER] ✅ Started packet analysis worker thread');
  }
  
  /**
   * Analyze a packet (non-blocking)
   */
  analyze(packet: any, userId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this.isRunning) {
        // Fallback to inline analysis if worker not available
        resolve(analyzePacket(packet));
        return;
      }
      
      const timeout = setTimeout(() => {
        // Timeout after 5 seconds - fallback to inline
        console.warn('[ANALYSIS-WORKER] Analysis timeout, using inline fallback');
        resolve(analyzePacket(packet));
      }, 5000);
      
      const messageHandler = (msg: any) => {
        if (msg.type === 'analyzed' && msg.packet.start_ip === packet.start_ip) {
          clearTimeout(timeout);
          this.worker!.removeListener('message', messageHandler);
          resolve(msg.packet);
        } else if (msg.type === 'error' && msg.packet.start_ip === packet.start_ip) {
          clearTimeout(timeout);
          this.worker!.removeListener('message', messageHandler);
          reject(new Error(msg.error));
        }
      };
      
      this.worker.on('message', messageHandler);
      this.worker.postMessage({ type: 'analyze', packet, userId });
    });
  }
  
  /**
   * Stop the worker
   */
  stop(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isRunning = false;
      console.log('[ANALYSIS-WORKER] Stopped');
    }
  }
}

// Export for use in main thread
export { analyzePacket, calculateFrequency, detectAttackType, DETECTION_THRESHOLDS };

