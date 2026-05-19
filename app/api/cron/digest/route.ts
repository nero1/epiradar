import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, buildAlertDigestHtml } from "@/lib/email";
import type { AlertDigestItem } from "@/lib/email";
import type { Watchlist } from "@/lib/supabase/types";

/**
 * CRON digest endpoint — sends daily watchlist alert digests.
 * Vercel Hobby plan only supports once-daily cron; vercel.json schedules this at 07:00 UTC.
 * This job is inherently daily, so no supplementary cron-jobs.org job is needed.
 * Secured via CRON_SECRET bearer token.
 * Only sends to users with alert_mode="daily" watchlist items.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://epiradar.io";

  // Fetch all watchlists with daily digest mode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: watchlists, error: wlError } = await (supabase as any)
    .from("watchlists")
    .select("*, users(id, email, display_name, plan, deleted_at)")
    .eq("alert_mode", "daily");

  if (wlError) {
    console.error("[cron/digest] Failed to fetch watchlists:", wlError);
    return NextResponse.json({ error: "Failed to fetch watchlists" }, { status: 500 });
  }

  // Group watchlists by user_id
  const byUser = new Map<string, { email: string; name: string; watches: Watchlist[] }>();
  for (const wl of (watchlists ?? [])) {
    const u = wl.users;
    // Skip soft-deleted users and non-paid users (email is paid-only)
    if (!u || u.deleted_at || u.plan !== "paid") continue;

    if (!byUser.has(wl.user_id)) {
      byUser.set(wl.user_id, {
        email: u.email,
        name: u.display_name ?? u.email.split("@")[0],
        watches: [],
      });
    }
    byUser.get(wl.user_id)!.watches.push(wl as Watchlist);
  }

  // Fetch recent high-risk alerts (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentAlerts, error: alertError } = await (supabase as any)
    .from("alerts")
    .select("id, pathogen, country_iso, risk_score, ai_summary, source_url")
    .eq("is_active", true)
    .gte("ingested_at", since)
    .order("risk_score", { ascending: false })
    .limit(50);

  if (alertError) {
    console.error("[cron/digest] Failed to fetch alerts:", alertError);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [userId, { email, name, watches }] of byUser) {
    // Match alerts to this user's watchlist items
    const matched: AlertDigestItem[] = (recentAlerts ?? []).filter((alert: {
      id: string;
      pathogen: string | null;
      country_iso: string[];
      risk_score: number;
      ai_summary: string | null;
      source_url: string | null;
    }) => {
      return watches.some((w) => {
        if (w.type === "country") {
          return (alert.country_iso ?? []).some(
            (iso: string) => iso.toUpperCase() === w.value.toUpperCase(),
          );
        }
        if (w.type === "pathogen") {
          return alert.pathogen?.toLowerCase().includes(w.value.toLowerCase());
        }
        // region — simple substring match on country ISO for now
        return (alert.country_iso ?? []).some((iso: string) =>
          iso.toLowerCase().includes(w.value.toLowerCase()),
        );
      });
    }).map((alert: {
      id: string;
      pathogen: string | null;
      country_iso: string[];
      risk_score: number;
      ai_summary: string | null;
      source_url: string | null;
    }): AlertDigestItem => ({
      pathogen: alert.pathogen,
      countryIso: alert.country_iso ?? [],
      riskScore: alert.risk_score,
      aiSummary: alert.ai_summary ?? "No summary available.",
      alertUrl: `${appUrl}/alerts/${alert.id}`,
    }));

    if (matched.length === 0) {
      skipped++;
      continue;
    }

    const html = buildAlertDigestHtml(matched, name);
    const idempotencyKey = `digest-${userId}-${new Date().toISOString().slice(0, 10)}`;

    try {
      await sendEmail({
        to: email,
        subject: `EpiRadar: ${matched.length} new alert${matched.length > 1 ? "s" : ""} matching your watchlist`,
        html,
        idempotencyKey,
      });
      sent++;
    } catch (err) {
      errors.push(`${userId}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    success: true,
    sent,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
