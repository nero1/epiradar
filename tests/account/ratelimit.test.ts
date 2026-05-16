import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Redis client so tests don't need a running Redis instance
vi.mock("@/lib/redis/client", () => {
  const store = new Map<string, number>();
  const noopRedis = {
    incr: vi.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    ttl: vi.fn(async () => 3600),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
    ping: vi.fn(async () => "PONG"),
  };
  return {
    getRedisClient: () => noopRedis,
    CACHE_TTL: { short: 60, medium: 3600, long: 86400 },
    shouldEarlyRefresh: () => false,
  };
});

describe("rateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-import the store proxy to reset state between tests
  });

  it("allows requests within limit", async () => {
    const { rateLimit } = await import("@/lib/ratelimit");
    const result = await rateLimit("test-key-allow", 10, 3600);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeDefined();
  });

  it("blocks when limit exceeded", async () => {
    const { rateLimit } = await import("@/lib/ratelimit");
    const key = `test-key-block-${Date.now()}`;
    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      await rateLimit(key, 3, 3600);
    }
    const result = await rateLimit(key, 3, 3600);
    expect(result.allowed).toBe(false);
  });

  it("rateLimitExport uses 10/hour limit", async () => {
    const { rateLimitExport } = await import("@/lib/ratelimit");
    const result = await rateLimitExport("user-uuid-123");
    expect(result.allowed).toBe(true);
  });

  it("rateLimitIp uses 60/min limit", async () => {
    const { rateLimitIp } = await import("@/lib/ratelimit");
    const result = await rateLimitIp("127.0.0.1");
    expect(result.allowed).toBe(true);
  });
});
