/**
 * SSRF protection: validates outbound hostnames against a strict allowlist
 * before making any external fetch calls (PRD §5.2, §14).
 *
 * All permitted external hostnames must be listed here.
 * If a new integration is added, add its hostname here too.
 */

const ALLOWED_HOSTS = new Set([
  // AI providers
  "api.deepseek.com",
  "generativelanguage.googleapis.com",

  // Data ingestion sources
  "www.who.int",
  "promedmail.org",
  "www.promedmail.org",
  "api.reliefweb.int",
  "eutils.ncbi.nlm.nih.gov",
  "news.google.com",

  // Email
  "api.mailgun.net",

  // Payments
  "api.paystack.co",
  "api.dodopayments.com",

  // Bot protection
  "challenges.cloudflare.com",

  // Auth
  "accounts.google.com",
]);

/**
 * Throws if `url` resolves to a hostname not in the allowlist.
 * Call this before any outbound fetch to external services.
 */
export function assertAllowedUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SSRF protection: invalid URL: ${url}`);
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`SSRF protection: hostname not in allowlist: ${parsed.hostname}`);
  }
}

/**
 * Drop-in replacement for `fetch` that validates the URL before calling.
 * Use this for all outbound requests to external third-party services.
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  assertAllowedUrl(url);
  return fetch(url, init);
}
