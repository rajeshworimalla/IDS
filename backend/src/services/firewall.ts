import { isIP } from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const HOSTS_FILE = '/etc/hosts';
const IDS_HOSTS_MARKER = '# IDS_BLOCKED_DOMAINS';
// Path to script relative to backend directory (works after compilation)
const UPDATE_HOSTS_SCRIPT = join(process.cwd(), 'scripts', 'update-hosts.sh');

type Bins = {
  ipset: string | null;
  iptables: string | null;
  ip6tables: string | null;
  conntrack: string | null;
};

let bins: Bins = {
  ipset: null,
  iptables: null,
  ip6tables: null,
  conntrack: null,
};

async function run(cmd: string, args: string[], timeout: number = 10000) {
  const startTime = Date.now();
  console.log(`[FIREWALL] ▶️ Running: ${cmd} ${args.join(' ')} (timeout: ${timeout}ms)`);
  try {
    // Add timeout to prevent hanging operations
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`[FIREWALL] ⏱️ Command timeout after ${timeout}ms: ${cmd} ${args.join(' ')}`);
      controller.abort();
    }, timeout);
    
    try {
      await execFileAsync(cmd, args, { signal: controller.signal as any });
      const duration = Date.now() - startTime;
      console.log(`[FIREWALL] ✓ Command completed in ${duration}ms: ${cmd} ${args.join(' ')}`);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e: any) {
    const duration = Date.now() - startTime;
    // Don't throw - log and return error info
    console.error(`[FIREWALL] ❌ Command failed after ${duration}ms: ${cmd} ${args.join(' ')}`, e?.message || String(e));
    throw e; // Re-throw but with better error message
  }
}

async function tryRun(cmd: string, args: string[]) {
  try {
    await execFileAsync(cmd, args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function resolveBin(candidates: string[], checkArgs: string[] = ['-V']): Promise<string | null> {
  for (const c of candidates) {
    const ok = await tryRun(c, checkArgs);
    if (ok) return c;
  }
  return null;
}

async function ensureBins() {
  if (!bins.ipset) {
    bins.ipset = await resolveBin(['ipset', '/usr/sbin/ipset', '/sbin/ipset'], ['-v']);
  }
  if (!bins.iptables) {
    bins.iptables = await resolveBin(['iptables', '/usr/sbin/iptables', '/sbin/iptables', 'iptables-nft', '/usr/sbin/iptables-nft'], ['-V']);
  }
  if (!bins.ip6tables) {
    bins.ip6tables = await resolveBin(['ip6tables', '/usr/sbin/ip6tables', '/sbin/ip6tables', 'ip6tables-nft', '/usr/sbin/ip6tables-nft'], ['-V']);
  }
  if (!bins.conntrack) {
    bins.conntrack = await resolveBin(['conntrack', '/usr/sbin/conntrack', '/sbin/conntrack'], ['-V']);
  }
}

async function ensureIpsetSets() {
  if (!bins.ipset) throw new Error('ipset not available');
  // Create sets with timeout support so per-element timeouts can be used
  await run(bins.ipset, ['-exist', 'create', 'ids_blocklist', 'hash:ip', 'family', 'inet', 'timeout', '0']);
  await run(bins.ipset, ['-exist', 'create', 'ids6_blocklist', 'hash:ip', 'family', 'inet6', 'timeout', '0']);
}

async function ensureIptablesSetRules(v6 = false) {
  const bin = v6 ? bins.ip6tables : bins.iptables;
  if (!bin) throw new Error((v6 ? 'ip6tables' : 'iptables') + ' not available');
  const setName = v6 ? 'ids6_blocklist' : 'ids_blocklist';
  // INPUT src in set
  if (!(await tryRun(bin, ['-C', 'INPUT', '-m', 'set', '--match-set', setName, 'src', '-j', 'DROP']))) {
    await run(bin, ['-I', 'INPUT', '-m', 'set', '--match-set', setName, 'src', '-j', 'DROP']);
  }
  // OUTPUT dst in set
  if (!(await tryRun(bin, ['-C', 'OUTPUT', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']))) {
    await run(bin, ['-I', 'OUTPUT', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']);
  }
  // FORWARD src in set
  if (!(await tryRun(bin, ['-C', 'FORWARD', '-m', 'set', '--match-set', setName, 'src', '-j', 'DROP']))) {
    await run(bin, ['-I', 'FORWARD', '-m', 'set', '--match-set', setName, 'src', '-j', 'DROP']);
  }
  // FORWARD dst in set
  if (!(await tryRun(bin, ['-C', 'FORWARD', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']))) {
    await run(bin, ['-I', 'FORWARD', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']);
  }
}

async function flushConntrack(ip: string, v6 = false) {
  if (!bins.conntrack) return; // optional
  // Delete connections by source IP
  await tryRun(bins.conntrack, ['-D', '-s', ip]);
  // Delete connections by destination IP
  await tryRun(bins.conntrack, ['-D', '-d', ip]);
  // Also try with family flag for IPv6
  if (v6) {
    await tryRun(bins.conntrack, ['-D', '-f', 'ipv6', '-s', ip]);
    await tryRun(bins.conntrack, ['-D', '-f', 'ipv6', '-d', ip]);
  } else {
    await tryRun(bins.conntrack, ['-D', '-f', 'ipv4', '-s', ip]);
    await tryRun(bins.conntrack, ['-D', '-f', 'ipv4', '-d', ip]);
  }
}

async function ipsetAdd(ip: string, v6 = false, ttlSeconds?: number) {
  if (!bins.ipset) throw new Error('ipset not available');
  const setName = v6 ? 'ids6_blocklist' : 'ids_blocklist';
  const args = ['-exist', 'add', setName, ip];
  if (ttlSeconds && ttlSeconds > 0) {
    args.push('timeout', String(ttlSeconds));
  }
  console.log(`[FIREWALL] Executing: sudo ${bins.ipset} ${args.join(' ')}`);
  // Use sudo for ipset commands (requires root privileges)
  await run('sudo', [bins.ipset, ...args]);
  console.log(`[FIREWALL] ✓ Successfully executed ipset add for ${ip}`);
}

async function ipsetDel(ip: string, v6 = false) {
  if (!bins.ipset) return;
  const setName = v6 ? 'ids6_blocklist' : 'ids_blocklist';
  await run(bins.ipset, ['-exist', 'del', setName, ip]).catch(() => {});
}

async function iptablesCheckOrAdd(ip: string, v6 = false) {
  const bin = v6 ? bins.ip6tables : bins.iptables;
  if (!bin) throw new Error((v6 ? 'ip6tables' : 'iptables') + ' not available');
  // INPUT rule - use sudo
  if (!(await tryRun('sudo', [bin, '-C', 'INPUT', '-s', ip, '-j', 'DROP']))) {
    await run('sudo', [bin, '-I', 'INPUT', '-s', ip, '-j', 'DROP']);
  }
  // OUTPUT rule - use sudo
  if (!(await tryRun('sudo', [bin, '-C', 'OUTPUT', '-d', ip, '-j', 'DROP']))) {
    await run('sudo', [bin, '-I', 'OUTPUT', '-d', ip, '-j', 'DROP']);
  }
  // FORWARD rules - use sudo
  if (!(await tryRun('sudo', [bin, '-C', 'FORWARD', '-s', ip, '-j', 'DROP']))) {
    await run('sudo', [bin, '-I', 'FORWARD', '-s', ip, '-j', 'DROP']);
  }
  if (!(await tryRun('sudo', [bin, '-C', 'FORWARD', '-d', ip, '-j', 'DROP']))) {
    await run('sudo', [bin, '-I', 'FORWARD', '-d', ip, '-j', 'DROP']);
  }
}

async function iptablesDelete(ip: string, v6 = false) {
  const bin = v6 ? bins.ip6tables : bins.iptables;
  if (!bin) return;
  // Use sudo for iptables commands
  await run('sudo', [bin, '-D', 'INPUT', '-s', ip, '-j', 'DROP']).catch(() => {});
  await run('sudo', [bin, '-D', 'OUTPUT', '-d', ip, '-j', 'DROP']).catch(() => {});
  await run('sudo', [bin, '-D', 'FORWARD', '-s', ip, '-j', 'DROP']).catch(() => {});
  await run('sudo', [bin, '-D', 'FORWARD', '-d', ip, '-j', 'DROP']).catch(() => {});
}

// DNS blocking via /etc/hosts using sudo script
async function addHostsBlock(domain: string): Promise<boolean> {
  try {
    if (!existsSync(HOSTS_FILE)) {
      console.warn(`Hosts file ${HOSTS_FILE} does not exist`);
      return false;
    }
    
    // Check if already blocked (read-only check, no sudo needed)
    const content = await readFile(HOSTS_FILE, 'utf-8');
    const normalizedDomain = domain.toLowerCase().trim();
    if (content.includes(`127.0.0.1 ${normalizedDomain}`) || 
        content.includes(`0.0.0.0 ${normalizedDomain}`)) {
      return true; // Already blocked
    }
    
    // Use sudo script to add domain
    if (!existsSync(UPDATE_HOSTS_SCRIPT)) {
      console.warn(`Update hosts script not found at ${UPDATE_HOSTS_SCRIPT}, falling back to direct write`);
      // Fallback to direct write (will fail without sudo, but at least we tried)
      const lines = content.split('\n');
      let markerIndex = lines.findIndex((line: string) => line.includes(IDS_HOSTS_MARKER));
      if (markerIndex === -1) {
        lines.push('');
        lines.push(IDS_HOSTS_MARKER);
        lines.push(`127.0.0.1 ${normalizedDomain}`);
        lines.push(`0.0.0.0 ${normalizedDomain}`);
      } else {
        lines.splice(markerIndex + 1, 0, `127.0.0.1 ${normalizedDomain}`, `0.0.0.0 ${normalizedDomain}`);
      }
      await writeFile(HOSTS_FILE, lines.join('\n') + '\n', 'utf-8');
      return true;
    }
    
    // Execute script with sudo
    await execFileAsync('sudo', [UPDATE_HOSTS_SCRIPT, 'add', normalizedDomain]);
    return true;
  } catch (e: any) {
    console.warn(`Failed to add hosts block for ${domain}: ${e?.message || String(e)}`);
    return false;
  }
}

async function removeHostsBlock(domain: string): Promise<boolean> {
  try {
    if (!existsSync(HOSTS_FILE)) {
      return false;
    }
    
    const normalizedDomain = domain.toLowerCase().trim();
    
    // Check if domain is blocked (read-only check)
    const content = await readFile(HOSTS_FILE, 'utf-8');
    if (!content.includes(`127.0.0.1 ${normalizedDomain}`) && 
        !content.includes(`0.0.0.0 ${normalizedDomain}`)) {
      return true; // Already removed
    }
    
    // Use sudo script to remove domain
    if (!existsSync(UPDATE_HOSTS_SCRIPT)) {
      console.warn(`Update hosts script not found at ${UPDATE_HOSTS_SCRIPT}, falling back to direct write`);
      // Fallback to direct write
      const lines = content.split('\n');
      const filtered = lines.filter((line: string) => 
        !line.includes(`127.0.0.1 ${normalizedDomain}`) && 
        !line.includes(`0.0.0.0 ${normalizedDomain}`)
      );
      await writeFile(HOSTS_FILE, filtered.join('\n') + '\n', 'utf-8');
      return true;
    }
    
    // Execute script with sudo
    await execFileAsync('sudo', [UPDATE_HOSTS_SCRIPT, 'remove', normalizedDomain]);
    return true;
  } catch (e: any) {
    console.warn(`Failed to remove hosts block for ${domain}: ${e?.message || String(e)}`);
    return false;
  }
}

export const firewall = {
  async ensureBaseRules(): Promise<void> {
    await ensureBins();
    if (bins.ipset) {
      await ensureIpsetSets();
      if (bins.iptables) await ensureIptablesSetRules(false);
      if (bins.ip6tables) await ensureIptablesSetRules(true);
    }
  },

  async syncFromDB(ips: { v4: string[]; v6: string[] }): Promise<void> {
    await this.ensureBaseRules();
    if (bins.ipset) {
      for (const ip of ips.v4) await ipsetAdd(ip, false);
      for (const ip of ips.v6) await ipsetAdd(ip, true);
    } else {
      // Fallback: per-IP rules (best-effort)
      for (const ip of ips.v4) await iptablesCheckOrAdd(ip, false).catch(() => {});
      for (const ip of ips.v6) await iptablesCheckOrAdd(ip, true).catch(() => {});
    }
  },

  async blockIP(ip: string, opts?: { ttlSeconds?: number }): Promise<{ applied: boolean; method: 'ipset-v4' | 'ipset-v6' | 'iptables-v4' | 'iptables-v6'; } | { applied: false; error: string } > {
    console.log(`[FIREWALL] 🔒 Starting blockIP for ${ip}`);
    try {
      // Safety check: Never block localhost
      const ipTrimmed = String(ip).trim();
      if (ipTrimmed === '127.0.0.1' || ipTrimmed === 'localhost' || ipTrimmed === '::1' || 
          ipTrimmed === '::ffff:127.0.0.1' || ipTrimmed.startsWith('127.') || 
          ipTrimmed === '0.0.0.0' || ipTrimmed === '::') {
        console.error(`[FIREWALL] ❌ BLOCKED: Attempt to block localhost/system IP: ${ip}`);
        return { applied: false, error: 'Cannot block localhost or system IPs for security reasons' };
      }
      
      await ensureBins();
      console.log(`[FIREWALL] ✓ Bins available: ipset=${!!bins.ipset}, iptables=${!!bins.iptables}, ip6tables=${!!bins.ip6tables}`);
      const version = isIP(ip);
      console.log(`[FIREWALL] IP version check: ${ip} -> version ${version}`);
      if (version === 0) {
        console.error(`[FIREWALL] ❌ Invalid IP: ${ip}`);
        return { applied: false, error: 'Invalid IP' };
      }
      
      try {
        if (bins.ipset) {
          console.log(`[FIREWALL] Using ipset for blocking ${ip}`);
          try {
            await this.ensureBaseRules();
            console.log(`[FIREWALL] ✓ Base rules ensured`);
          } catch (e: any) {
            console.warn('⚠️ Error ensuring base rules (continuing anyway):', e?.message || String(e));
            // Continue - rules might already exist
          }
          
          if (version === 4) {
            try {
              console.log(`[FIREWALL] Adding IPv4 ${ip} to ipset...`);
              await ipsetAdd(ip, false, opts?.ttlSeconds);
              console.log(`[FIREWALL] ✓ Added ${ip} to ipset-v4`);
              await flushConntrack(ip, false).catch(() => {}); // Optional, don't fail if it errors
              console.log(`[FIREWALL] ✅ Successfully blocked ${ip} via ipset-v4`);
              return { applied: true, method: 'ipset-v4' };
            } catch (e: any) {
              console.error(`⚠️ Error blocking IPv4 ${ip} with ipset:`, e?.message || String(e));
              // Fall through to iptables fallback
            }
          } else {
            try {
              console.log(`[FIREWALL] Adding IPv6 ${ip} to ipset...`);
              await ipsetAdd(ip, true, opts?.ttlSeconds);
              console.log(`[FIREWALL] ✓ Added ${ip} to ipset-v6`);
              await flushConntrack(ip, true).catch(() => {}); // Optional
              console.log(`[FIREWALL] ✅ Successfully blocked ${ip} via ipset-v6`);
              return { applied: true, method: 'ipset-v6' };
            } catch (e: any) {
              console.error(`⚠️ Error blocking IPv6 ${ip} with ipset:`, e?.message || String(e));
              // Fall through to iptables fallback
            }
          }
        } else {
          console.log(`[FIREWALL] ipset not available, using iptables fallback`);
        }
        
        // Fallback to raw iptables rules (no per-element TTL available)
        try {
          console.log(`[FIREWALL] Using iptables fallback for ${ip} (v${version})`);
          await iptablesCheckOrAdd(ip, version === 6);
          console.log(`[FIREWALL] ✓ Added iptables rules for ${ip}`);
          await flushConntrack(ip, version === 6).catch(() => {}); // Optional
          console.log(`[FIREWALL] ✅ Successfully blocked ${ip} via iptables-${version === 6 ? 'v6' : 'v4'}`);
          return { applied: true, method: (version === 6 ? 'iptables-v6' : 'iptables-v4') };
        } catch (e: any) {
          console.error(`⚠️ Error blocking IP ${ip} with iptables:`, e?.message || String(e));
          return { applied: false, error: e?.message || String(e) };
        }
      } catch (e: any) {
        console.error(`⚠️ Error in blockIP for ${ip}:`, e?.message || String(e));
        return { applied: false, error: e?.message || String(e) };
      }
    } catch (e: any) {
      console.error(`❌ CRITICAL: Error in blockIP for ${ip}:`, e);
      // Don't crash - return error instead
      return { applied: false, error: e?.message || 'Failed to block IP' };
    }
  },

  async unblockIP(ip: string): Promise<{ removed: boolean } | { removed: false; error: string }> {
    await ensureBins();
    const version = isIP(ip);
    if (version === 0) {
      return { removed: false, error: 'Invalid IP' };
    }
    try {
      if (bins.ipset) {
        await ipsetDel(ip, version === 6);
      } else {
        await iptablesDelete(ip, version === 6);
      }
      await flushConntrack(ip, version === 6);
      return { removed: true };
    } catch (e: any) {
      return { removed: false, error: e?.message || String(e) };
    }
  },

  async blockDomain(domain: string): Promise<{ applied: boolean; hostsBlocked?: boolean } | { applied: false; error: string }> {
    try {
      const hostsBlocked = await addHostsBlock(domain);
      // Also resolve and block IPs
      const dns = await import('dns/promises');
      let allIPs: string[] = [];
      try {
        const ipv4Promise = dns.resolve4(domain).catch(() => [] as string[]);
        const ipv6Promise = dns.resolve6(domain).catch(() => [] as string[]);
        const [ipv4Addrs, ipv6Addrs] = await Promise.all([ipv4Promise, ipv6Promise]);
        if (Array.isArray(ipv4Addrs)) allIPs.push(...ipv4Addrs);
        if (Array.isArray(ipv6Addrs)) allIPs.push(...ipv6Addrs);
      } catch {}
      
      // Block all resolved IPs
      for (const ip of allIPs) {
        await this.blockIP(ip).catch(() => {});
      }
      
      return { applied: true, hostsBlocked };
    } catch (e: any) {
      return { applied: false, error: e?.message || String(e) };
    }
  },

  async unblockDomain(domain: string): Promise<{ removed: boolean; hostsRemoved?: boolean } | { removed: false; error: string }> {
    try {
      const hostsRemoved = await removeHostsBlock(domain);
      // Note: We don't automatically unblock IPs here since they might be blocked for other reasons
      return { removed: true, hostsRemoved };
    } catch (e: any) {
      return { removed: false, error: e?.message || String(e) };
    }
  }
};
