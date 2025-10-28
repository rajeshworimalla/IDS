import express from 'express';
import cors from 'cors';
import { incrWithTTL, redis } from '../services/redis';
import { enforceTempBan } from '../services/blocker';

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

    // Bucketed counter in Redis: per host+ip
    const windowSeconds = 60; // 1 minute window
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `ids:loginfail:${host}:${ip}:${bucket}`;

    let count: number;
    try {
      count = await incrWithTTL(key, windowSeconds + 1);
    } catch {
      count = incrMem(key, windowSeconds + 1);
    }

    // Threshold for auto-ban on login failures
    const threshold = 3;
    let banned = false;

    if (count >= threshold) {
      try {
        // Temp ban for exactly 30 seconds for this IP
        await enforceTempBan(ip, 'login-fail', { ttlSeconds: 30 });
        banned = true;
        try { await redis.setex(`ids:loginfail:cooldown:${ip}`, 30, '1'); } catch {}
      } catch (e) {
        // Even if enforcement storage fails, still return banned so clients can honor
        banned = true;
      }
    }

    return res.json({ ok: true, ip, host, count, banned, ttlSeconds: banned ? 30 : 0 });
  } catch (e: any) {
    console.error('login-failed handler error:', e);
    // Best-effort response rather than a hard failure for demo integration
    return res.json({ ok: true, error: e?.message || 'soft error', banned: false });
  }
});

export default router;