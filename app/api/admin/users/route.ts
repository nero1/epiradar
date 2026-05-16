import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const UpdateUserSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["suspend", "unsuspend", "set_plan", "set_admin", "impersonate"]),
  plan: z.enum(["free", "paid"]).optional(),
  is_admin: z.boolean().optional(),
});

/** GET /api/admin/users — paginated user list */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error, count } = await (supabase as any)
    .from("users")
    .select("id, email, display_name, plan, is_admin, deleted_at, created_at, pdf_export_count", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });

  return NextResponse.json({ data, total: count, page, limit });
}

/** PATCH /api/admin/users — suspend, change plan, or toggle admin */
export async function PATCH(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { userId, action, plan, is_admin } = parsed.data;

  // Prevent self-demotion
  if (action === "set_admin" && userId === admin.id && is_admin === false) {
    return NextResponse.json({ error: "Cannot remove your own admin access" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Impersonate: generate a magic link for the target user (audit-logged)
  if (action === "impersonate") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: targetUser } = await (supabase as any)
      .from("users")
      .select("email")
      .eq("id", userId)
      .single();

    if (!targetUser?.email) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.email,
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[admin/users] Impersonate link generation failed:", linkError);
      return NextResponse.json({ error: "Failed to generate impersonation link" }, { status: 500 });
    }

    // Audit log the impersonation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("admin_audit_log")
      .insert({
        admin_id: admin.id,
        action: "impersonate",
        target_id: userId,
        details: { targetEmail: targetUser.email },
      })
      .catch((e: Error) => console.error("[admin/users] Audit log failed:", e));

    return NextResponse.json({ success: true, impersonateUrl: linkData.properties.action_link });
  }

  let update: Record<string, unknown> = {};

  if (action === "suspend") update = { deleted_at: new Date().toISOString() };
  else if (action === "unsuspend") update = { deleted_at: null };
  else if (action === "set_plan" && plan) update = { plan };
  else if (action === "set_admin" && is_admin !== undefined) update = { is_admin };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("users")
    .update(update)
    .eq("id", userId);

  if (error) return NextResponse.json({ error: "Failed to update user" }, { status: 500 });

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("admin_audit_log")
    .insert({
      admin_id: admin.id,
      action,
      target_id: userId,
      details: { ...parsed.data, ...update },
    })
    .catch((e: Error) => console.error("[admin/users] Audit log failed:", e));

  return NextResponse.json({ success: true });
}
