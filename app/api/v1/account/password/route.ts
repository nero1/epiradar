import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRecentAuth } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/utils/security";

const PasswordSchema = z.object({
  password: z.string().min(12).max(128)
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[0-9]/, "Password must include a number")
    .regex(/[^A-Za-z0-9]/, "Password must include a symbol"),
});

/** POST /api/v1/account/password — change password via Supabase Auth */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  try {
    await requireRecentAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  // Use the session-aware client so updateUser applies to the authenticated user
  const supabase = await createServerClientInstance();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
