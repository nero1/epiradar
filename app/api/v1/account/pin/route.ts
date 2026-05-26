import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRecentAuth } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/utils/security";

const PinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  currentPin: z.string().regex(/^\d{4}$/).optional(),
});

const VerifyPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
});

/**
 * POST /api/v1/account/pin — set or update 4-digit PIN.
 * If a PIN is already set, currentPin must be provided for verification.
 * PIN is bcrypt-hashed before storage.
 */
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

  const body = await request.json().catch(() => null);
  const parsed = PinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "PIN must be exactly 4 digits", details: parsed.error.flatten() }, { status: 400 });
  }

  const { pin, currentPin } = parsed.data;
  const supabase = await createServerClientInstance();

  // If user already has a PIN, verify current PIN before allowing change
  if (user.pin_hash) {
    if (!currentPin) {
      return NextResponse.json({ error: "Current PIN required to change PIN" }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPin, user.pin_hash);
    if (!valid) {
      return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 400 });
    }
  }

  const pinHash = await bcrypt.hash(pin, 12);

  const { error } = await supabase
    .from("users")
    .update({ pin_hash: pinHash })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save PIN" }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: user.pin_hash ? "PIN updated." : "PIN set." });
}

/**
 * DELETE /api/v1/account/pin — remove PIN (requires current PIN for confirmation).
 */
export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  let user;
  try {
    user = await requireRecentAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.pin_hash) {
    return NextResponse.json({ error: "No PIN set" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = VerifyPinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "PIN required to remove PIN" }, { status: 400 });
  }

  const valid = await bcrypt.compare(parsed.data.pin, user.pin_hash);
  if (!valid) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 400 });
  }

  const supabase = await createServerClientInstance();
  const { error } = await supabase
    .from("users")
    .update({ pin_hash: null })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to remove PIN" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/v1/account/pin — verify PIN for sensitive operations.
 * Returns 200 if correct, 400 if wrong.
 */
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

  if (!user.pin_hash) {
    return NextResponse.json({ valid: true, message: "No PIN set — operation allowed" });
  }

  const body = await request.json().catch(() => null);
  const parsed = VerifyPinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  const valid = await bcrypt.compare(parsed.data.pin, user.pin_hash);
  if (!valid) {
    return NextResponse.json({ error: "Incorrect PIN", valid: false }, { status: 400 });
  }

  return NextResponse.json({ valid: true });
}
