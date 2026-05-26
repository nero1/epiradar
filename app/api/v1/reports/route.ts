import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePaidUser } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import { generateDeepReport } from "@/lib/ai/pipeline";
import { rateLimitExport } from "@/lib/ratelimit";
import { getIdempotentResponse, reserveIdempotencyKey, setIdempotentResponse } from "@/lib/utils/idempotency";
import { isSameOriginMutation } from "@/lib/utils/security";
import { z } from "zod";

const ReportSchema = z.object({
  countryIso: z.string().length(2).toUpperCase().optional(),
  pathogen: z.string().min(1).max(100).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

/**
 * GET /api/v1/reports — list saved AI situation reports for the authenticated user.
 * Paid tier only. Cursor-based pagination via ?before=<ISO timestamp>.
 */
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requirePaidUser();
  } catch {
    return NextResponse.json(
      { error: "Paid plan required", upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const rawLimit = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

  const supabase = await createServerClientInstance();
  let query = supabase
    .from("reports")
    .select("id, country_iso, pathogen, based_on_alerts, generated_at")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("generated_at", before);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });

  const items = data ?? [];
  const nextCursor = items.length === limit ? items[items.length - 1].generated_at : null;

  return NextResponse.json({ data: items, nextCursor });
}

/**
 * POST /api/v1/reports — generate and persist a deep AI situation report.
 * Paid tier only. Rate-limited at 10/hour.
 * Accepts optional countryIso and/or pathogen to scope the report.
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
      { error: "Deep reports require a paid plan", upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  const rl = await rateLimitExport(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = ReportSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { countryIso, pathogen, idempotencyKey } = parsed.data;
  if (!countryIso && !pathogen) {
    return NextResponse.json({ error: "Provide at least one of: countryIso, pathogen" }, { status: 400 });
  }

  if (idempotencyKey) {
    const prior = await getIdempotentResponse<{ id: string | null; report: string; generatedAt: string; basedOnAlerts: number }>(`report:${user.id}`, idempotencyKey);
    if (prior) return NextResponse.json(prior);

    const reserved = await reserveIdempotencyKey(`report:${user.id}`, idempotencyKey);
    if (!reserved) {
      return NextResponse.json({ error: "Duplicate request", code: "IDEMPOTENCY_REPLAY" }, { status: 409 });
    }
  }

  const supabase = await createServerClientInstance();

  // Fetch recent relevant alerts to ground the report
  let query = supabase
    .from("alerts")
    .select("ai_summary, pathogen, country_iso, risk_score")
    .eq("is_active", true)
    .order("risk_score", { ascending: false })
    .limit(15);

  if (countryIso) query = query.contains("country_iso", [countryIso]);
  if (pathogen) query = query.ilike("pathogen", `%${pathogen}%`);

  const { data: alerts, error } = await query;

  if (error) return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });

  const summaries: string[] = (alerts ?? [])
    .filter((a: { ai_summary: string | null }) => a.ai_summary)
    .map((a: { ai_summary: string; pathogen: string | null; risk_score: number }) =>
      `[Risk: ${a.risk_score}/100] ${a.pathogen ?? "Unknown"}: ${a.ai_summary}`,
    );

  if (summaries.length === 0) {
    return NextResponse.json({ error: "No alert data found for the specified filters" }, { status: 404 });
  }

  try {
    const reportContent = await generateDeepReport({ countryIso, pathogen, recentAlerts: summaries });
    const generatedAt = new Date().toISOString();

    // Persist so users can retrieve later via GET /api/v1/reports
    const { data: saved, error: saveError } = await supabase
      .from("reports")
      .insert({
        user_id: user.id,
        country_iso: countryIso ?? null,
        pathogen: pathogen ?? null,
        content: reportContent,
        based_on_alerts: summaries.length,
        generated_at: generatedAt,
      })
      .select("id")
      .single();

    if (saveError) {
      console.error("[reports] Failed to persist report:", saveError);
    }

    const payload = {
      id: saved?.id ?? null,
      report: reportContent,
      generatedAt,
      basedOnAlerts: summaries.length,
    };

    if (idempotencyKey) {
      await setIdempotentResponse(`report:${user.id}`, idempotencyKey, payload);
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[reports] AI generation failed:", err);
    return NextResponse.json({ error: "Report generation failed" }, { status: 502 });
  }
}
