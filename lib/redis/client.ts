import Redis from "ioredis";

/**
 * Redis client factory.
 * Selects between Upstash (serverless) and self-hosted ioredis based on REDIS_PROVIDER env var.
 * Upstash is recommended for Vercel Hobby Plan (no persistent connections).
 */

type MinimalRedis = Pick<Redis, "get" | "set" | "del" | "ttl" | "expire" | "incr" | "decr">;

let redisInstance: MinimalRedis | null = null;

function createNoopRedis(): MinimalRedis {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  const now = () => Date.now();
  const expired = (k: string) => {
    const item = store.get(k);
    if (!item) return true;
    if (item.expiresAt && item.expiresAt <= now()) {
      store.delete(k);
      return true;
    }
    return false;
  };

  return {
    async get(key: string) { if (expired(key)) return null; return store.get(key)?.value ?? null; },
    async set(key: string, value: string, ...args: Array<string | number>) {
      let nx = false; let ex: number | undefined;
      for (let i = 0; i < args.length; i += 1) {
        if (args[i] === "NX") nx = true;
        if (args[i] === "EX") ex = Number(args[i + 1]);
      }
      if (nx && !expired(key) && store.has(key)) return null;
      store.set(key, { value, expiresAt: ex ? now() + ex * 1000 : undefined });
      return "OK";
    },
    async del(key: string) { const existed = store.delete(key); return existed ? 1 : 0; },
    async ttl(key: string) { if (expired(key)) return -2; const exp = store.get(key)?.expiresAt; return exp ? Math.max(0, Math.floor((exp - now()) / 1000)) : -1; },
    async expire(key: string, seconds: number) { if (expired(key) || !store.has(key)) return 0; const i = store.get(key)!; store.set(key, { value: i.value, expiresAt: now() + seconds * 1000 }); return 1; },
    async incr(key: string) { if (expired(key)) store.delete(key); const v = Number(store.get(key)?.value ?? "0") + 1; store.set(key, { value: String(v), expiresAt: store.get(key)?.expiresAt }); return v; },
    async decr(key: string) { if (expired(key)) store.delete(key); const v = Number(store.get(key)?.value ?? "0") - 1; store.set(key, { value: String(v), expiresAt: store.get(key)?.expiresAt }); return v; },
  };
}

export function getRedisClient(): MinimalRedis {
  if (redisInstance) return redisInstance;

  const provider = process.env.REDIS_PROVIDER ?? "upstash";

  if (provider === "upstash") {
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    if (!redisUrl) {
      // No Redis configured — return deterministic in-memory no-op implementation.
      redisInstance = createNoopRedis();
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

export async function getOrSetWithLock<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<{ data: T; cache: "hit" | "miss" | "stale" }> {
  const redis = getRedisClient();
  const lockKey = `lock:${key}`;
  const cached = await redis.get(key).catch(() => null);
  if (cached) {
    const ttl = await redis.ttl(key).catch(() => -1);
    if (ttl > 0 && shouldEarlyRefresh(ttl, ttlSeconds)) {
      const gotLock = await redis.set(lockKey, "1", "EX", 20, "NX").catch(() => null);
      if (gotLock === "OK") {
        producer().then((fresh) => redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds)).finally(() => redis.del(lockKey));
      }
      return { data: JSON.parse(String(cached)) as T, cache: "stale" };
    }
    return { data: JSON.parse(String(cached)) as T, cache: "hit" };
  }

  const fresh = await producer();
  await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds).catch(() => {});
  return { data: fresh, cache: "miss" };
}
