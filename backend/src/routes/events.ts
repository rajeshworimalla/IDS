import express from 'express';
import cors from 'cors';
import { incrWithTTL, redis } from '../services/redis';
import { enforceTempBan, isTempBanned } from '../services/blocker';
import { getPolicy } from '../services/policy';

const router = express.Router();
// Allow calls from any LAN site (CORS is scoped to this router)
router.use(cors({ origin: true }));
router.options('*', cors());

function getClientIP(req: express.Request): string {
  const xf = (req.headers['x-forwarded-for'] as string) || '';
  const fromHeader = xf.split(',')[0]?.trim();
  return fromHeader || req.ip || (req.socket && (req.socket as any).remoteAddress) || '';
}

// Simple in-memory fallback counters when Redis is unavailable
const memCounts = new Map<string, { count: number; expiresAt: number }>();
function incrMem(key: string, ttlSeconds: number): number {
  const now = Date.now();
  const e = memCounts.get(key);
  if (!e || e.expiresAt <= now) {
    const v = { count: 1, expiresAt: now + ttlSeconds * 1000 };
    memCounts.set(key, v);
    return 1;
  }
  e.count += 1;
  return e.count;
}

// Report a failed login attempt from a website on the LAN
// Body: { host?: string, username?: string }
router.post('/login-failed', async (req, res) => {
  try {
    const ip = getClientIP(req);
    const hostRaw = String(req.body?.host || req.hostname || 'unknown');
    const host = hostRaw.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 120) || 'unknown';

    // Get policy settings for rate limiting
    const policy = await getPolicy();
    const windowSeconds = policy.windowSeconds || 60;
    
    // Use maxLoginRetries from policy, or fallback to calculated value
    const threshold = policy.maxLoginRetries ?? Math.min(3, Math.max(1, Math.floor(policy.threshold / 10)));
    
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `ids:loginfail:${host}:${ip}:${bucket}`;

    let count: number;
    try {
      count = await incrWithTTL(key, windowSeconds + 1);
    } catch {
      count = incrMem(key, windowSeconds + 1);
    }

    console.log(`[LOGIN-FAILED] IP: ${ip}, Host: ${host}, Count: ${count}/${threshold}, Window: ${windowSeconds}s`);

    let banned = false;
    const banSeconds = policy.banMinutes ? policy.banMinutes * 60 : 30; // Use policy ban duration or default 30s

    if (count >= threshold) {
      try {
        // Temp ban using policy settings
        await enforceTempBan(ip, 'login-fail', { ttlSeconds: banSeconds });
        banned = true;
        try { await redis.setex(`ids:loginfail:cooldown:${ip}`, banSeconds, '1'); } catch {}
        console.log(`[LOGIN-FAILED] ✅ Auto-banned IP ${ip} for ${banSeconds}s (${count} failed attempts)`);
      } catch (e) {
        // Even if enforcement storage fails, still return banned so clients can honor
        banned = true;
        console.error(`[LOGIN-FAILED] ❌ Failed to enforce ban for ${ip}:`, e);
      }
    }

    return res.json({ ok: true, ip, host, count, threshold, banned, ttlSeconds: banned ? banSeconds : 0 });
  } catch (e: any) {
    console.error('login-failed handler error:', e);
    // Best-effort response rather than a hard failure for demo integration
    return res.json({ ok: true, error: e?.message || 'soft error', banned: false });
  }
});

// Check if current IP is banned
router.get('/check-ban', async (req, res) => {
  try {
    const ip = getClientIP(req);
    const banned = await isTempBanned(ip);
    
    if (banned) {
      // Get ban details from Redis
      const banKey = `ids:tempban:${ip}`;
      const banData = await redis.get(banKey);
      if (banData) {
        try {
          const ban = JSON.parse(banData);
          const ttl = await redis.ttl(banKey);
          const secondsLeft = ttl > 0 ? ttl : 0;
          return res.json({ 
            banned: true, 
            ip,
            secondsLeft,
            expiresAt: ban.expiresAt,
            reason: ban.reason 
          });
        } catch (e) {
          // If parsing fails, just return banned status
        }
      }
      return res.json({ banned: true, ip, secondsLeft: 0 });
    }
    
    return res.json({ banned: false, ip });
  } catch (e: any) {
    console.error('check-ban error:', e);
    return res.json({ banned: false, error: e?.message });
  }
});

export default router;