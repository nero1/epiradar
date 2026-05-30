import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRecentAuth } from "@/lib/auth/session";
import { createAdminClient, createServerClientInstance } from "@/lib/supabase/server";
import { isSameOriginMutation } from "@/lib/utils/security";

/**
 * POST /api/v1/account/delete — soft-deletes the authenticated user's account.
 * Sets deleted_at timestamp; the account can be recovered within 30 days by contacting support.
 * Hard-delete after 30 days is handled by a scheduled DB job / manual admin process.
 * The user's session is invalidated immediately after soft-delete.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  let user;
  try {
    user = await requireRecentAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerClientInstance();

  const { error } = await supabase
    .from("users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("[account/delete] Failed to soft-delete user:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  // Needs admin API for global sign-out.
  await createAdminClient().auth.admin.signOut(user.id, "global").catch((e: Error) =>
    console.error("[account/delete] Failed to revoke sessions:", e),
  );

  return NextResponse.json({
    success: true,
    message: "Account deleted. You can recover it within 30 days by contacting support.",
    recoveryDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}
