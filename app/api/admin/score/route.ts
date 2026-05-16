import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { scoreAlert } from "@/lib/ai/pipeline";
import type { RawAlert } from "@/lib/ingestion/sources";

/**
 * POST /api/admin/score — re-score alerts that were not scored during ingestion.
 * Targets alerts with risk_score = 0 and ai_summary IS NULL (ingested but AI failed).
 * Processes up to 50 alerts per run to respect AI rate limits.
 * Admin only.
 */
export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const startedAt = Date.now();

  // Find unscored alerts: risk_score = 0 and no summary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: unscored, error: fetchError } = await (supabase as any)
    .from("alerts")
    .select("id, source, source_url, content_hash, country_iso, pathogen, published_at, ai_summary")
    .eq("risk_score", 0)
    .is("ai_summary", null)
    .eq("is_active", true)
    .order("published_at", { ascending: false })
    .limit(50);

  if (fetchError) {
    return NextResponse.json({ error: "Failed to fetch unscored alerts" }, { status: 500 });
  }

  if (!unscored || unscored.length === 0) {
    return NextResponse.json({ success: true, scored: 0, failed: 0, message: "No unscored alerts found." });
  }

  let scored = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const alert of unscored) {
    const rawAlert: RawAlert = {
      source: alert.source,
      sourceUrl: alert.source_url,
      title: alert.pathogen ?? "Unknown",
      content: alert.ai_summary ?? "",
      contentHash: alert.content_hash,
      publishedAt: new Date(alert.published_at),
    };

    try {
      const result = await scoreAlert(rawAlert);

      if (!result || !result.isRelevant) {
        // Mark as scored but irrelevant so it won't be re-queued
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("alerts")
          .update({ risk_score: 1, ai_summary: "Alert reviewed — below relevance threshold." })
          .eq("id", alert.id);
        scored++;
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from("alerts")
        .update({
          risk_score: result.riskScore,
          severity_score: result.severityScore,
          spread_score: result.spreadScore,
          novelty_score: result.noveltyScore,
          ai_summary: result.aiSummary,
          country_iso: result.countryIso.length ? result.countryIso : alert.country_iso,
          pathogen: result.pathogen ?? alert.pathogen,
          case_count: result.caseCount,
          death_count: result.deathCount,
        })
        .eq("id", alert.id);

      if (updateError) {
        errors.push(`${alert.id}: ${updateError.message}`);
        failed++;
      } else {
        scored++;
      }
    } catch (err) {
      errors.push(`${alert.id}: ${(err as Error).message}`);
      failed++;
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log(`[admin/score] Scored ${scored} alerts, ${failed} failed in ${durationMs}ms`);

  return NextResponse.json({
    success: true,
    scored,
    failed,
    totalFound: unscored.length,
    durationMs,
    errors: errors.length > 0 ? errors : undefined,
  });
}
