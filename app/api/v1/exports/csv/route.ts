import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePaidUser } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import { rateLimitExport } from "@/lib/ratelimit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/utils/security";

const CsvSchema = z.object({
  countryIso: z.string().length(2).toUpperCase().optional(),
  pathogen: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  turnstileToken: z.string().optional(),
});


/**
 * POST /api/v1/exports/csv — export alerts as CSV. Paid tier only.
 * Rate limited: 10/hour/user.
 * Supports optional filtering by country ISO and/or pathogen.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  let user;
  try {
    user = await requirePaidUser();
  } catch {
    return NextResponse.json(
      { error: "Paid plan required for CSV export", upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  // Rate limit check
  const rl = await rateLimitExport(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = CsvSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { countryIso, pathogen, limit = 1000, turnstileToken } = parsed.data;

  // Bot protection: verify Turnstile token on export forms (PRD §5.2 / §14)
  const clientIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? undefined;
  const turnstilePassed = await verifyTurnstileToken(turnstileToken ?? "", clientIp);
  if (!turnstilePassed) {
    return NextResponse.json({ error: "Bot protection failed. Please complete the verification." }, { status: 403 });
  }

  const supabase = await createServerClientInstance();

  let query = supabase
    .from("alerts")
    .select("id, source, country_iso, pathogen, risk_score, severity_score, spread_score, novelty_score, ai_summary, case_count, death_count, published_at, ingested_at")
    .eq("is_active", true)
    .order("risk_score", { ascending: false })
    .limit(Math.min(limit, 10000));

  if (countryIso) {
    query = query.contains("country_iso", [countryIso.toUpperCase()]);
  }

  if (pathogen) {
    query = query.ilike("pathogen", `%${pathogen}%`);
  }

  const { data: alerts, error } = await query;

  if (error) return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });

  // Build CSV
  const headers = [
    "id", "source", "country_iso", "pathogen", "risk_score",
    "severity_score", "spread_score", "novelty_score",
    "ai_summary", "case_count", "death_count", "published_at", "ingested_at",
  ];

  const csvRows = [
    headers.join(","),
    ...(alerts ?? []).map((row) =>
      headers.map((h) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val = (row as any)[h];
        if (val === null || val === undefined) return "";
        if (Array.isArray(val)) return `"${val.join(";")}"`;
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(","),
    ),
  ].join("\n");

  const filename = `epiradar-alerts-${new Date().toISOString().slice(0, 10)}.csv`;

  // Log export for admin volume monitoring (non-fatal if it fails)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any)
    .from("export_logs")
    .insert({ user_id: user.id, export_type: "csv", alert_id: null })
    .then(() => {})
    .catch(() => {});

  return new NextResponse(csvRows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
