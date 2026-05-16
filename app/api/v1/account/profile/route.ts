import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const ProfileSchema = z.object({
  display_name: z.string().min(1).max(80).optional(),
});

/** PATCH /api/v1/account/profile — update display name */
export async function PATCH(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ display_name: parsed.data.display_name ?? null })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });

  return NextResponse.json({ success: true });
}
