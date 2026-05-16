import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllSources } from "./sources";
import { scoreAlert } from "@/lib/ai/pipeline";
import type { RawAlert } from "./sources";
import type { ScoredAlert } from "@/lib/ai/pipeline";

export interface IngestionResult {
  runId: string;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  sourcesFetched: number;
  errors: Record<string, string>;
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

    // Process in batches of 5 to respect AI rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((item) => processAndStoreAlert(supabase, item)),
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          itemsIngested++;
        } else {
          itemsFailed++;
          if (result.status === "rejected") {
            console.error("[ingestion] Failed to process alert:", result.reason);
          }
        }
      }
    }

    const durationMs = Date.now() - startedAt.getTime();

    // Update run record with completion
    await supabase
      .from("ingestion_runs")
      .update({
        status: "completed",
        sources_fetched: sourcesFetched,
        items_ingested: itemsIngested,
        items_skipped: itemsSkipped,
        errors,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    console.log(`[ingestion] Run ${runId} completed: ${itemsIngested} ingested, ${itemsSkipped} skipped, ${itemsFailed} failed`);

    return { runId, itemsIngested, itemsSkipped, itemsFailed, sourcesFetched, errors, durationMs };
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
): Promise<boolean> {
  const scored: ScoredAlert | null = await scoreAlert(item);

  if (!scored || !scored.isRelevant) {
    return false;
  }

  const { error } = await supabase.from("alerts").insert({
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
  });

  if (error) {
    // Unique constraint violation = race condition with another concurrent run — acceptable
    if (error.code === "23505") return false;
    throw new Error(`Failed to insert alert: ${error.message}`);
  }

  return true;
}
