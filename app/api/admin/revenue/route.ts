import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import Decimal from "decimal.js";

/**
 * GET /api/admin/revenue — MRR, new subscriptions, churn.
 * Aggregates billing_events from Paystack and Dodopayments.
 * All amounts normalised to USD cents using Decimal.js.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = await (supabase as any)
    .from("billing_events")
    .select("user_id, amount, currency, provider, event_type, created_at")
    .in("event_type", ["charge.success", "payment.succeeded"])
    .order("created_at", { ascending: false });

  const allEvents: Array<{ user_id: string; amount: number; currency: string; provider: string; event_type: string; created_at: string }> = events ?? [];

  // Normalize to USD cents via configurable FX rate.
  // billing_events.amount is treated as minor units (cents/kobo).
  const ngnPerUsd = new Decimal(process.env.NGN_PER_USD ?? "1500");
  const NGN_TO_USD_CENTS = new Decimal(100).div(ngnPerUsd);

  function toUsdCents(amount: number, currency: string): Decimal {
    if (currency === "USD") return new Decimal(amount);
    if (currency === "NGN") return new Decimal(amount).mul(NGN_TO_USD_CENTS);
    return new Decimal(amount); // assume USD cents for other
  }

  const thisMonthEvents = allEvents.filter((e) => e.created_at >= thisMonthStart);
  const lastMonthEvents = allEvents.filter(
    (e) => e.created_at >= lastMonthStart && e.created_at < thisMonthStart,
  );

  const mrrThis = thisMonthEvents.reduce(
    (sum, e) => sum.plus(toUsdCents(e.amount, e.currency)),
    new Decimal(0),
  );
  const mrrLast = lastMonthEvents.reduce(
    (sum, e) => sum.plus(toUsdCents(e.amount, e.currency)),
    new Decimal(0),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: paidUsers } = await (supabase as any)
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("plan", "paid")
    .is("deleted_at", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: newPaidThisMonth } = await (supabase as any)
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("plan", "paid")
    .gte("created_at", thisMonthStart);

  // Churn: users who were paid last month but are not paid now
  // Approximated by: users who had a payment event last month but no payment this month
  const lastMonthPayers = new Set(lastMonthEvents.map((e) => e.user_id).filter(Boolean));
  const thisMonthPayers = new Set(thisMonthEvents.map((e) => e.user_id).filter(Boolean));
  const churnedCount = [...lastMonthPayers].filter((id) => !thisMonthPayers.has(id)).length;
  const churnRate =
    lastMonthPayers.size > 0
      ? new Decimal(churnedCount).div(lastMonthPayers.size).mul(100).toFixed(1)
      : "0.0";

  return NextResponse.json({
    mrr: {
      thisMonth: mrrThis.toFixed(2),
      lastMonth: mrrLast.toFixed(2),
      currency: "USD",
      unit: "cents",
    },
    subscriptions: {
      activePaid: paidUsers ?? 0,
      newThisMonth: newPaidThisMonth ?? 0,
      churnedThisMonth: churnedCount,
      churnRate: `${churnRate}%`,
    },
    recentEvents: allEvents.slice(0, 20),
    generatedAt: now.toISOString(),
  });
}
