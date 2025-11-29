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
  if (!(await tryRun(bin, ['-C', 'OUTPUT', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']))) {
    await run(bin, ['-I', 'OUTPUT', '-m', 'set', '--match-set', setName, 'dst', '-j', 'DROP']);
    console.log(`[FIREWALL] Added OUTPUT rule for ${setName} (this blocks outgoing connections)`);
  }
  
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
  const setName = v6 ? 'ids6_blocklist' : 'ids_blocklist';
  const args = ['-exist', 'add', setName, ip];
  if (ttlSeconds && ttlSeconds > 0) {
    args.push('timeout', String(ttlSeconds));
  }
  
  try {
    await run(bins.ipset, args);
  } catch (addError: any) {
    console.error(`[FIREWALL] Failed to add ${ip} to ${setName}:`, addError?.message);
    throw addError;
  }
  
  // Verify the IP was actually added (non-blocking, log only)
  try {
    const { stdout } = await execAsync(`${bins.ipset} list ${setName}`, { timeout: 2000 });
    if (stdout.includes(ip)) {
      console.log(`[FIREWALL] Verified ${ip} is in ${setName}`);
    } else {
      console.warn(`[FIREWALL] Warning: ${ip} not found in ${setName} after add (may be timing issue)`);
    }
  } catch (verifyError: any) {
    // Don't throw on verification failure - the add might have succeeded
    console.warn(`[FIREWALL] Could not verify ${ip} in ${setName}:`, verifyError?.message);
  }
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
    await ensureBins();
    const version = isIP(ip);
    if (version === 0) {
      return { applied: false, error: 'Invalid IP' };
    }
    try {
      console.log(`[FIREWALL] Blocking IP: ${ip} (IPv${version})`);
      if (bins.ipset) {
        await this.ensureBaseRules();
        if (version === 4) {
          await ipsetAdd(ip, false, opts?.ttlSeconds);
          await flushConntrack(ip, false);
          
          // Final verification - check if IP is actually in blocklist (non-blocking)
          try {
            const { stdout } = await execAsync(`${bins.ipset} list ids_blocklist`, { timeout: 2000 });
            if (stdout.includes(ip)) {
              console.log(`[FIREWALL] ✓ Blocked ${ip} via ipset-v4 (verified)`);
            } else {
              console.warn(`[FIREWALL] ⚠ ${ip} not in blocklist yet (may be timing issue)`);
            }
          } catch (verifyError: any) {
            console.warn(`[FIREWALL] Could not verify ${ip} in blocklist:`, verifyError?.message);
          }
          // Return success even if verification fails (add command succeeded)
          return { applied: true, method: 'ipset-v4' };
        } else {
          await ipsetAdd(ip, true, opts?.ttlSeconds);
          await flushConntrack(ip, true);
          
          // Final verification (non-blocking)
          try {
            const { stdout } = await execAsync(`${bins.ipset} list ids6_blocklist`, { timeout: 2000 });
            if (stdout.includes(ip)) {
              console.log(`[FIREWALL] ✓ Blocked ${ip} via ipset-v6 (verified)`);
            } else {
              console.warn(`[FIREWALL] ⚠ ${ip} not in blocklist yet (may be timing issue)`);
            }
          } catch (verifyError: any) {
            console.warn(`[FIREWALL] Could not verify ${ip} in blocklist:`, verifyError?.message);
          }
          // Return success even if verification fails (add command succeeded)
          return { applied: true, method: 'ipset-v6' };
        }
      }
      // Fallback to raw iptables rules (no per-element TTL available)
      if (!bins.iptables && !bins.ip6tables) {
        return { applied: false, error: 'Neither ipset nor iptables available' };
      }
      await iptablesCheckOrAdd(ip, version === 6);
      await flushConntrack(ip, version === 6);
      console.log(`[FIREWALL] ✓ Blocked ${ip} via iptables-${version === 6 ? 'v6' : 'v4'}`);
      return { applied: true, method: (version === 6 ? 'iptables-v6' : 'iptables-v4') };
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
  }
};
