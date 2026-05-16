import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyDodoSignature, handleDodoSuccess, handleDodoFailure } from "@/lib/billing/dodopayments";
import type { DodoEvent } from "@/lib/billing/dodopayments";

/**
 * POST /api/webhooks/dodopayments — receives and verifies Dodopayments webhooks.
 * Signature verified via HMAC-SHA256(timestamp + "." + payload) before processing.
 * Idempotent: duplicate events ignored via DB upsert on idempotency_key.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("webhook-signature");
  const timestamp = request.headers.get("webhook-timestamp");

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature or timestamp" }, { status: 400 });
  }

  // Reject stale webhooks (> 5 minutes old)
  const tsMs = parseInt(timestamp, 10) * 1000;
  if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
    return NextResponse.json({ error: "Webhook timestamp too old" }, { status: 400 });
  }

  const payload = await request.text();

  if (!verifyDodoSignature(payload, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: DodoEvent;
  try {
    event = JSON.parse(payload) as DodoEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (event.type === "payment.succeeded") {
      await handleDodoSuccess(event);
    } else if (event.type === "payment.failed" || event.type === "subscription.payment_failed") {
      await handleDodoFailure(event);
    }
  } catch (err) {
    console.error("[webhook/dodopayments] Processing error:", err);
    return NextResponse.json({ error: "Processing failed", retryable: true }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}
