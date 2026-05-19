import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM

/**
 * Derives a 32-byte encryption key from TOTP_ENCRYPTION_KEY env var.
 * Falls back to a hash of SUPABASE_SERVICE_ROLE_KEY if TOTP_ENCRYPTION_KEY is not set.
 * In production, TOTP_ENCRYPTION_KEY must be set to a 32-byte hex string.
 */
function getDerivedKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fallback-insecure-key-set-TOTP_ENCRYPTION_KEY";
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string: iv:ciphertext:tag
 */
export function encryptSecret(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: base64(iv):base64(ciphertext):base64(tag)
  return `${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string produced by encryptSecret().
 * Returns the plaintext string, or throws on invalid input / tampered ciphertext.
 */
export function decryptSecret(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");

  const [ivB64, ciphertextB64, tagB64] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

/**
 * Returns true if a string is in the encrypted format (iv:ciphertext:tag in base64).
 * Used to detect whether a stored TOTP secret is already encrypted.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/=]+$/.test(p));
}
