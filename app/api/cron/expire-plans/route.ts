import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/expire-plans — downgrades paid users whose grace period has expired.
 * Runs every 6 hours (configured in vercel.json).
 * Secured via CRON_SECRET bearer token.
 *
 * Flow: payment fails → webhook sets plan_expires_at = NOW() + 3 days
 *       → this job checks plan_expires_at < NOW() and sets plan = 'free'
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find paid users whose plan_expires_at is in the past
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: expiredUsers, error: fetchError } = await (supabase as any)
    .from("users")
    .select("id, email, plan_expires_at")
    .eq("plan", "paid")
    .not("plan_expires_at", "is", null)
    .lt("plan_expires_at", new Date().toISOString())
    .is("deleted_at", null);

  if (fetchError) {
    console.error("[cron/expire-plans] Failed to fetch expired users:", fetchError);
    return NextResponse.json({ error: "Failed to fetch expired users" }, { status: 500 });
  }

  if (!expiredUsers || expiredUsers.length === 0) {
    return NextResponse.json({ success: true, downgraded: 0 });
  }

  const ids = expiredUsers.map((u: { id: string }) => u.id);

  // Atomically downgrade all expired users to free plan and clear expiry timestamp
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from("users")
    .update({ plan: "free", plan_expires_at: null })
    .in("id", ids);

  if (updateError) {
    console.error("[cron/expire-plans] Failed to downgrade users:", updateError);
    return NextResponse.json({ error: "Failed to downgrade users" }, { status: 500 });
  }

  console.log(`[cron/expire-plans] Downgraded ${ids.length} user(s) to free plan:`, ids);

  return NextResponse.json({
    success: true,
    downgraded: ids.length,
    userIds: ids,
    timestamp: new Date().toISOString(),
  });
}
