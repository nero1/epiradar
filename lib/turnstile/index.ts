/**
 * Cloudflare Turnstile bot protection.
 * Verifies the token returned by the Turnstile widget on the client.
 * Set TURNSTILE_SECRET_KEY in env vars. If not set, verification is skipped (dev mode).
 */
export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    // Skip in development / CI when key is not configured
    return true;
  }

  const body = new URLSearchParams({
    secret,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  });

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) return false;

  const data = await res.json();
  return data.success === true;
}
