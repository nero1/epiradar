import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticator } from "otplib";
import { encryptSecret } from "@/lib/utils/crypto";

/** POST /api/v1/account/totp/setup — generate a TOTP secret and return the otpauth URI */
export async function POST() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.totp_secret) {
    return NextResponse.json({ error: "2FA is already enabled" }, { status: 409 });
  }

  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri(user.email, "EpiRadar", secret);

  // Encrypt the secret before storing — "pending:" prefix marks it as unverified
  // Encryption satisfies PRD §14: "TOTP secrets encrypted at rest"
  const encryptedSecret = encryptSecret(secret);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ totp_secret: `pending:${encryptedSecret}` })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Failed to set up 2FA" }, { status: 500 });

  return NextResponse.json({ uri });
}
