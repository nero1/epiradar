import { lookup } from "dns/promises";
import net from "net";

const ALLOWED_HOSTS = new Set([
  "api.deepseek.com",
  "generativelanguage.googleapis.com",
  "www.who.int",
  "promedmail.org",
  "www.promedmail.org",
  "api.reliefweb.int",
  "eutils.ncbi.nlm.nih.gov",
  "news.google.com",
  "api.mailgun.net",
  "api.paystack.co",
  "api.dodopayments.com",
  "challenges.cloudflare.com",
  "accounts.google.com",
]);

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
  if (parsed.protocol !== "https:") {
    throw new Error(`SSRF protection: only https is allowed: ${parsed.protocol}`);
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error(`SSRF protection: disallowed port: ${parsed.port}`);
  }
}

export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  assertAllowedUrl(url);

  const parsed = new URL(url);
  const resolved = await lookup(parsed.hostname, { all: true });
  for (const addr of resolved) {
    if (isPrivateIp(addr.address)) {
      throw new Error(`SSRF protection: resolved private IP blocked (${addr.address})`);
    }
  }

  return fetch(url, {
    ...init,
    redirect: "error",
  });
}

function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    if (ip.startsWith("10.") || ip.startsWith("127.") || ip.startsWith("169.254.")) return true;
    const [a, b] = ip.split(".").map(Number);
    return (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIP(ip) === 6) {
    const low = ip.toLowerCase();
    return low === "::1" || low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe80:");
  }
  return true;
}
