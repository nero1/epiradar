import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runIngestion } from "@/lib/ingestion/run";

/**
 * CRON ingestion endpoint.
 * Vercel Hobby plan only supports once-daily cron; vercel.json schedules this at 06:00 UTC
 * as the baseline. For higher-frequency ingestion (e.g. every 4 hours), configure a
 * supplementary job on cron-jobs.org — see docs/SETUP.md §5 for details.
 * Secured via Authorization: Bearer {CRON_SECRET} header — returns 401 without it.
 * Each run is idempotent: already-ingested items are skipped via content hash dedup.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const triggeredBy = request.headers.get("x-cron-source") === "vercel" ? "cron" : "external";

  try {
    const result = await runIngestion(triggeredBy);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron/ingest] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
