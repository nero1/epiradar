import { getRedisClient } from "@/lib/redis/client";

const IDEMPOTENCY_TTL_SECONDS = 60 * 60;
const localFallback = new Map<string, number>();

export async function reserveIdempotencyKey(scope: string, key: string): Promise<boolean> {
  const redis = getRedisClient();
  const full = `idem:${scope}:${key}`;
  const now = Date.now();

  // Opportunistic local fallback cleanup.
  for (const [k, expiry] of localFallback.entries()) {
    if (expiry <= now) localFallback.delete(k);
  }

  try {
    const res = await redis.set(full, "1", "EX", IDEMPOTENCY_TTL_SECONDS, "NX");
    return res === "OK";
  } catch {
    const expiry = localFallback.get(full);
    if (expiry && expiry > now) return false;
    localFallback.set(full, now + IDEMPOTENCY_TTL_SECONDS * 1000);
    return true;
  }
}

/**
 * Persist a serialized response payload for idempotent replay.
 * Best-effort cache write: failures do not fail the main request.
 */
export async function setIdempotentResponse(scope: string, key: string, response: unknown): Promise<void> {
  const redis = getRedisClient();
  const full = `idemresp:${scope}:${key}`;
  try {
    await redis.set(full, JSON.stringify(response), "EX", IDEMPOTENCY_TTL_SECONDS);
  } catch {
    // best effort
  }
}

/**
 * Retrieve a previously persisted idempotent response payload.
 * Returns null when absent or unreadable.
 */
export async function getIdempotentResponse<T>(scope: string, key: string): Promise<T | null> {
  const redis = getRedisClient();
  const full = `idemresp:${scope}:${key}`;
  try {
    const raw = await redis.get(full);
    if (!raw) return null;
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}
