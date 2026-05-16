import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCountrySummary } from "@/lib/data/alerts";
import { z } from "zod";

const IsoSchema = z.string().length(2).toUpperCase();

/** GET /api/v1/countries/[iso] — country risk summary and alert list. Public. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ iso: string }> },
) {
  const { iso } = await params;

  const parsed = IsoSchema.safeParse(iso);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ISO code" }, { status: 400 });
  }

  const summary = await getCountrySummary(parsed.data);
  if (!summary) {
    return NextResponse.json({ error: "Country not found or no data" }, { status: 404 });
  }

  return NextResponse.json(
    { data: summary },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } },
  );
}
