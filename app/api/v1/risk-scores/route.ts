import { NextResponse } from "next/server";
import { getCountryRiskScores } from "@/lib/data/alerts";

/** Public API — returns country risk scores for the world map. No auth required. */
export async function GET() {
  try {
    const scores = await getCountryRiskScores();
    return NextResponse.json(
      { data: scores, generatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
          "Content-Encoding": "gzip",
        },
      },
    );
  } catch (error) {
    console.error("[/api/v1/risk-scores]", error);
    return NextResponse.json({ error: "Failed to fetch risk scores" }, { status: 500 });
  }
}
