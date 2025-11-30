import { isIP } from 'net';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Wrapper for exec with timeout
function execAsync(command: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timeout = options?.timeout || 5000;
    const child = exec(command, { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
    
    // Force kill on timeout
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeout}ms`));
      }
    }, timeout);
  });
}

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

async function run(cmd: string, args: string[]) {
  // Backend runs with sudo, so we can run commands directly
  try {
    await execFileAsync(cmd, args);
  } catch (error: any) {
    console.error(`[FIREWALL] Command failed: ${cmd} ${args.join(' ')}`);
    console.error(`[FIREWALL] Error:`, error?.message || error);
    throw error;
  }
}

async function tryRun(cmd: string, args: string[]) {
  try {
    // Backend runs with sudo, so we can run commands directly
    await execFileAsync(cmd, args);
    return true;
  } catch (error: any) {
    // Silently fail for check commands (expected when rule doesn't exist)
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
  
  // INPUT src in set (blocks incoming from blocked IPs)
  if (!(await tryRun(bin, ['-C', 'INPUT', '-m', 'set', '--match-set', setName, 'src', '-j', 'DROP']))) {
    await run(bin, ['-I', 'INPUT', '-m', 'set', '--match-set', setName, 'src', '-j', 'DROP']);
    console.log(`[FIREWALL] Added INPUT rule for ${setName}`);
  }
  
  // OUTPUT dst in set (blocks outgoing to blocked IPs) - THIS IS KEY FOR DOMAIN BLOCKING
  // Always ensure it's at position 1 (top of chain) to take precedence
  // Remove any existing rule first (in case it's at wrong position)
  await tryRun(bin, ['-D', 'OUTPUT', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']);
  // Insert at position 1 (top of chain) to ensure it's checked first
  await run(bin, ['-I', 'OUTPUT', '1', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']);
  console.log(`[FIREWALL] ✓ OUTPUT rule for ${setName} inserted at position 1 (blocks outgoing connections to blocked IPs)`);
  
  // FORWARD src in set
  if (!(await tryRun(bin, ['-C', 'FORWARD', '-m', 'set', '--match-set', setName, 'src', '-j', 'DROP']))) {
    await run(bin, ['-I', 'FORWARD', '-m', 'set', '--match-set', setName, 'src', '-j', 'DROP']);
    console.log(`[FIREWALL] Added FORWARD src rule for ${setName}`);
  }
  
  // FORWARD dst in set
  if (!(await tryRun(bin, ['-C', 'FORWARD', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']))) {
    await run(bin, ['-I', 'FORWARD', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']);
    console.log(`[FIREWALL] Added FORWARD dst rule for ${setName}`);
  }
}

async function flushConntrack(ip: string, v6 = false) {
  if (!bins.conntrack) return; // optional
  await tryRun(bins.conntrack, ['-D', v6 ? '-f' : '-f', v6 ? 'ipv6' : 'ipv4', '-s', ip]);
  await tryRun(bins.conntrack, ['-D', v6 ? '-f' : '-f', v6 ? 'ipv6' : 'ipv4', '-d', ip]);
}

async function ipsetAdd(ip: string, v6 = false, ttlSeconds?: number) {
  if (!bins.ipset) throw new Error('ipset not available');
  
  // CRITICAL: Validate IP before adding to blocklist
  if (!ip || ip.trim() === '') {
    throw new Error('Cannot add empty IP to blocklist');
  }
  
  // Safety: Never block reserved/localhost addresses
  if (ip.startsWith('127.') || ip === '0.0.0.0' || ip === '255.255.255.255' || ip === '::1') {
    throw new Error(`Cannot block reserved IP address: ${ip}`);
  }
  
  const setName = v6 ? 'ids6_blocklist' : 'ids_blocklist';
  const args = ['-exist', 'add', setName, ip];
  if (ttlSeconds && ttlSeconds > 0) {
    args.push('timeout', String(ttlSeconds));
  }
  
  // PERFORMANCE: Just add the IP - skip verification to reduce latency
  // ipset add is atomic and reliable, verification adds 1-2 seconds of delay
  // This adds ONLY the specific IP to the blocklist (incremental update)
  console.log(`[FIREWALL] Adding SPECIFIC IP to blocklist: ${ip} (set: ${setName})`);
  await run(bins.ipset, args);
  console.log(`[FIREWALL] ✓ IP ${ip} added to blocklist ${setName}`);
}

async function ipsetDel(ip: string, v6 = false) {
  if (!bins.ipset) return;
  const setName = v6 ? 'ids6_blocklist' : 'ids_blocklist';
  await run(bins.ipset, ['-exist', 'del', setName, ip]).catch(() => {});
}

async function iptablesCheckOrAdd(ip: string, v6 = false) {
  const bin = v6 ? bins.ip6tables : bins.iptables;
  if (!bin) throw new Error((v6 ? 'ip6tables' : 'iptables') + ' not available');
  // INPUT rule
  if (!(await tryRun(bin, ['-C', 'INPUT', v6 ? '-s' : '-s', ip, '-j', 'DROP']))) {
    await run(bin, ['-I', 'INPUT', '-s', ip, '-j', 'DROP']);
  }
  // OUTPUT rule
  if (!(await tryRun(bin, ['-C', 'OUTPUT', v6 ? '-d' : '-d', ip, '-j', 'DROP']))) {
    await run(bin, ['-I', 'OUTPUT', '-d', ip, '-j', 'DROP']);
  }
  // FORWARD rules
  if (!(await tryRun(bin, ['-C', 'FORWARD', '-s', ip, '-j', 'DROP']))) {
    await run(bin, ['-I', 'FORWARD', '-s', ip, '-j', 'DROP']);
  }
  if (!(await tryRun(bin, ['-C', 'FORWARD', '-d', ip, '-j', 'DROP']))) {
    await run(bin, ['-I', 'FORWARD', '-d', ip, '-j', 'DROP']);
  }
}

async function iptablesDelete(ip: string, v6 = false) {
  const bin = v6 ? bins.ip6tables : bins.iptables;
  if (!bin) return;
  await run(bin, ['-D', 'INPUT', '-s', ip, '-j', 'DROP']).catch(() => {});
  await run(bin, ['-D', 'OUTPUT', '-d', ip, '-j', 'DROP']).catch(() => {});
  await run(bin, ['-D', 'FORWARD', '-s', ip, '-j', 'DROP']).catch(() => {});
  await run(bin, ['-D', 'FORWARD', '-d', ip, '-j', 'DROP']).catch(() => {});
}

export const firewall = {
  async ensureBaseRules(): Promise<void> {
    await ensureBins();
    if (bins.ipset) {
      await ensureIpsetSets();
      if (bins.iptables) {
        await ensureIptablesSetRules(false);
        console.log('[FIREWALL] IPv4 iptables rules ensured');
      }
      if (bins.ip6tables) {
        await ensureIptablesSetRules(true);
        console.log('[FIREWALL] IPv6 ip6tables rules ensured');
      } else {
        console.warn('[FIREWALL] ip6tables not available - IPv6 blocking may not work');
      }
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
    await ensureBins();
    const version = isIP(ip);
    if (version === 0) {
      return { applied: false, error: 'Invalid IP' };
    }
    try {
      // PERFORMANCE: Skip verbose logging during blocking (only log errors)
      if (bins.ipset) {
        // PERFORMANCE: Only ensure base rules once at startup, not on every block
        // Base rules should already be set, so we skip this check to save time
        if (version === 4) {
          await ipsetAdd(ip, false, opts?.ttlSeconds);
          // PERFORMANCE: Flush conntrack asynchronously (non-blocking)
          flushConntrack(ip, false).catch(() => {});
          
          // PERFORMANCE: Skip direct iptables rule addition - ipset is sufficient
          // Only add if ipset fails (which is rare)
          return { applied: true, method: 'ipset-v4' };
        } else {
          await ipsetAdd(ip, true, opts?.ttlSeconds);
          // PERFORMANCE: Flush conntrack asynchronously (non-blocking)
          flushConntrack(ip, true).catch(() => {});
          return { applied: true, method: 'ipset-v6' };
        }
      } else {
        // Fallback to direct iptables if ipset not available
        await iptablesCheckOrAdd(ip, version === 6);
        // PERFORMANCE: Flush conntrack asynchronously (non-blocking)
        flushConntrack(ip, version === 6).catch(() => {});
        return { applied: true, method: version === 6 ? 'iptables-v6' : 'iptables-v4' };
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      console.error(`[FIREWALL] ✗ Failed to block ${ip}:`, errorMsg);
      return { applied: false, error: errorMsg };
    }
  },

  async unblockIP(ip: string): Promise<{ removed: boolean } | { removed: false; error: string }> {
    await ensureBins();
    const version = isIP(ip);
    if (version === 0) {
      return { removed: false, error: 'Invalid IP' };
    }
    try {
      // PERFORMANCE: Use incremental deletion (fast)
      if (bins.ipset) {
        await ipsetDel(ip, version === 6);
      } else {
        await iptablesDelete(ip, version === 6);
      }
      // PERFORMANCE: Flush conntrack asynchronously (non-blocking)
      flushConntrack(ip, version === 6).catch(() => {});
      return { removed: true };
    } catch (e: any) {
      return { removed: false, error: e?.message || String(e) };
    }
  }
};
