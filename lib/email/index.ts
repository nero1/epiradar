import { withRetry } from "@/lib/utils/retry";
import { getRedisClient } from "@/lib/redis/client";
import { safeFetch } from "@/lib/utils/safeFetch";
import { escapeHtml } from "@/lib/utils/encoding";

/** Email message payload */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Idempotency key — prevents duplicate sends on retry */
  idempotencyKey: string;
}

/** Alert digest item for email */
export interface AlertDigestItem {
  pathogen: string | null;
  countryIso: string[];
  riskScore: number;
  aiSummary: string;
  alertUrl: string;
}

/**
 * Send via Mailgun.
 * Idempotency is enforced via Redis — duplicate sends with the same key are silently skipped.
 * Mailgun does not have a native idempotency key param, so we track it ourselves.
 */
async function sendViaMailgun(email: EmailMessage): Promise<void> {
  const domain = process.env.MAILGUN_DOMAIN;
  const apiKey = process.env.MAILGUN_API_KEY;

  if (!domain || !apiKey) throw new Error("Mailgun credentials not configured (MAILGUN_DOMAIN, MAILGUN_API_KEY)");

  // Redis idempotency check — skip if already sent
  const redis = getRedisClient();
  const sentKey = `email:sent:${email.idempotencyKey}`;
  try {
    const alreadySent = await redis.get(sentKey);
    if (alreadySent) return;
  } catch {
    // Redis unavailable — proceed without idempotency guard
  }

  const formData = new URLSearchParams();
  formData.append("from", process.env.EMAIL_FROM ?? "EpiRadar Alerts <alerts@epiradar.io>");
  formData.append("to", email.to);
  formData.append("subject", email.subject);
  formData.append("html", email.html);

  const response = await safeFetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mailgun error ${response.status}: ${body}`);
  }

  // Mark as sent — TTL 25h covers daily digest window without blocking next day's send
  try {
    await redis.set(sentKey, "1", "EX", 90000);
  } catch {
    // Non-fatal if Redis write fails — worst case is a duplicate email on re-run
  }
}

/**
 * Send an email via Mailgun.
 * Retries up to 3 times on transient failures with exponential backoff.
 * Idempotency is enforced via Redis — safe to call on CRON re-runs.
 */
export async function sendEmail(email: EmailMessage): Promise<void> {
  await withRetry(() => sendViaMailgun(email), {
    maxAttempts: 3,
    baseDelayMs: 500,
    retryIf: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /429|5\d\d|timed out|network|fetch/i.test(msg);
    },
  });
}

/** Build an HTML alert digest email for a user's watchlist */
export function buildAlertDigestHtml(alerts: AlertDigestItem[], userName: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://epiradar.io";

  const alertRows = alerts
    .slice(0, 10) // max 10 alerts per digest
    .map(
      (a) => `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #E5E7EB;">
          <strong style="color:#111827;">${escapeHtml(a.pathogen ?? "Unknown pathogen")}</strong>
          <br><span style="color:#6B7280;font-size:12px;">${escapeHtml(a.countryIso.join(", "))}</span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #E5E7EB;text-align:center;">
          <span style="background:${a.riskScore >= 75 ? "#FEE2E2" : a.riskScore >= 50 ? "#FFEDD5" : "#FEF3C7"};
                       color:${a.riskScore >= 75 ? "#991B1B" : a.riskScore >= 50 ? "#9A3412" : "#92400E"};
                       padding:3px 8px;border-radius:4px;font-size:12px;font-weight:600;">
            ${Math.round(a.riskScore)}/100
          </span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #E5E7EB;color:#374151;font-size:13px;">
          ${escapeHtml(a.aiSummary.slice(0, 150))}…
          <br><a href="${escapeHtml(a.alertUrl)}" style="color:#1A5C4A;font-size:12px;">Read more →</a>
        </td>
      </tr>
    `,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:system-ui,sans-serif;background:#F9FAFB;margin:0;padding:20px;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #E5E7EB;">
        <div style="background:#1A5C4A;padding:20px 24px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">EpiRadar Alert Digest</h1>
          <p style="color:#A7F3D0;margin:4px 0 0;font-size:13px;">Hello ${escapeHtml(userName)} — here are your latest watchlist alerts</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#F9FAFB;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6B7280;font-weight:600;">PATHOGEN / COUNTRY</th>
              <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6B7280;font-weight:600;">RISK</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6B7280;font-weight:600;">SUMMARY</th>
            </tr>
          </thead>
          <tbody>${alertRows}</tbody>
        </table>
        <div style="padding:16px 24px;border-top:1px solid #E5E7EB;text-align:center;">
          <a href="${appUrl}/watchlist" style="background:#1A5C4A;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
            Manage Watchlist
          </a>
        </div>
        <div style="padding:12px 24px;text-align:center;font-size:11px;color:#9CA3AF;">
          <a href="${appUrl}/account" style="color:#9CA3AF;">Unsubscribe or manage alert preferences</a>
        </div>
      </div>
    </body>
    </html>
  `;
}
