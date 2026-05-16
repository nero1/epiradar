import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { initiatePaystackPayment } from "@/lib/billing/paystack";
import { createDodoCheckout } from "@/lib/billing/dodopayments";
import { randomUUID } from "crypto";
import { z } from "zod";

const UpgradeSchema = z.object({
  provider: z.enum(["paystack", "dodopayments"]),
});

/**
 * POST /api/v1/billing/upgrade — initiate a plan upgrade checkout session.
 * Returns a redirect URL to the payment provider.
 * Provider is explicit in request body — client selects based on user's region.
 */
export async function POST(request: NextRequest) {
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

  const idempotencyKey = randomUUID();

  try {
    if (parsed.data.provider === "paystack") {
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
