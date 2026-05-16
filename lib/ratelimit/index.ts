import { getRedisClient } from "@/lib/redis/client";

/**
 * Token-bucket rate limiter using Redis.
 * Returns { allowed: true } or { allowed: false, retryAfterMs: number }.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfterMs?: number; remaining: number }> {
  const redis = getRedisClient();
  const redisKey = `rl:${key}`;

  try {
    const current = await redis.incr(redisKey);

    if (current === 1) {
      // First request in window — set TTL
      await redis.expire(redisKey, windowSeconds);
    }

    if (current > limit) {
      const ttl = await redis.ttl(redisKey);
      return { allowed: false, retryAfterMs: Math.max(ttl * 1000, 1000), remaining: 0 };
    }

    return { allowed: true, remaining: limit - current };
  } catch {
    // Redis unavailable — fail open (allow request)
    return { allowed: true, remaining: limit };
  }
}

/** Rate limit for exports: 10 per hour per user */
export async function rateLimitExport(userId: string) {
  return rateLimit(`export:${userId}`, 10, 3600);
}

/** Rate limit for API keys: 1000 requests per day */
export async function rateLimitApiKey(apiKeyHash: string) {
  const dayKey = new Date().toISOString().slice(0, 10);
  return rateLimit(`apikey:${apiKeyHash}:${dayKey}`, 1000, 86400);
}

/** Rate limit for unauthenticated IP-based requests: 60 per minute */
export async function rateLimitIp(ip: string) {
  return rateLimit(`ip:${ip}`, 60, 60);
}
