import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAlertById } from "@/lib/data/alerts";

/** GET /api/v1/alerts/[id] — single alert detail. Public. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid alert ID" }, { status: 400 });
  }

  const alert = await getAlertById(id);
  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  return NextResponse.json(
    { data: alert },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
