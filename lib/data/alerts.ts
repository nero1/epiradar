import { createAdminClient } from "@/lib/supabase/server";
import { getRedisClient, CACHE_TTL } from "@/lib/redis/client";
import type { Alert } from "@/lib/supabase/types";

/** Risk summary aggregated per country ISO code */
export interface CountryRiskScore {
  countryIso: string;
  riskScore: number;
  alertCount: number;
  topPathogen: string | null;
}

/**
 * Fetch country risk scores for the world map.
 * Aggregates the max risk score per country from active alerts.
 * Result is cached in Redis for 1 hour.
 */
export async function getCountryRiskScores(): Promise<CountryRiskScore[]> {
  const redis = getRedisClient();
  const cacheKey = "risk-scores:countries";

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CountryRiskScore[];
  } catch {
    // Redis unavailable — proceed without cache
  }

  const supabase = createAdminClient();

  const { data: alerts, error } = await supabase
    .from("alerts")
    .select("country_iso, risk_score, pathogen")
    .eq("is_active", true)
    .order("risk_score", { ascending: false });

  if (error || !alerts) return [];

  // Aggregate by country
  const byCountry = new Map<string, { maxRisk: number; count: number; pathogens: Map<string, number> }>();

  for (const alert of alerts) {
    const isos: string[] = alert.country_iso ?? [];
    for (const iso of isos) {
      const entry = byCountry.get(iso) ?? { maxRisk: 0, count: 0, pathogens: new Map() };
      entry.maxRisk = Math.max(entry.maxRisk, Number(alert.risk_score));
      entry.count++;
      if (alert.pathogen) {
        entry.pathogens.set(alert.pathogen, (entry.pathogens.get(alert.pathogen) ?? 0) + 1);
      }
      byCountry.set(iso, entry);
    }
  }

  const scores: CountryRiskScore[] = Array.from(byCountry.entries()).map(([iso, data]) => {
    const topPathogen = data.pathogens.size > 0
      ? [...data.pathogens.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;
    return {
      countryIso: iso,
      riskScore: data.maxRisk,
      alertCount: data.count,
      topPathogen,
    };
  });

  try {
    await redis.setex(cacheKey, CACHE_TTL.riskScores, JSON.stringify(scores));
  } catch {
    // Redis unavailable
  }

  return scores;
}

/**
 * Fetch the top N active alerts, optionally filtered by tier.
 * Public users get top 10. Free/paid users get more via the /api/v1/alerts endpoint.
 * Results cached for 1 hour.
 */
export async function getTopAlerts(limit = 10, includeSummary = false): Promise<Partial<Alert>[]> {
  const redis = getRedisClient();
  const cacheKey = `top-alerts:${limit}:${includeSummary}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis unavailable
  }

  const supabase = createAdminClient();

  const selectFields = [
    "id", "source", "country_iso", "pathogen", "risk_score",
    "severity_score", "spread_score", "novelty_score",
    "published_at", "is_active",
    ...(includeSummary ? ["ai_summary"] : []),
  ].join(", ");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: alerts, error } = await (supabase as any)
    .from("alerts")
    .select(selectFields)
    .eq("is_active", true)
    .order("risk_score", { ascending: false })
    .limit(limit) as { data: Partial<Alert>[] | null; error: unknown };

  if (error || !alerts) return [];

  // For public tier: truncate AI summary to 120 chars as a teaser
  const processed = alerts.map((a) => {
    if (!includeSummary) return a;
    const summary = a.ai_summary as string | null;
    return {
      ...a,
      ai_summary: summary ? summary.slice(0, 120) + (summary.length > 120 ? "…" : "") : null,
    };
  });

  try {
    await redis.setex(cacheKey, CACHE_TTL.topAlerts, JSON.stringify(processed));
  } catch {
    // Redis unavailable
  }

  return processed;
}

/**
 * Fetch 7-day global risk trend — one data point per day.
 * Used for the trend chart on the dashboard.
 */
export async function getGlobalRiskTrend(): Promise<{ date: string; avgRisk: number; alertCount: number }[]> {
  const redis = getRedisClient();
  const cacheKey = "risk-trend:7d";

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis unavailable
  }

  const supabase = createAdminClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: alerts, error } = await supabase
    .from("alerts")
    .select("risk_score, ingested_at")
    .gte("ingested_at", sevenDaysAgo)
    .order("ingested_at", { ascending: true });

  if (error || !alerts) return [];

  // Group by date
  const byDate = new Map<string, { total: number; count: number }>();
  for (const alert of alerts) {
    const date = alert.ingested_at.slice(0, 10);
    const entry = byDate.get(date) ?? { total: 0, count: 0 };
    entry.total += Number(alert.risk_score);
    entry.count++;
    byDate.set(date, entry);
  }

  const trend = Array.from(byDate.entries()).map(([date, { total, count }]) => ({
    date,
    avgRisk: Math.round(total / count),
    alertCount: count,
  }));

  try {
    await redis.setex(cacheKey, CACHE_TTL.riskScores, JSON.stringify(trend));
  } catch {
    // Redis unavailable
  }

  return trend;
}

/** Get a single alert by ID */
export async function getAlertById(id: string): Promise<Alert | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as Alert;
}

/** Get country summary: risk score + active alerts for a country ISO code */
export async function getCountrySummary(iso: string): Promise<{
  countryIso: string;
  riskScore: number;
  activeAlerts: Partial<Alert>[];
} | null> {
  const redis = getRedisClient();
  const cacheKey = `country:${iso}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis unavailable
  }

  const supabase = createAdminClient();

  const { data: alerts, error } = await supabase
    .from("alerts")
    .select("id, pathogen, risk_score, ai_summary, published_at, country_iso")
    .contains("country_iso", [iso])
    .eq("is_active", true)
    .order("risk_score", { ascending: false })
    .limit(20);

  if (error) return null;

  const riskScore = alerts && alerts.length > 0
    ? Math.max(...alerts.map((a) => Number(a.risk_score)))
    : 0;

  const result = { countryIso: iso, riskScore, activeAlerts: alerts ?? [] };

  try {
    await redis.setex(cacheKey, CACHE_TTL.countrySummary, JSON.stringify(result));
  } catch {
    // Redis unavailable
  }

  return result;
}
