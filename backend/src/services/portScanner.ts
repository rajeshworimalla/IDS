import { Socket } from 'net';
import { promisify } from 'util';

export interface PortScanResult {
  host: string;
  port: number;
  open: boolean;
  service?: string;
}

const COMMON_SERVICES: { [port: number]: string } = {
  20: 'FTP Data',
  21: 'FTP',
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  53: 'DNS',
  67: 'DHCP',
  68: 'DHCP',
  80: 'HTTP',
  110: 'POP3',
  135: 'RPC',
  139: 'NetBIOS',
  143: 'IMAP',
  443: 'HTTPS',
  445: 'SMB',
  993: 'IMAPS',
  995: 'POP3S',
  1433: 'MSSQL',
  3306: 'MySQL',
  3389: 'RDP',
  5432: 'PostgreSQL',
  8080: 'HTTP-Proxy',
  8443: 'HTTPS-Alt',
  3000: 'Node.js',
  5000: 'Flask',
  5173: 'Vite',
  8000: 'HTTP-Alt',
  27017: 'MongoDB',
  6379: 'Redis',
};

export async function scanPort(host: string, port: number, timeout: number = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);
    socket.once('timeout', () => {
      cleanup();
      resolve(false);
    });

    socket.once('error', () => {
      cleanup();
      resolve(false);
    });

    socket.once('connect', () => {
      cleanup();
      resolve(true);
    });

    socket.connect(port, host);
  });
}

export async function scanPorts(
  hosts: string[],
  ports: number[],
  concurrency: number = 50,
  timeout: number = 2000
): Promise<PortScanResult[]> {
  const results: PortScanResult[] = [];
  const tasks: Promise<void>[] = [];
  let active = 0;
  const queue: Array<{ host: string; port: number }> = [];

  // Create queue
  for (const host of hosts) {
    for (const port of ports) {
      queue.push({ host, port });
    }
  }

  const processNext = async () => {
    if (queue.length === 0 || active >= concurrency) {
      return;
    }

    const { host, port } = queue.shift()!;
    active++;

    const task = scanPort(host, port, timeout)
      .then((open) => {
        if (open) {
          results.push({
            host,
            port,
            open: true,
            service: COMMON_SERVICES[port],
          });
        }
      })
      .catch(() => {
        // Ignore errors
      })
      .finally(() => {
        active--;
        processNext();
      });

    tasks.push(task);
    processNext();
  };

  // Start initial batch
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    processNext();
  }

  await Promise.all(tasks);
  return results;
}

