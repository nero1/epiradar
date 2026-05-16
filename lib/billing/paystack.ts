import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

export interface PaystackEvent {
  event: string;
  data: {
    reference: string;
    amount: number;
    currency: string;
    customer: { email: string };
    metadata?: Record<string, string>;
    status: string;
  };
}

/** Verify Paystack webhook HMAC-SHA512 signature */
export function verifyPaystackSignature(payload: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;
  const hash = crypto.createHmac("sha512", secret).update(payload).digest("hex");
  const a = Buffer.from(hash);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Initiate a Paystack payment session and return the authorization URL */
export async function initiatePaystackPayment(params: {
  email: string;
  userId: string;
  amountKobo: number;
  idempotencyKey: string;
}): Promise<{ authorizationUrl: string; reference: string }> {
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.idempotencyKey,
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      currency: "NGN",
      metadata: { userId: params.userId },
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?payment=success`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Paystack init failed: ${response.status} ${body}`);
  }

  const { data } = await response.json();
  return { authorizationUrl: data.authorization_url, reference: data.reference };
}

/** Handle a failed Paystack charge — applies 3-day grace period before downgrade */
export async function handlePaystackFailure(event: PaystackEvent): Promise<void> {
  const { metadata } = event.data;
  const userId = metadata?.userId;
  if (!userId) return;

  const supabase = createAdminClient();

  // Record the failed event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("billing_events")
    .upsert(
      {
        user_id: userId,
        provider: "paystack",
        event_type: event.event,
        amount: event.data.amount,
        currency: event.data.currency,
        idempotency_key: `fail-${event.data.reference}`,
        payload: event.data,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );

  // Set plan_expires_at to 3 days from now — Vercel's expiry check will downgrade after this
  const graceEnd = new Date();
  graceEnd.setDate(graceEnd.getDate() + 3);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("users")
    .update({ plan_expires_at: graceEnd.toISOString() })
    .eq("id", userId)
    .eq("plan", "paid");

  console.log(`[paystack] Failed payment for user ${userId}. Grace period until ${graceEnd.toISOString()}`);
}

/** Handle a successful Paystack charge — upgrades user plan atomically */
export async function handlePaystackSuccess(event: PaystackEvent): Promise<void> {
  const { reference, customer, metadata } = event.data;
  const userId = metadata?.userId;

  if (!userId) {
    console.error("[paystack] Missing userId in webhook metadata, reference:", reference);
    return;
  }

  const supabase = createAdminClient();

  // Record billing event with idempotency key = reference
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: billingError } = await (supabase as any)
    .from("billing_events")
    .upsert(
      {
        user_id: userId,
        provider: "paystack",
        event_type: event.event,
        amount: event.data.amount,
        currency: event.data.currency,
        idempotency_key: reference,
        payload: event.data,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );

  if (billingError) {
    console.error("[paystack] Failed to record billing event:", billingError);
    throw new Error("Billing event record failed");
  }

  // Upgrade user plan — expires in 30 days
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: planError } = await (supabase as any)
    .from("users")
    .update({ plan: "paid", plan_expires_at: expiresAt.toISOString() })
    .eq("id", userId);

  if (planError) {
    console.error("[paystack] Failed to upgrade user plan:", planError, "email:", customer.email);
    throw new Error("Plan upgrade failed");
  }
}
