import { NextResponse } from "next/server";
import { getGlobalRiskTrend } from "@/lib/data/alerts";

/** GET /api/v1/risk-scores/trend — 7-day global risk trend data points. Public. */
export async function GET() {
  try {
    const trend = await getGlobalRiskTrend();
    return NextResponse.json(
      { data: trend },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } },
    );
  } catch (error) {
    console.error("[/api/v1/risk-scores/trend]", error);
    return NextResponse.json({ error: "Failed to fetch trend data" }, { status: 500 });
  }
}
