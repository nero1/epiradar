import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { isSameOriginMutation } from "@/lib/utils/security";
import { z } from "zod";

const UpdateUserSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["suspend", "unsuspend", "set_plan", "set_admin", "set_theme"]),
  plan: z.enum(["free", "paid"]).optional(),
  is_admin: z.boolean().optional(),
  theme: z.string().max(60).nullable().optional(),
});

/** GET /api/admin/users — cursor paginated user list */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const parsedLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("users")
    .select("id, email, display_name, plan, is_admin, deleted_at, created_at, pdf_export_count")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
        createdAt: string;
        id: string;
      };
      query = query.or(`created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`);
    } catch {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });

  const items = data ?? [];
  const nextCursor =
    items.length === limit
      ? Buffer.from(
          JSON.stringify({ createdAt: items[items.length - 1].created_at, id: items[items.length - 1].id }),
          "utf8",
        ).toString("base64url")
      : null;
  return NextResponse.json({ data: items, limit, nextCursor });
}

/** PATCH /api/admin/users — suspend, change plan, or toggle admin */
export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

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

  const { userId, action, plan, is_admin, theme } = parsed.data;

  // Prevent self-demotion
  if (action === "set_admin" && userId === admin.id && is_admin === false) {
    return NextResponse.json({ error: "Cannot remove your own admin access" }, { status: 400 });
  }

  const supabase = createAdminClient();

  let update: Record<string, unknown> = {};

  if (action === "suspend") update = { deleted_at: new Date().toISOString() };
  else if (action === "unsuspend") update = { deleted_at: null };
  else if (action === "set_plan" && plan) update = { plan };
  else if (action === "set_admin" && is_admin !== undefined) update = { is_admin };
  else if (action === "set_theme") update = { preferred_theme: theme ?? null };

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
