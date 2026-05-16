import Decimal from "decimal.js";
import { createAdminClient } from "@/lib/supabase/server";
import type { Alert } from "@/lib/supabase/types";

export interface PdfExportResult {
  html: string;
  filename: string;
}

/**
 * Check and atomically decrement the PDF export quota for a free user.
 * Uses a database-level atomic function to prevent race conditions.
 * Returns true if export is allowed, false if quota exhausted.
 */
export async function checkAndDecrementPdfQuota(userId: string, plan: string): Promise<boolean> {
  if (plan === "paid") return true; // Paid users have unlimited exports

  const supabase = createAdminClient();

  // Call the atomic Postgres function defined in schema.sql
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("decrement_pdf_export_quota", {
    p_user_id: userId,
  });

  if (error) throw new Error(`Quota check failed: ${error.message}`);
  return data === true;
}

/**
 * Get remaining PDF export quota for a user.
 * Uses Decimal.js for precision — PRD requirement.
 */
export function getRemainingQuota(currentCount: number, plan: string): Decimal {
  if (plan === "paid") return new Decimal(Infinity);
  const FREE_TIER_LIMIT = new Decimal(3);
  const used = new Decimal(currentCount);
  return Decimal.max(FREE_TIER_LIMIT.minus(used), new Decimal(0));
}

/** Generate a print-ready HTML document for a single alert */
export function generateAlertPdfHtml(alert: Partial<Alert>): PdfExportResult {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://epiradar.io";
  const exportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const riskScore = Number(alert.risk_score ?? 0);
  const riskLabel =
    riskScore >= 75 ? "Critical" :
    riskScore >= 50 ? "High" :
    riskScore >= 25 ? "Moderate" : "Low";

  const riskColor =
    riskScore >= 75 ? "#DC2626" :
    riskScore >= 50 ? "#EA580C" :
    riskScore >= 25 ? "#D97706" : "#16A34A";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>EpiRadar Alert Report — ${alert.pathogen ?? "Outbreak"}</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #111827; }
        .header { border-bottom: 3px solid #1A5C4A; padding-bottom: 16px; margin-bottom: 24px; }
        .brand { color: #1A5C4A; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .risk-badge { display: inline-block; background: ${riskColor}; color: white; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 13px; }
        .score-bar { height: 8px; background: #E5E7EB; border-radius: 4px; overflow: hidden; margin-top: 4px; }
        .score-fill { height: 100%; background: ${riskColor}; border-radius: 4px; }
        .section { margin-bottom: 24px; }
        .section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; margin-bottom: 8px; }
        .footer { margin-top: 40px; border-top: 1px solid #E5E7EB; padding-top: 12px; font-size: 11px; color: #9CA3AF; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">EpiRadar — Infectious Disease Early Warning</div>
        <h1 style="margin: 8px 0; font-size: 22px;">
          ${alert.pathogen ?? "Outbreak Alert"} — ${(alert.country_iso ?? []).join(", ")}
        </h1>
        <span class="risk-badge">${riskLabel} Risk — ${Math.round(riskScore)}/100</span>
      </div>

      <div class="section">
        <h2>AI Summary</h2>
        <p style="line-height:1.7;">${alert.ai_summary ?? "Summary not available."}</p>
      </div>

      <div class="section">
        <h2>Risk Score Breakdown</h2>
        ${[
          ["Severity", Number(alert.severity_score ?? 0)],
          ["Geographic Spread", Number(alert.spread_score ?? 0)],
          ["Novelty", Number(alert.novelty_score ?? 0)],
        ].map(([label, val]) => `
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
              <span>${label}</span><span style="font-weight:600;">${Math.round(val as number)}/100</span>
            </div>
            <div class="score-bar"><div class="score-fill" style="width:${val}%;"></div></div>
          </div>
        `).join("")}
      </div>

      ${(alert.case_count != null || alert.death_count != null) ? `
      <div class="section">
        <h2>Epidemiological Data</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${alert.case_count != null ? `<tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Confirmed Cases</td><td style="padding:8px;border:1px solid #E5E7EB;">${alert.case_count.toLocaleString()}</td></tr>` : ""}
          ${alert.death_count != null ? `<tr><td style="padding:8px;border:1px solid #E5E7EB;font-weight:600;">Deaths</td><td style="padding:8px;border:1px solid #E5E7EB;color:#DC2626;">${alert.death_count.toLocaleString()}</td></tr>` : ""}
        </table>
      </div>
      ` : ""}

      <div class="section">
        <h2>Source Information</h2>
        <p style="font-size:13px;">
          <strong>Source:</strong> ${alert.source ?? "—"}<br>
          <strong>URL:</strong> <a href="${alert.source_url ?? "#"}">${alert.source_url ?? "—"}</a><br>
          <strong>Published:</strong> ${alert.published_at ? new Date(alert.published_at).toLocaleDateString() : "—"}
        </p>
      </div>

      <div class="footer">
        Generated by EpiRadar on ${exportDate} · ${appUrl}<br>
        This report is for informational purposes only. Always consult official health authorities for guidance.
      </div>
    </body>
    </html>
  `;

  const filename = `epiradar-alert-${alert.id?.slice(0, 8) ?? "report"}-${new Date().toISOString().slice(0, 10)}.html`;
  return { html, filename };
}
