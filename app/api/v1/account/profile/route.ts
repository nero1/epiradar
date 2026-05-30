import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRecentAuth } from "@/lib/auth/session";
import { createServerClientInstance, createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/utils/security";

const ProfileSchema = z.object({
  display_name: z.string().min(1).max(80).optional(),
  recovery_email: z.string().email().optional(),
});

/** PATCH /api/v1/account/profile — update display name and/or recovery email */
export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  let user;
  try {
    user = await requireRecentAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createServerClientInstance();

  if (parsed.data.display_name !== undefined) {
    const { error } = await supabase
      .from("users")
      .update({ display_name: parsed.data.display_name })
      .eq("id", user.id);
    if (error) return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  if (parsed.data.recovery_email !== undefined) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { recovery_email: parsed.data.recovery_email },
    });
    if (error) return NextResponse.json({ error: "Failed to update recovery email" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
