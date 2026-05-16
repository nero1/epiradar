import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticator } from "otplib";
import { decryptSecret, encryptSecret } from "@/lib/utils/crypto";
import { z } from "zod";

const VerifySchema = z.object({
  token: z.string().length(6).regex(/^\d{6}$/),
});

/** POST /api/v1/account/totp/verify — verify a TOTP token and activate 2FA */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
  }

  const storedSecret = user.totp_secret;
  if (!storedSecret || !storedSecret.startsWith("pending:")) {
    return NextResponse.json({ error: "No pending 2FA setup found" }, { status: 409 });
  }

  // Decrypt the stored secret — it was encrypted in setup step
  const encryptedPart = storedSecret.replace("pending:", "");
  let secret: string;
  try {
    secret = decryptSecret(encryptedPart);
  } catch {
    return NextResponse.json({ error: "Failed to read 2FA secret — please restart setup" }, { status: 500 });
  }

  const isValid = authenticator.verify({ token: parsed.data.token, secret });
  if (!isValid) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  // Activate — store encrypted without the pending: prefix
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ totp_secret: encryptSecret(secret) })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Failed to activate 2FA" }, { status: 500 });

  return NextResponse.json({ success: true });
}
