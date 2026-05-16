import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/account/delete — soft-deletes the authenticated user's account.
 * Sets deleted_at timestamp; the account can be recovered within 30 days by contacting support.
 * Hard-delete after 30 days is handled by a scheduled DB job / manual admin process.
 * The user's session is invalidated immediately after soft-delete.
 */
export async function POST() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Soft-delete: set deleted_at to now
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("[account/delete] Failed to soft-delete user:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  // Revoke all active sessions by signing out globally
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).auth.admin.signOut(user.id, "global").catch((e: Error) =>
    console.error("[account/delete] Failed to revoke sessions:", e),
  );

  return NextResponse.json({
    success: true,
    message: "Account deleted. You can recover it within 30 days by contacting support.",
    recoveryDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}
