import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePaidUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { generateDeepReport } from "@/lib/ai/pipeline";
import { rateLimitExport } from "@/lib/ratelimit";
import { z } from "zod";

const ReportSchema = z.object({
  countryIso: z.string().length(2).toUpperCase().optional(),
  pathogen: z.string().min(1).max(100).optional(),
});

/**
 * POST /api/v1/reports — generate a deep AI situation report.
 * Paid tier only. Rate-limited at 10/hour.
 * Accepts optional countryIso and/or pathogen to scope the report.
 */
export async function POST(request: NextRequest) {
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

  const { countryIso, pathogen } = parsed.data;
  if (!countryIso && !pathogen) {
    return NextResponse.json({ error: "Provide at least one of: countryIso, pathogen" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch recent relevant alerts to ground the report
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
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
    const report = await generateDeepReport({ countryIso, pathogen, recentAlerts: summaries });
    return NextResponse.json({
      report,
      generatedAt: new Date().toISOString(),
      basedOnAlerts: summaries.length,
    });
  } catch (err) {
    console.error("[reports] AI generation failed:", err);
    return NextResponse.json({ error: "Report generation failed" }, { status: 502 });
  }
}
