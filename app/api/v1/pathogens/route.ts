import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClientInstance } from "@/lib/supabase/server";
import { getOrSetWithLock, CACHE_TTL } from "@/lib/redis/client";

/**
 * GET /api/v1/pathogens — list all pathogens with alert counts and max risk scores.
 * Public endpoint. Cached in Redis for 1 hour.
 * Supports ?q= for partial name search.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const cacheKey = `pathogens:list:${query}`;

  const result = await getOrSetWithLock(
    cacheKey,
    CACHE_TTL.riskScores,
    async () => {
      const supabase = await createServerClientInstance();
      let dbQuery = supabase
        .from("alerts")
        .select("pathogen, risk_score, country_iso, ingested_at")
        .eq("is_active", true)
        .not("pathogen", "is", null);

      if (query) dbQuery = dbQuery.ilike("pathogen", `%${query}%`);

      const { data, error } = await dbQuery.order("risk_score", { ascending: false }).limit(500);
      if (error) throw new Error("Failed to fetch pathogens");

      const map = new Map<string, { alertCount: number; maxRisk: number; countries: Set<string>; lastSeen: string }>();
      for (const row of data ?? []) {
        const name = (row.pathogen as string).trim();
        const existing = map.get(name) ?? { alertCount: 0, maxRisk: 0, countries: new Set<string>(), lastSeen: row.ingested_at };
        existing.alertCount++;
        if (row.risk_score > existing.maxRisk) existing.maxRisk = row.risk_score;
        for (const iso of row.country_iso ?? []) existing.countries.add(iso);
        if (row.ingested_at > existing.lastSeen) existing.lastSeen = row.ingested_at;
        map.set(name, existing);
      }

      const pathogens = Array.from(map.entries())
        .map(([name, stats]) => ({
          name,
          alertCount: stats.alertCount,
          maxRiskScore: Math.round(stats.maxRisk * 100) / 100,
          affectedCountries: Array.from(stats.countries),
          lastSeenAt: stats.lastSeen,
        }))
        .sort((a, b) => b.maxRiskScore - a.maxRiskScore);

      return { data: pathogens, total: pathogens.length, generatedAt: new Date().toISOString() };
    },
  );

  return NextResponse.json(result.data, { headers: { "X-Cache": result.cache.toUpperCase() } });
}
