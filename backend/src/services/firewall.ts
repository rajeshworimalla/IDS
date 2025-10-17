import { isIP } from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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
  await execFileAsync(cmd, args);
}

async function tryRun(cmd: string, args: string[]) {
  try {
    await execFileAsync(cmd, args);
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
  await run(bins.ipset, ['-exist', 'create', 'ids_blocklist', 'hash:ip', 'family', 'inet']);
  await run(bins.ipset, ['-exist', 'create', 'ids6_blocklist', 'hash:ip', 'family', 'inet6']);
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
  await tryRun(bins.conntrack, ['-D', v6 ? '-f' : '-f', v6 ? 'ipv6' : 'ipv4', '-s', ip]);
  await tryRun(bins.conntrack, ['-D', v6 ? '-f' : '-f', v6 ? 'ipv6' : 'ipv4', '-d', ip]);
}

async function ipsetAdd(ip: string, v6 = false) {
  if (!bins.ipset) throw new Error('ipset not available');
  const setName = v6 ? 'ids6_blocklist' : 'ids_blocklist';
  await run(bins.ipset, ['-exist', 'add', setName, ip]);
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

  async blockIP(ip: string): Promise<{ applied: boolean; method: 'ipset-v4' | 'ipset-v6' | 'iptables-v4' | 'iptables-v6'; } | { applied: false; error: string } > {
    await ensureBins();
    const version = isIP(ip);
    if (version === 0) {
      return { applied: false, error: 'Invalid IP' };
    }
    try {
      if (bins.ipset) {
        await this.ensureBaseRules();
        if (version === 4) {
          await ipsetAdd(ip, false);
          await flushConntrack(ip, false);
          return { applied: true, method: 'ipset-v4' };
        } else {
          await ipsetAdd(ip, true);
          await flushConntrack(ip, true);
          return { applied: true, method: 'ipset-v6' };
        }
      }
      // Fallback to raw iptables rules
      await iptablesCheckOrAdd(ip, version === 6);
      await flushConntrack(ip, version === 6);
      return { applied: true, method: (version === 6 ? 'iptables-v6' : 'iptables-v4') };
    } catch (e: any) {
      return { applied: false, error: e?.message || String(e) };
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
