import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/stats — ingestion monitoring and AI pipeline stats.
 * Returns: last 7 ingestion runs, source health, AI scoring stats, alert volumes.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Fetch last 7 ingestion runs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runs } = await (supabase as any)
    .from("ingestion_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(7);

  // Alert volume stats
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ count: alertsToday }, { count: alertsWeek }, { count: totalAlerts }] = await Promise.all([
    (supabase as any).from("alerts").select("id", { count: "exact", head: true }).gte("ingested_at", yesterday),
    (supabase as any).from("alerts").select("id", { count: "exact", head: true }).gte("ingested_at", weekAgo),
    (supabase as any).from("alerts").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  // User counts by plan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: planCounts } = await (supabase as any)
    .from("users")
    .select("plan")
    .is("deleted_at", null);

  const byPlan = { free: 0, paid: 0 };
  for (const u of planCounts ?? []) {
    if (u.plan === "free") byPlan.free++;
    else if (u.plan === "paid") byPlan.paid++;
  }

  return NextResponse.json({
    ingestion: {
      recentRuns: runs ?? [],
      alertsToday: alertsToday ?? 0,
      alertsThisWeek: alertsWeek ?? 0,
      totalActiveAlerts: totalAlerts ?? 0,
    },
    users: byPlan,
    generatedAt: now.toISOString(),
  });
}
