import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRecentAuth } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import { authenticator } from "otplib";
import { encryptSecret } from "@/lib/utils/crypto";
import { isSameOriginMutation } from "@/lib/utils/security";
import bcrypt from "bcryptjs";

function generateRecoveryCodes(): string[] {
  return Array.from({ length: 8 }, () => Math.random().toString(36).slice(2, 6).toUpperCase());
}

/** POST /api/v1/account/totp/setup — generate a TOTP secret and return the otpauth URI */
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

  if (user.totp_secret) {
    return NextResponse.json({ error: "2FA is already enabled" }, { status: 409 });
  }

  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri(user.email, "EpiRadar", secret);
  const encryptedSecret = encryptSecret(secret);
  const recoveryCodes = generateRecoveryCodes();
  const recoveryCodeHashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

  const supabase = await createServerClientInstance();
  const { error } = await supabase
    .from("users")
    .update({ totp_secret: `pending:${encryptedSecret}`, mfa_backup_codes: recoveryCodeHashes })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Failed to set up 2FA" }, { status: 500 });

  return NextResponse.json({ uri, recoveryCodes });
}
