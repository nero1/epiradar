import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/reset-quotas — resets monthly PDF export quotas for all free users.
 * Runs on the 1st of every month (configured in vercel.json).
 * Secured via CRON_SECRET bearer token.
 * Calls the atomic DB function to prevent race conditions.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("reset_monthly_pdf_quotas");

  if (error) {
    console.error("[cron/reset-quotas] Failed to reset quotas:", error);
    return NextResponse.json({ error: "Failed to reset quotas", detail: error.message }, { status: 500 });
  }

  const resetAt = new Date().toISOString();
  console.log(`[cron/reset-quotas] PDF export quotas reset at ${resetAt}`);

  return NextResponse.json({ success: true, resetAt });
}
