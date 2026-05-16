import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import { z } from "zod";

const PasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

/** POST /api/v1/account/password — change password via Supabase Auth */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
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
