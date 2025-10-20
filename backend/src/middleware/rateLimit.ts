import { Request, Response, NextFunction } from 'express';
import { redis, incrWithTTL } from '../services/redis';
import { getPolicy, autoBan } from '../services/policy';

function getClientIP(req: Request): string {
  const xf = (req.headers['x-forwarded-for'] as string) || '';
  const fromHeader = xf.split(',')[0].trim();
  return fromHeader || (req.ip || (req.socket && req.socket.remoteAddress) || '') || 'unknown';
}

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Exclude socket.io and health endpoints
    const path = req.path || '';
    if (path.startsWith('/socket.io/')) return next();

    const policy = await getPolicy();
    const ip = getClientIP(req);

    // If already temp banned, short-circuit
    const banned = await redis.get(`ids:tempban:${ip}`);
    if (banned) {
      return res.status(403).json({ message: 'Temporarily banned' });
    }

    const window = Math.max(5, policy.windowSeconds);
    const bucket = Math.floor(Date.now() / 1000 / window);
    const key = `ids:rl:${ip}:${bucket}`;
    const count = await incrWithTTL(key, window + 1);

    if (count > policy.threshold) {
      try {
        await autoBan(ip, 'rate-limit');
      } catch (e) {
        console.error('autoBan failed:', e);
      }
      return res.status(429).json({ message: 'Too many requests. You have been temporarily banned.' });
    }

    next();
  } catch (e) {
    console.error('rateLimit error:', e);
    next();
  }
}