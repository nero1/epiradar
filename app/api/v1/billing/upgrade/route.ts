import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { initiatePaystackPayment } from "@/lib/billing/paystack";
import { createDodoCheckout } from "@/lib/billing/dodopayments";
import { randomUUID } from "crypto";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/utils/security";
import { reserveIdempotencyKey } from "@/lib/utils/idempotency";

const UpgradeSchema = z.object({
  provider: z.enum(["paystack", "dodopayments"]),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

/** Resolve provider from server-side IP headers, overriding client hint when possible. */
function resolveProvider(request: NextRequest, clientProvider: "paystack" | "dodopayments"): "paystack" | "dodopayments" {
  const country =
    (request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country") ?? "").toUpperCase();
  if (country === "NG") return "paystack";
  if (country && country !== "NG") return "dodopayments";
  // No IP country header available (local dev / unknown) — trust the client
  return clientProvider;
}

/**
 * POST /api/v1/billing/upgrade — initiate a plan upgrade checkout session.
 * Provider is resolved from IP geolocation headers (Cloudflare / Vercel).
 * Client-supplied provider is used only when no IP header is present.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.plan === "paid") {
    return NextResponse.json({ error: "Already on paid plan" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpgradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const provider = resolveProvider(request, parsed.data.provider);
  const idempotencyKey = parsed.data.idempotencyKey ?? randomUUID();

  const reserved = await reserveIdempotencyKey(`billing:upgrade:${user.id}`, idempotencyKey);
  if (!reserved) {
    return NextResponse.json({ error: "Duplicate request", code: "IDEMPOTENCY_REPLAY" }, { status: 409 });
  }

  try {
    if (provider === "paystack") {
      const { authorizationUrl, reference } = await initiatePaystackPayment({
        email: user.email,
        userId: user.id,
        amountKobo: 1500000, // NGN 15,000 (~$10 equivalent)
        idempotencyKey,
      });
      return NextResponse.json({ checkoutUrl: authorizationUrl, reference });
    } else {
      const { checkoutUrl, sessionId } = await createDodoCheckout({
        email: user.email,
        userId: user.id,
        amountUsdCents: 2900, // $29.00
        idempotencyKey,
      });
      return NextResponse.json({ checkoutUrl, sessionId });
    }
  } catch (err) {
    console.error("[billing/upgrade] Error:", err);
    return NextResponse.json({ error: "Failed to initiate checkout" }, { status: 502 });
  }
}
