/**
 * Background Job Queue System
 * 
 * This service handles all heavy operations asynchronously to prevent blocking
 * the main packet capture loop. Operations are queued and processed by worker threads.
 * 
 * Priority levels:
 * - critical: Firewall blocking (must happen fast)
 * - high: ML predictions, logging
 * - normal: Dashboard updates, notifications
 */

type JobPriority = 'critical' | 'high' | 'normal';

interface Job<T = any> {
  id: string;
  type: string;
  priority: JobPriority;
  data: T;
  handler: (data: T) => Promise<any>;
  retries: number;
  maxRetries: number;
  createdAt: number;
}

class JobQueue {
  private queues: Map<JobPriority, Job[]> = new Map([
    ['critical', []],
    ['high', []],
    ['normal', []]
  ]);
  
  private processing: Set<string> = new Set();
  // PERFORMANCE: Track jobs by IP to prevent duplicates
  private jobsByIP: Map<string, Set<string>> = new Map(); // IP -> Set of job IDs
  private workers: number = 0;
  private maxWorkers: number = 5; // Process up to 5 jobs concurrently
  private stats = {
    processed: 0,
    failed: 0,
    queued: 0,
    duplicatesRejected: 0
  };

  constructor() {
    // Start processing loop
    this.startProcessing();
  }

  /**
   * Add a job to the queue
   * @param uniqueKey Optional key for deduplication (e.g., IP address for block-ip jobs)
   */
  async add<T>(
    type: string,
    data: T,
    handler: (data: T) => Promise<any>,
    priority: JobPriority = 'normal',
    maxRetries: number = 3,
    uniqueKey?: string
  ): Promise<string> {
    // PERFORMANCE: Prevent duplicate jobs for the same IP
    if (uniqueKey) {
      const existingJobs = this.jobsByIP.get(uniqueKey) || new Set();
      
      // Check if job is already processing
      for (const jobId of existingJobs) {
        if (this.processing.has(jobId)) {
          this.stats.duplicatesRejected++;
          console.log(`[JOB-QUEUE] ⏭ Rejected duplicate ${type} job for ${uniqueKey} (already processing)`);
          return jobId; // Return existing job ID
        }
      }
      
      // Check if job is already queued
      for (const queue of this.queues.values()) {
        for (const queuedJob of queue) {
          if (existingJobs.has(queuedJob.id)) {
            this.stats.duplicatesRejected++;
            console.log(`[JOB-QUEUE] ⏭ Rejected duplicate ${type} job for ${uniqueKey} (already queued)`);
            return queuedJob.id; // Return existing job ID
          }
        }
      }
    }

    const job: Job<T> = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      priority,
      data,
      handler,
      retries: 0,
      maxRetries,
      createdAt: Date.now()
    };

    // Track job by unique key for deduplication
    if (uniqueKey) {
      if (!this.jobsByIP.has(uniqueKey)) {
        this.jobsByIP.set(uniqueKey, new Set());
      }
      this.jobsByIP.get(uniqueKey)!.add(job.id);
    }

    const queue = this.queues.get(priority) || this.queues.get('normal')!;
    queue.push(job);
    this.stats.queued++;
    
    // Log critical jobs
    if (priority === 'critical') {
      console.log(`[JOB-QUEUE] Queued critical job: ${type} (${this.getQueueSize('critical')} in queue)`);
      // Trigger immediate processing for critical jobs
      this.triggerProcessing();
    }
    
    return job.id;
  }

  /**
   * Get queue size for a priority level
   */
  getQueueSize(priority?: JobPriority): number {
    if (priority) {
      return (this.queues.get(priority) || []).length;
    }
    return Array.from(this.queues.values()).reduce((sum, q) => sum + q.length, 0);
  }

  /**
   * Get next job to process (prioritizes critical > high > normal)
   */
  private getNextJob(): Job | null {
    // Check critical first
    const critical = this.queues.get('critical') || [];
    if (critical.length > 0) {
      return critical.shift()!;
    }
    
    // Then high
    const high = this.queues.get('high') || [];
    if (high.length > 0) {
      return high.shift()!;
    }
    
    // Finally normal
    const normal = this.queues.get('normal') || [];
    if (normal.length > 0) {
      return normal.shift()!;
    }
    
    return null;
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    this.processing.add(job.id);
    
    try {
      await job.handler(job.data);
      this.stats.processed++;
      
      // Log critical jobs completion
      if (job.priority === 'critical') {
        const duration = Date.now() - job.createdAt;
        console.log(`[JOB-QUEUE] ✓ Completed critical job: ${job.type} in ${duration}ms`);
      }
    } catch (error) {
      job.retries++;
      
      if (job.retries < job.maxRetries) {
        // Retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, job.retries), 10000);
        console.warn(`[JOB-QUEUE] Retrying job ${job.type} (attempt ${job.retries + 1}/${job.maxRetries}) after ${delay}ms`);
        
        setTimeout(() => {
          const queue = this.queues.get(job.priority) || this.queues.get('normal')!;
          queue.unshift(job); // Add back to front of queue
        }, delay);
      } else {
        // Max retries exceeded
        this.stats.failed++;
        console.error(`[JOB-QUEUE] ✗ Failed job ${job.type} after ${job.maxRetries} retries:`, (error as Error)?.message);
      }
    } finally {
      this.processing.delete(job.id);
      this.workers--;
      
      // Clean up job tracking by IP
      for (const [ip, jobIds] of this.jobsByIP.entries()) {
        jobIds.delete(job.id);
        if (jobIds.size === 0) {
          this.jobsByIP.delete(ip);
        }
      }
    }
  }

  private processLoop: (() => void) | null = null;

  /**
   * Start processing loop
   */
  private startProcessing(): void {
    this.processLoop = () => {
      // Process jobs if we have capacity
      while (this.workers < this.maxWorkers) {
        const job = this.getNextJob();
        if (!job) {
          break; // No jobs available
        }
        
        this.workers++;
        // Process job asynchronously (don't await)
        this.processJob(job).catch(err => {
          console.error('[JOB-QUEUE] Unexpected error processing job:', err);
        });
      }
    };

    // Check for jobs every 50ms (fast enough for critical jobs)
    setInterval(() => {
      if (this.processLoop) {
        this.processLoop();
      }
    }, 50);
  }

  /**
   * Trigger immediate processing (called after adding critical jobs)
   */
  private triggerProcessing(): void {
    if (this.processLoop) {
      this.processLoop();
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      processing: this.processing.size,
      workers: this.workers,
      queueSizes: {
        critical: this.getQueueSize('critical'),
        high: this.getQueueSize('high'),
        normal: this.getQueueSize('normal')
      }
    };
  }
}

// Singleton instance
export const jobQueue = new JobQueue();

/**
 * Helper functions for common job types
 */

/**
 * Queue a firewall blocking operation (critical priority)
 * Uses IP as unique key to prevent duplicate jobs
 */
export async function queueBlockIP(ip: string, reason: string, handler: (ip: string, reason: string) => Promise<any>): Promise<string> {
  return jobQueue.add('block-ip', { ip, reason }, () => handler(ip, reason), 'critical', 2, ip);
}

/**
 * Queue a firewall unblocking operation (critical priority)
 * Uses IP as unique key to prevent duplicate jobs
 */
export async function queueUnblockIP(ip: string, handler: (ip: string) => Promise<any>): Promise<string> {
  return jobQueue.add('unblock-ip', { ip }, () => handler(ip), 'critical', 2, ip);
}

/**
 * Queue an ML prediction (high priority)
 */
export async function queueMLPrediction(packetData: any, handler: (data: any) => Promise<any>): Promise<string> {
  return jobQueue.add('ml-prediction', packetData, handler, 'high', 1);
}

/**
 * Queue a log write (normal priority)
 */
export async function queueLogWrite(data: any, handler: (data: any) => Promise<any>): Promise<string> {
  return jobQueue.add('log-write', data, handler, 'normal', 1);
}

/**
 * Queue a dashboard update (normal priority)
 */
export async function queueDashboardUpdate(data: any, handler: (data: any) => Promise<any>): Promise<string> {
  return jobQueue.add('dashboard-update', data, handler, 'normal', 1);
}

