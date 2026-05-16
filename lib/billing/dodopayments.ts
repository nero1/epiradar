import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

export interface DodoEvent {
  type: string;
  data: {
    id: string;
    amount: number;
    currency: string;
    customer: { email: string; id: string };
    metadata?: Record<string, string>;
    status: string;
  };
}

/** Verify Dodopayments webhook HMAC-SHA256 signature */
export function verifyDodoSignature(payload: string, signature: string, timestamp: string): boolean {
  const secret = process.env.DODOPAYMENTS_WEBHOOK_SECRET;
  if (!secret) return false;

  // Dodopayments uses: HMAC-SHA256(timestamp + "." + payload)
  const message = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Create a Dodopayments checkout session */
export async function createDodoCheckout(params: {
  email: string;
  userId: string;
  amountUsdCents: number;
  idempotencyKey: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const response = await fetch("https://api.dodopayments.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DODOPAYMENTS_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.idempotencyKey,
    },
    body: JSON.stringify({
      amount: params.amountUsdCents,
      currency: "USD",
      customer_email: params.email,
      metadata: { userId: params.userId },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Dodopayments checkout failed: ${response.status} ${body}`);
  }

  const session = await response.json();
  return { checkoutUrl: session.url, sessionId: session.id };
}

/** Handle a successful Dodopayments charge — upgrades user plan atomically */
export async function handleDodoSuccess(event: DodoEvent): Promise<void> {
  const { id, customer, metadata } = event.data;
  const userId = metadata?.userId;

  if (!userId) {
    console.error("[dodopayments] Missing userId in webhook metadata, event id:", id);
    return;
  }

  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: billingError } = await (supabase as any)
    .from("billing_events")
    .upsert(
      {
        user_id: userId,
        provider: "dodopayments",
        event_type: event.type,
        amount: event.data.amount,
        currency: event.data.currency,
        idempotency_key: id,
        payload: event.data,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );

  if (billingError) {
    console.error("[dodopayments] Failed to record billing event:", billingError);
    throw new Error("Billing event record failed");
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: planError } = await (supabase as any)
    .from("users")
    .update({ plan: "paid", plan_expires_at: expiresAt.toISOString() })
    .eq("id", userId);

  if (planError) {
    console.error("[dodopayments] Failed to upgrade user plan:", planError, "email:", customer.email);
    throw new Error("Plan upgrade failed");
  }
}
