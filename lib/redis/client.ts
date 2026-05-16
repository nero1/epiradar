import Redis from "ioredis";

/**
 * Redis client factory.
 * Selects between Upstash (serverless) and self-hosted ioredis based on REDIS_PROVIDER env var.
 * Upstash is recommended for Vercel Hobby Plan (no persistent connections).
 */

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisInstance) return redisInstance;

  const provider = process.env.REDIS_PROVIDER ?? "upstash";

  if (provider === "upstash") {
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    if (!redisUrl) {
      // No Redis configured — return a no-op client that always misses
      redisInstance = new Redis({ lazyConnect: true, enableOfflineQueue: false });
      return redisInstance;
    }
    redisInstance = new Redis(redisUrl, {
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  } else {
    // Self-hosted Redis
    redisInstance = new Redis({
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  return redisInstance;
}

/** Cache TTLs in seconds */
export const CACHE_TTL = {
  /** Risk scores for the world map — refreshed hourly */
  riskScores: 3600,
  /** Country summaries — refreshed hourly */
  countrySummary: 3600,
  /** Top 10 alerts for the ticker — refreshed hourly */
  topAlerts: 3600,
  /** Session data — 15 minutes (access token lifetime) */
  session: 900,
  /** Rate limit windows — 1 hour */
  rateLimit: 3600,
} as const;

/**
 * Probabilistic early expiry to prevent cache stampede.
 * Returns true if the cache entry should be refreshed before TTL expires.
 * Uses a beta distribution approximation: refresh with increasing probability as TTL nears expiry.
 */
export function shouldEarlyRefresh(ttlRemaining: number, totalTtl: number, beta = 0.1): boolean {
  if (ttlRemaining <= 0) return true;
  const normalizedTtl = ttlRemaining / totalTtl;
  // Exponentially increase refresh probability in the last 10% of TTL
  return Math.random() < Math.exp(-normalizedTtl / beta);
}
