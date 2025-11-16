import { Request, Response } from 'express';
import { Socket } from 'net';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        id: string;
        role: string;
      };
    }
  }
}

interface ScanOptions {
  host: string;
  ports?: string; // e.g., "1-1000" or "80,443,5001" or "all" for 1-65535
  timeout?: number;
  concurrency?: number;
}

// Scan a single port
function scanPort(host: string, port: number, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let resolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      try {
        socket.destroy();
      } catch (e) {
        // Ignore cleanup errors
      }
    };

    const onConnect = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(true);
      }
    };

    const onError = (err?: Error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(false);
      }
    };

    const onTimeout = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(false);
      }
    };

    socket.setTimeout(timeout);
    socket.once('connect', onConnect);
    socket.once('timeout', onTimeout);
    socket.once('error', onError);

    try {
      socket.connect(port, host);
      // Also set a manual timeout as backup
      timeoutId = setTimeout(() => {
        if (!resolved) {
          onTimeout();
        }
      }, timeout + 100);
    } catch (e) {
      onError();
    }
  });
}

// Parse port range string
function parsePorts(portsStr: string): number[] {
  if (portsStr === 'all') {
    // Return all ports 1-65535
    return Array.from({ length: 65535 }, (_, i) => i + 1);
  }

  const ports: number[] = [];
  const parts = portsStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      // Range like "1-1000"
      const [start, end] = trimmed.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end) && start > 0 && end <= 65535 && start <= end) {
        for (let i = start; i <= end; i++) {
          ports.push(i);
        }
      }
    } else {
      // Single port
      const port = Number(trimmed);
      if (!isNaN(port) && port > 0 && port <= 65535) {
        ports.push(port);
      }
    }
  }

  return [...new Set(ports)].sort((a, b) => a - b);
}

// Scan ports with concurrency control
async function scanPorts(
  host: string,
  ports: number[],
  timeout: number = 1000,
  concurrency: number = 100
): Promise<number[]> {
  const openPorts: number[] = [];
  const queue: number[] = [...ports];
  let active = 0;

  return new Promise((resolve) => {
    const processNext = async () => {
      if (queue.length === 0 && active === 0) {
        resolve(openPorts.sort((a, b) => a - b));
        return;
      }

      if (active >= concurrency || queue.length === 0) {
        return;
      }

      const port = queue.shift()!;
      active++;

      try {
        const isOpen = await scanPort(host, port, timeout);
        if (isOpen) {
          openPorts.push(port);
        }
      } catch (e) {
        // Port is closed or error
      } finally {
        active--;
        processNext();
      }
    };

    // Start initial batch
    for (let i = 0; i < Math.min(concurrency, ports.length); i++) {
      processNext();
    }
  });
}

export const scanHost = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'User not authenticated' });

    const { host, ports = 'all', timeout = 1000, concurrency = 100 } = req.body as ScanOptions;

    if (!host) {
      return res.status(400).json({ error: 'host is required' });
    }

    // Validate host format (basic check)
    const hostRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$|^(\d{1,3}\.){3}\d{1,3}$/;
    if (!hostRegex.test(host)) {
      return res.status(400).json({ error: 'Invalid host format' });
    }

    const portList = parsePorts(ports);
    if (portList.length === 0) {
      return res.status(400).json({ error: 'Invalid port range' });
    }

    // Limit max ports to prevent abuse
    if (portList.length > 65535) {
      return res.status(400).json({ error: 'Too many ports to scan (max 65535)' });
    }

    console.log(`[PORT SCAN] Starting scan of ${host} - ${portList.length} ports`);

    // Adjust timeout and concurrency for large scans
    // Use shorter timeout but higher concurrency for large scans to speed things up
    const actualTimeout = portList.length > 10000 ? Math.min(timeout, 500) : timeout;
    const actualConcurrency = portList.length > 10000 ? Math.max(concurrency, 500) : concurrency;

    console.log(`[PORT SCAN] Using timeout: ${actualTimeout}ms, concurrency: ${actualConcurrency}`);

    // Start scanning - wait for results
    const openPorts = await scanPorts(host, portList, actualTimeout, actualConcurrency);

    console.log(`[PORT SCAN] Completed scan of ${host} - Found ${openPorts.length} open ports: ${openPorts.slice(0, 20).join(', ')}${openPorts.length > 20 ? '...' : ''}`);

    res.json({
      host,
      openPorts,
      totalScanned: portList.length,
      totalOpen: openPorts.length,
      scannedAt: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('Port scan error:', e);
    res.status(500).json({ error: e?.message || 'Failed to scan ports' });
  }
};

