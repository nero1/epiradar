import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllSources } from "./sources";
import { scoreAlert } from "@/lib/ai/pipeline";
import { sendEmail, buildAlertDigestHtml } from "@/lib/email";
import type { RawAlert } from "./sources";
import type { ScoredAlert } from "@/lib/ai/pipeline";
import type { AlertDigestItem } from "@/lib/email";

export interface IngestionResult {
  runId: string;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  sourcesFetched: number;
  errors: Record<string, unknown>;
  durationMs: number;
}

/**
 * Runs a full ingestion cycle:
 * 1. Fetch all sources in parallel
 * 2. Dedup by SHA-256 content hash (skip already-ingested items)
 * 3. Score each new item through the AI pipeline
 * 4. Store results in the database
 *
 * Idempotent — safe to re-run within the same window.
 */
export async function runIngestion(triggeredBy: "cron" | "manual" | "external"): Promise<IngestionResult> {
  const startedAt = new Date();
  const supabase = createAdminClient();

  // Create ingestion run record
  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({
      triggered_by: triggeredBy,
      status: "running",
      sources_fetched: 0,
      items_ingested: 0,
      items_skipped: 0,
      errors: {},
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create ingestion run: ${runError?.message}`);
  }

  const runId = run.id;

  try {
    // Step 1: Fetch all sources
    const { items, errors, sourcesFetched } = await fetchAllSources();
    console.log(`[ingestion] Fetched ${items.length} items from ${sourcesFetched} sources`);

    // Step 2: Dedup — check which content hashes already exist in DB
    const hashes = items.map((i) => i.contentHash);
    const { data: existingHashes } = await supabase
      .from("alerts")
      .select("content_hash")
      .in("content_hash", hashes);

    const existingHashSet = new Set((existingHashes ?? []).map((h: { content_hash: string }) => h.content_hash));
    const newItems = items.filter((i) => !existingHashSet.has(i.contentHash));
    const itemsSkipped = items.length - newItems.length;

    console.log(`[ingestion] ${newItems.length} new items, ${itemsSkipped} skipped (dupes)`);

    // Step 3: Score each new item through AI pipeline (concurrency-limited to avoid rate limits)
    let itemsIngested = 0;
    let itemsFailed = 0;
    let fallbackCount = 0;
    let totalTokens = 0;

    // Process in batches of 5 to respect AI rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((item) => processAndStoreAlert(supabase, item)),
      );

      const newlyInserted: Array<{ id: string; scored: ScoredAlert }> = [];

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "fulfilled" && result.value) {
          itemsIngested++;
          if (result.value.scored.usedFallback) fallbackCount++;
          totalTokens += result.value.scored.tokensUsed ?? 0;
          if (result.value.insertedId) {
            newlyInserted.push({ id: result.value.insertedId, scored: result.value.scored });
          }
        } else {
          itemsFailed++;
          if (result.status === "rejected") {
            console.error("[ingestion] Failed to process alert:", result.reason);
          }
        }
      }

      // Send immediate alerts to paid users watching matching pathogens/countries
      if (newlyInserted.length > 0) {
        sendImmediateAlerts(supabase, newlyInserted).catch((e) =>
          console.error("[ingestion] Immediate alert dispatch error:", e),
        );
      }
    }

    const durationMs = Date.now() - startedAt.getTime();

    // Merge AI stats into errors JSONB under reserved _stats key
    const errorsWithStats = {
      ...errors,
      _stats: { fallbacks: fallbackCount, tokens: totalTokens },
    };

    // Update run record with completion
    await supabase
      .from("ingestion_runs")
      .update({
        status: "completed",
        sources_fetched: sourcesFetched,
        items_ingested: itemsIngested,
        items_skipped: itemsSkipped,
        errors: errorsWithStats,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    console.log(`[ingestion] Run ${runId} completed: ${itemsIngested} ingested, ${itemsSkipped} skipped, ${itemsFailed} failed, ${fallbackCount} fallbacks, ${totalTokens} tokens`);

    return { runId, itemsIngested, itemsSkipped, itemsFailed, sourcesFetched, errors: errorsWithStats, durationMs };
  } catch (fatalError) {
    // Mark run as failed
    await supabase
      .from("ingestion_runs")
      .update({
        status: "failed",
        errors: { fatal: (fatalError as Error).message },
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    throw fatalError;
  }
}

/** Score a single raw alert and store it in the database */
async function processAndStoreAlert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  item: RawAlert,
): Promise<{ insertedId?: string; scored: ScoredAlert } | false> {
  const scored: ScoredAlert | null = await scoreAlert(item);

  if (!scored || !scored.isRelevant) {
    return false;
  }

  const { data, error } = await supabase.from("alerts").insert({
    source: item.source,
    source_url: item.sourceUrl,
    content_hash: item.contentHash,
    country_iso: scored.countryIso,
    pathogen: scored.pathogen,
    risk_score: scored.riskScore,
    severity_score: scored.severityScore,
    spread_score: scored.spreadScore,
    novelty_score: scored.noveltyScore,
    ai_summary: scored.aiSummary,
    case_count: scored.caseCount,
    death_count: scored.deathCount,
    published_at: item.publishedAt.toISOString(),
    is_active: true,
  }).select("id").single();

  if (error) {
    // Unique constraint violation = race condition with another concurrent run — acceptable
    if (error.code === "23505") return false;
    throw new Error(`Failed to insert alert: ${error.message}`);
  }

  return { insertedId: data?.id, scored };
}

/**
 * Send immediate email alerts to paid users with matching immediate-mode watchlist entries.
 * Fire-and-forget — errors are logged but do not affect the ingestion result.
 */
async function sendImmediateAlerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  newAlerts: Array<{ id: string; scored: ScoredAlert }>,
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://epiradar.io";

  // Fetch paid users with immediate-mode watchlists
  const { data: watchlists } = await supabase
    .from("watchlists")
    .select("user_id, type, value, users(id, email, display_name, plan, deleted_at)")
    .eq("alert_mode", "immediate");

  if (!watchlists?.length) return;

  // Group by user — only paid, non-deleted users
  const byUser = new Map<string, { email: string; name: string; watches: Array<{ type: string; value: string }> }>();
  for (const wl of watchlists) {
    const u = wl.users;
    if (!u || u.deleted_at || u.plan !== "paid") continue;
    if (!byUser.has(wl.user_id)) {
      byUser.set(wl.user_id, { email: u.email, name: u.display_name ?? u.email.split("@")[0], watches: [] });
    }
    byUser.get(wl.user_id)!.watches.push({ type: wl.type, value: wl.value });
  }

  for (const [userId, { email, name, watches }] of byUser) {
    const matched: AlertDigestItem[] = newAlerts
      .filter(({ scored }) =>
        watches.some((w) => {
          if (w.type === "country") return scored.countryIso.some((iso) => iso.toUpperCase() === w.value.toUpperCase());
          if (w.type === "pathogen") return scored.pathogen?.toLowerCase().includes(w.value.toLowerCase());
          return scored.countryIso.some((iso) => iso.toLowerCase().includes(w.value.toLowerCase()));
        }),
      )
      .map(({ id, scored }) => ({
        pathogen: scored.pathogen,
        countryIso: scored.countryIso,
        riskScore: scored.riskScore,
        aiSummary: scored.aiSummary,
        alertUrl: `${appUrl}/alerts/${id}`,
      }));

    if (!matched.length) continue;

    const idempotencyKey = `immediate-${userId}-${Date.now()}`;
    try {
      await sendEmail({
        to: email,
        subject: `EpiRadar: Immediate alert — ${matched[0].pathogen ?? "Outbreak"} detected`,
        html: buildAlertDigestHtml(matched, name),
        idempotencyKey,
      });
    } catch (err) {
      console.error(`[ingestion] Immediate alert email failed for ${userId}:`, (err as Error).message);
    }
  }
}
