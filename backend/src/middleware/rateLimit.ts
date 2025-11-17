import { Request, Response, NextFunction } from 'express';
import { redis, incrWithTTL } from '../services/redis';
import { getPolicy, autoBan } from '../services/policy';

function getClientIP(req: Request): string {
  const xf = (req.headers['x-forwarded-for'] as string) || '';
  const fromHeader = xf.split(',')[0].trim();
  const detectedIP = fromHeader || (req.ip || (req.socket && req.socket.remoteAddress) || '') || 'unknown';
  
  // Log IP detection for debugging
  if (detectedIP === 'unknown') {
    console.warn('[RATE LIMIT] Warning: Could not detect client IP. Headers:', {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'req.ip': req.ip,
      'remoteAddress': req.socket?.remoteAddress
    });
  }
  
  return detectedIP;
}

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  // Log that middleware is being called
  console.log(`[RATE LIMIT] Middleware called for path: ${req.path}`);
  
  try {
    // Exclude socket.io, health endpoints, and unblock endpoint (to allow unblocking even if IP is banned)
    const path = req.path || '';
    if (path.startsWith('/socket.io/')) {
      console.log('[RATE LIMIT] Skipping socket.io endpoint');
      return next();
    }
    // Allow unblock requests to always go through (they come from authenticated frontend)
    if (path.startsWith('/api/ips/block/') && req.method === 'DELETE') {
      console.log('[RATE LIMIT] Skipping rate limit for unblock endpoint');
      return next();
    }

    // Get policy settings
    const policy = await getPolicy();
    console.log(`[RATE LIMIT] Policy: threshold=${policy.threshold}, window=${policy.windowSeconds}s`);
    
    // Get client IP
    const ip = getClientIP(req);
    console.log(`[RATE LIMIT] Client IP: ${ip}`);
    
    // Skip rate limiting for localhost/127.0.0.1 (frontend on same machine)
    // EXCEPT for login-failed endpoint (for demo site testing)
    if ((ip === '127.0.0.1' || ip === 'localhost' || ip === '::1' || ip === '::ffff:127.0.0.1') && 
        !path.startsWith('/api/events/login-failed')) {
      console.log('[RATE LIMIT] Skipping rate limit for localhost');
      return next();
    }
    
    // Check if IP is already banned
    try {
    const banned = await redis.get(`ids:tempban:${ip}`);
    if (banned) {
        console.log(`[RATE LIMIT] IP ${ip} is already banned`);
      return res.status(403).json({ message: 'Temporarily banned' });
      }
    } catch (redisError) {
      console.error('[RATE LIMIT] Redis error checking ban status:', redisError);
      // Continue anyway - don't block if Redis is down
    }

    // Calculate time window and bucket
    const window = Math.max(5, policy.windowSeconds);
    const bucket = Math.floor(Date.now() / 1000 / window);
    const key = `ids:rl:${ip}:${bucket}`;
    
    // Increment request count
    let count: number;
    try {
      count = await incrWithTTL(key, window + 1);
      console.log(`[RATE LIMIT] Request count for ${ip}: ${count}/${policy.threshold} (bucket: ${bucket})`);
    } catch (redisError) {
      console.error('[RATE LIMIT] Redis error incrementing count:', redisError);
      console.error('[RATE LIMIT] Rate limiting disabled due to Redis error. Allowing request.');
      // If Redis fails, allow the request but log the error
      return next();
    }

    // Check if threshold exceeded
    if (count > policy.threshold) {
      // Never auto-ban localhost (safety check)
      if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        console.warn(`[RATE LIMIT] ⚠️  Threshold exceeded for localhost, but skipping ban (safety)`);
        return res.status(429).json({ 
          message: 'Too many requests from localhost (not banned for safety).',
          retryAfter: policy.windowSeconds
        });
      }
      
      console.warn(`[RATE LIMIT] ⚠️  THRESHOLD EXCEEDED! IP: ${ip}, Count: ${count}, Threshold: ${policy.threshold}`);
      
      try {
        console.log(`[RATE LIMIT] Attempting to auto-ban IP: ${ip}`);
        await autoBan(ip, 'rate-limit');
        console.log(`[RATE LIMIT] ✅ Successfully auto-banned IP: ${ip}`);
      } catch (banError) {
        console.error('[RATE LIMIT] ❌ autoBan failed:', banError);
        // Still return 429 even if ban fails
      }
      
      return res.status(429).json({ 
        message: 'Too many requests. You have been temporarily banned.',
        retryAfter: policy.windowSeconds
      });
    }

    // Request is within limit, continue
    next();
  } catch (e) {
    console.error('[RATE LIMIT] ❌ Unexpected error in rate limit middleware:', e);
    console.error('[RATE LIMIT] Error details:', {
      message: (e as Error)?.message,
      stack: (e as Error)?.stack,
      path: req.path,
      ip: getClientIP(req)
    });
    // On error, allow request but log it
    console.warn('[RATE LIMIT] Allowing request due to error (rate limiting disabled)');
    next();
  }
}
