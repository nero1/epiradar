import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyPaystackSignature, handlePaystackSuccess, handlePaystackFailure } from "@/lib/billing/paystack";
import type { PaystackEvent } from "@/lib/billing/paystack";

/**
 * POST /api/webhooks/paystack — receives and verifies Paystack payment webhooks.
 * Signature verified via HMAC-SHA512 before processing.
 * Idempotent: duplicate events are ignored via DB upsert on idempotency_key.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-paystack-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();

  if (!verifyPaystackSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(payload) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (event.event === "charge.success") {
      await handlePaystackSuccess(event);
    } else if (event.event === "charge.failed" || event.event === "subscription.not_renew") {
      await handlePaystackFailure(event);
    }
  } catch (err) {
    console.error("[webhook/paystack] Processing error:", err);
    // Return 200 to prevent Paystack from retrying permanently broken events
    return NextResponse.json({ error: "Processing failed", retryable: true }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}
