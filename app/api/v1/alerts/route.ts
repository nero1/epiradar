import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * GET /api/v1/alerts — paginated alert list.
 * Tier-based access:
 *   Public (no auth): top 10 alerts, truncated summaries
 *   Free: 30-day history, full summaries
 *   Paid: full archive, full summaries
 * Cursor-based pagination via `cursor` query param (alert ID).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).safeParse({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }
  const cursor = parsed.data.cursor ?? null;
  const limit = parsed.data.limit ?? 20;

  let user = null;
  try {
    user = await getAuthenticatedUser();
  } catch {
    // Unauthenticated — public access
  }

  const supabase = await createServerClientInstance();
  let query = supabase
    .from("alerts")
    .select(
      "id, source, country_iso, pathogen, risk_score, severity_score, spread_score, novelty_score, ai_summary, case_count, death_count, published_at, ingested_at",
    )
    .eq("is_active", true)
    .order("risk_score", { ascending: false })
    .order("id", { ascending: false });

  // Tier-based date filtering
  if (!user) {
    // Public: top 10 only
    query = query.limit(10);
  } else if (user.plan === "free") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("published_at", thirtyDaysAgo).limit(limit);
  } else {
    // Paid: full archive
    query = query.limit(limit);
  }

  // Cursor-based pagination
  if (cursor) {
    query = query.lt("id", cursor);
  }

  const { data: alerts, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }

  // Truncate summaries for public tier (teaser)
  const processed = (alerts ?? []).map((a) => {
    if (!user) {
      return {
        ...a,
        ai_summary: a.ai_summary
          ? a.ai_summary.slice(0, 120) + (a.ai_summary.length > 120 ? "…" : "")
          : null,
        _teaser: true,
      };
    }
    return a;
  });

  const nextCursor = processed.length === limit ? processed[processed.length - 1]?.id : null;

  return NextResponse.json(
    {
      data: processed,
      pagination: {
        nextCursor,
        hasMore: !!nextCursor,
        limit,
      },
      tier: user ? user.plan : "public",
    },
    {
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
