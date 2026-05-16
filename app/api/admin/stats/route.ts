import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/stats — ingestion monitoring, AI pipeline stats, alert volumes, export usage.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const [
    { data: runs },
    { count: alertsToday },
    { count: alertsWeek },
    { count: totalAlerts },
    { data: planCounts },
    { count: exportsToday },
    { count: exportsWeek },
    { data: exportsByType },
  ] = await Promise.all([
    sb.from("ingestion_runs").select("*").order("started_at", { ascending: false }).limit(10),
    sb.from("alerts").select("id", { count: "exact", head: true }).gte("ingested_at", yesterday),
    sb.from("alerts").select("id", { count: "exact", head: true }).gte("ingested_at", weekAgo),
    sb.from("alerts").select("id", { count: "exact", head: true }).eq("is_active", true),
    sb.from("users").select("plan").is("deleted_at", null),
    sb.from("export_logs").select("id", { count: "exact", head: true }).gte("created_at", yesterday),
    sb.from("export_logs").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    sb.from("export_logs").select("export_type").gte("created_at", weekAgo),
  ]);

  const byPlan = { free: 0, paid: 0 };
  for (const u of planCounts ?? []) {
    if (u.plan === "free") byPlan.free++;
    else if (u.plan === "paid") byPlan.paid++;
  }

  // AI pipeline stats derived from ingestion_runs
  const completedRuns: Array<{ items_ingested: number; items_skipped: number; errors: Record<string, string>; started_at: string; completed_at: string }> = (runs ?? []).filter(
    (r: { status: string }) => r.status === "completed",
  );

  const totalIngested = completedRuns.reduce((s: number, r) => s + (r.items_ingested ?? 0), 0);
  const totalSkipped = completedRuns.reduce((s: number, r) => s + (r.items_skipped ?? 0), 0);
  const failedRuns = (runs ?? []).filter((r: { status: string }) => r.status === "failed").length;

  // Source health: aggregate errors across recent runs
  const sourceErrors: Record<string, number> = {};
  const sourceLastSuccess: Record<string, string> = {};
  for (const run of runs ?? []) {
    for (const [source, errMsg] of Object.entries(run.errors ?? {})) {
      if (errMsg) sourceErrors[source] = (sourceErrors[source] ?? 0) + 1;
    }
    if (run.status === "completed") {
      // Track last successful run time per source (sources_fetched doesn't give per-source data, use run time)
      for (const source of ["WHO", "ProMED", "ReliefWeb", "PubMed", "GoogleNews"]) {
        if (!run.errors?.[source]) {
          if (!sourceLastSuccess[source] || run.started_at > sourceLastSuccess[source]) {
            sourceLastSuccess[source] = run.started_at;
          }
        }
      }
    }
  }

  const sourceHealth = ["WHO", "ProMED", "ReliefWeb", "PubMed", "GoogleNews"].map((source) => ({
    source,
    errorCount: sourceErrors[source] ?? 0,
    lastSuccess: sourceLastSuccess[source] ?? null,
    status: (sourceErrors[source] ?? 0) > 2 ? "degraded" : "ok",
  }));

  // Avg latency from ingestion runs (completed_at - started_at)
  const latencies = completedRuns
    .filter((r) => r.completed_at && r.started_at)
    .map((r) => new Date(r.completed_at).getTime() - new Date(r.started_at).getTime());
  const avgLatencyMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

  // Tally exports by type for the week
  const exportCounts = { pdf: 0, csv: 0 };
  for (const row of exportsByType ?? []) {
    if (row.export_type === "pdf") exportCounts.pdf++;
    else if (row.export_type === "csv") exportCounts.csv++;
  }

  return NextResponse.json({
    ingestion: {
      recentRuns: runs ?? [],
      alertsToday: alertsToday ?? 0,
      alertsThisWeek: alertsWeek ?? 0,
      totalActiveAlerts: totalAlerts ?? 0,
      sourceHealth,
    },
    aiPipeline: {
      totalScored: totalIngested,
      totalSkipped,
      failedRuns,
      avgLatencyMs,
      fallbackRate: null, // Requires per-run fallback tracking — future enhancement
    },
    exports: {
      today: exportsToday ?? 0,
      thisWeek: exportsWeek ?? 0,
      byType: exportCounts,
    },
    users: byPlan,
    generatedAt: now.toISOString(),
  });
}
