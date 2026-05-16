import crypto from "crypto";

/** Generate a new API key and its SHA-256 hash */
export function generateApiKey(): { key: string; hash: string } {
  const key = `epk_${crypto.randomBytes(32).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, hash };
}

/** Hash an existing API key for lookup */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}
