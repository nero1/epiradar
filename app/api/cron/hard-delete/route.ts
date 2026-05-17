import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Hard-delete CRON — purges user accounts soft-deleted more than 30 days ago.
 * Runs daily at 03:00 UTC (configured in vercel.json).
 * Secured with CRON_SECRET bearer token.
 *
 * Deletion order respects FK constraints:
 * 1. Delete child rows (export_logs, reports, watchlists, billing_events) via CASCADE
 * 2. Delete the auth.users row — Supabase cascades to public.users automatically
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Find users eligible for hard-delete
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidates, error: fetchError } = await (supabase as any)
    .from("users")
    .select("id")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  if (fetchError) {
    console.error("[cron/hard-delete] Failed to fetch candidates:", fetchError);
    return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ deleted: 0, message: "No accounts eligible for hard-delete." });
  }

  const ids = candidates.map((u: { id: string }) => u.id);
  let deleted = 0;
  const errors: string[] = [];

  for (const userId of ids) {
    try {
      // Deleting the auth user cascades to public.users (ON DELETE CASCADE)
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) {
        errors.push(`${userId}: ${deleteError.message}`);
      } else {
        deleted++;
      }
    } catch (err) {
      errors.push(`${userId}: ${(err as Error).message}`);
    }
  }

  console.log(`[cron/hard-delete] Hard-deleted ${deleted}/${ids.length} accounts.`);

  return NextResponse.json({
    deleted,
    attempted: ids.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
