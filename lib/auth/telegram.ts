/**
 * Telegram Login Widget scaffold.
 * PRD §16: "Telegram auth scaffolded but not activated in MVP."
 *
 * To activate:
 *   1. Create a Telegram bot via @BotFather, get TELEGRAM_BOT_TOKEN.
 *   2. Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME in your env.
 *   3. Set NEXT_PUBLIC_ENABLE_TELEGRAM_AUTH=true.
 *   4. Verify the callback signature below before trusting any auth data.
 *
 * Telegram sends an HMAC-SHA256 signed payload to the callback URL.
 * The secret key is SHA-256(TELEGRAM_BOT_TOKEN), NOT the token itself.
 */

import crypto from "crypto";

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Verifies the Telegram Login Widget callback payload.
 * Returns true only if the HMAC-SHA256 signature is valid and the
 * auth_date is within the last 24 hours (replay-attack protection).
 *
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(data: TelegramAuthData): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  // Build the check string: sorted key=value pairs, newline-separated, excluding hash
  const { hash, ...fields } = data;
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // Secret key is SHA-256 of the bot token
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  if (expectedHash !== hash) return false;

  // Reject auth data older than 24 hours
  const ageSeconds = Math.floor(Date.now() / 1000) - data.auth_date;
  return ageSeconds < 86400;
}
