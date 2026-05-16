import Decimal from "decimal.js";

export const FREE_PDF_LIMIT = 3;

/** Get remaining PDF export quota for a user. Pure function — no server deps. */
export function getRemainingQuota(currentCount: number, plan: string): Decimal {
  if (plan === "paid") return new Decimal(Infinity);
  const limit = new Decimal(FREE_PDF_LIMIT);
  const used = new Decimal(currentCount);
  return Decimal.max(limit.minus(used), new Decimal(0));
}
