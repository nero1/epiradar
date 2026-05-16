import { withRetry } from "@/lib/utils/retry";

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

/** Send via Resend */
async function sendViaResend(email: EmailMessage): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "alerts@epiradar.io",
      to: email.to,
      subject: email.subject,
      html: email.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error ${response.status}: ${body}`);
  }
}

/** Send via Postmark */
async function sendViaPostmark(email: EmailMessage): Promise<void> {
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN!,
      "X-Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      From: process.env.EMAIL_FROM ?? "alerts@epiradar.io",
      To: email.to,
      Subject: email.subject,
      HtmlBody: email.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Postmark error ${response.status}`);
  }
}

/**
 * Send an email via the configured provider (Resend or Postmark).
 * Selected via EMAIL_PROVIDER env var. Retries on transient failures.
 */
export async function sendEmail(email: EmailMessage): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER ?? "resend";

  await withRetry(
    () => (provider === "postmark" ? sendViaPostmark(email) : sendViaResend(email)),
    { maxAttempts: 3, baseDelayMs: 500 },
  );
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
          <strong style="color:#111827;">${a.pathogen ?? "Unknown pathogen"}</strong>
          <br><span style="color:#6B7280;font-size:12px;">${a.countryIso.join(", ")}</span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #E5E7EB;text-align:center;">
          <span style="background:${a.riskScore >= 75 ? "#FEE2E2" : a.riskScore >= 50 ? "#FFEDD5" : "#FEF3C7"};
                       color:${a.riskScore >= 75 ? "#991B1B" : a.riskScore >= 50 ? "#9A3412" : "#92400E"};
                       padding:3px 8px;border-radius:4px;font-size:12px;font-weight:600;">
            ${Math.round(a.riskScore)}/100
          </span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #E5E7EB;color:#374151;font-size:13px;">
          ${a.aiSummary.slice(0, 150)}…
          <br><a href="${a.alertUrl}" style="color:#1A5C4A;font-size:12px;">Read more →</a>
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
          <p style="color:#A7F3D0;margin:4px 0 0;font-size:13px;">Hello ${userName} — here are your latest watchlist alerts</p>
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
