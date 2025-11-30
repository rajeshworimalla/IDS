/**
 * Packet Capture Configuration
 * Centralized configuration for better maintainability
 */

export const PACKET_CAPTURE_CONFIG = {
  // Buffer settings
  BUFFER_SIZE: 65535,
  MIN_PACKET_BYTES: 0,
  
  // Database batching
  DB_WRITE_INTERVAL_MS: 500,
  DB_BATCH_SIZE: 100,
  DB_BATCH_SIZE_HIGH_LOAD: 25,
  DB_QUEUE_SIZE_THRESHOLD: 200,
  MAX_DB_QUEUE_SIZE: 1000,
  DB_QUEUE_OVERLOAD_THRESHOLD: 300,
  
  // Socket emissions
  SOCKET_EMISSION_INTERVAL_MS: 10000,
  MAX_SOCKET_QUEUE_SIZE: 1,
  DISABLE_NORMAL_PACKET_EMISSIONS: true,
  
  // Rate limiting
  ML_RATE_LIMIT_PER_SECOND: 5,
  ML_RATE_LIMIT_MAX_ENTRIES: 1000,
  ML_RATE_LIMIT_CLEANUP_AGE_SEC: 60,
  
  // Frequency tracking
  FREQUENCY_CLEANUP_INTERVAL_MS: 300000, // 5 minutes
  FREQUENCY_CLEANUP_AGE_MINUTES: 10,
  
  // Attack detection thresholds
  THRESHOLDS: {
    // Internal network (private IPs)
    INTERNAL: {
      TCP_CRITICAL: 30,
      TCP_MEDIUM: 15,
      UDP_CRITICAL: 100,
      UDP_MEDIUM: 40,
      ICMP_CRITICAL: 20,
      ICMP_MEDIUM: 10,
    },
    // External network
    EXTERNAL: {
      TCP_CRITICAL: 20,
      TCP_MEDIUM: 10,
      UDP_CRITICAL: 50,
      UDP_MEDIUM: 20,
      ICMP_CRITICAL: 15,
      ICMP_MEDIUM: 5,
    },
    // Broadcast
    BROADCAST_MEDIUM: 20,
    // Port scan
    PORT_SCAN_FREQUENCY: 200,
    PORT_SCAN_MAX_SIZE: 100,
  },
  
  // Packet size analysis
  PACKET_SIZE: {
    LARGE_THRESHOLD: 1500, // MTU
    SMALL_THRESHOLD: 64,   // Minimum Ethernet frame
    SYN_FLOOD_MAX_SIZE: 150,
  },
  
  // Attack type detection
  ATTACK_DETECTION: {
    DOS_FREQUENCY_THRESHOLD: 100,
    DDOS_FREQUENCY_THRESHOLD: 300,
    PORT_SCAN_FREQUENCY_MIN: 10,
    PORT_SCAN_FREQUENCY_MAX: 100,
    PING_FLOOD_THRESHOLD: 30,
    PING_SWEEP_THRESHOLD: 20,
  },
  
  // Confidence scoring
  CONFIDENCE: {
    DEFAULT: 0.5,
    CRITICAL_BASE: 0.85,
    MEDIUM_BASE: 0.65,
    DDoS_BOOST: 0.1,
    PORT_SCAN_BOOST: 0.05,
    MAX: 0.95,
    PORT_SCAN_MAX: 0.90,
    AUTO_BLOCK_THRESHOLD: 0.6,
    ALERT_THRESHOLD: 0.3,
  },
  
  // Health monitoring
  HEALTH_CHECK: {
    INTERVAL_MS: 30000, // 30 seconds
    PACKET_TIMEOUT_MS: 60000, // 1 minute
  },
  
  // Logging
  LOGGING: {
    FIRST_PACKET_LOG: true,
    PERIODIC_LOG_PROBABILITY: 0.002, // 0.2% chance
    HIGH_FREQUENCY_LOG_PROBABILITY: 0.1, // 10%
    BLOCKED_IP_LOG_PROBABILITY: 0.1, // 10%
    DB_BATCH_LOG_PROBABILITY: 0.05, // 5%
    JOB_FAILURE_LOG_PROBABILITY: 0.01, // 1%
  },
} as const;

