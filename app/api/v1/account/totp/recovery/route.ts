import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRecentAuth } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import { isSameOriginMutation } from "@/lib/utils/security";
import { z } from "zod";
import bcrypt from "bcryptjs";

const RecoverySchema = z.object({
  code: z.string().min(4).max(16),
});

/** POST /api/v1/account/totp/recovery — verify one-time recovery code and consume it. */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const user = await requireRecentAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = RecoverySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const code = parsed.data.code.toUpperCase();
  const hashes = ((user as unknown as { mfa_backup_codes?: string[] }).mfa_backup_codes) ?? [];

  let matchedIndex = -1;
  for (let i = 0; i < hashes.length; i += 1) {
    if (await bcrypt.compare(code, hashes[i])) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex < 0) return NextResponse.json({ error: "Invalid recovery code" }, { status: 400 });

  const next = hashes.filter((_, idx) => idx !== matchedIndex);
  const supabase = await createServerClientInstance();
  const { error } = await supabase.from("users").update({ mfa_backup_codes: next }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Failed to consume recovery code" }, { status: 500 });

  return NextResponse.json({ success: true, remainingCodes: next.length });
}
