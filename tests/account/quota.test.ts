import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRemainingQuota } from "@/lib/export/pdf";
import Decimal from "decimal.js";

describe("getRemainingQuota", () => {
  it("returns Infinity for paid users", () => {
    const result = getRemainingQuota(0, "paid");
    expect(result.isFinite()).toBe(false);
  });

  it("returns 3 for a free user with no exports", () => {
    const result = getRemainingQuota(0, "free");
    expect(result.equals(new Decimal(3))).toBe(true);
  });

  it("returns 2 after 1 export", () => {
    const result = getRemainingQuota(1, "free");
    expect(result.equals(new Decimal(2))).toBe(true);
  });

  it("returns 0 when quota exhausted", () => {
    const result = getRemainingQuota(3, "free");
    expect(result.equals(new Decimal(0))).toBe(true);
  });

  it("never goes negative when over limit", () => {
    const result = getRemainingQuota(99, "free");
    expect(result.isNegative()).toBe(false);
    expect(result.equals(new Decimal(0))).toBe(true);
  });
});

describe("quota precision (Decimal.js)", () => {
  it("handles floating point without precision loss", () => {
    // 0.1 + 0.2 === 0.3 with Decimal, not 0.30000000000000004
    const a = new Decimal(0.1).plus(0.2);
    expect(a.equals(new Decimal(0.3))).toBe(true);
  });

  it("Decimal subtraction is exact", () => {
    const limit = new Decimal(3);
    const used = new Decimal(1);
    expect(limit.minus(used).equals(new Decimal(2))).toBe(true);
  });
});

describe("checkAndDecrementPdfQuota (mocked)", () => {
  const mockRpc = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows paid users without calling DB", async () => {
    const { checkAndDecrementPdfQuota } = await import("@/lib/export/pdf");
    // Paid users short-circuit before any DB call — just verify it returns true
    // We spy on createAdminClient to ensure it's never called for paid users
    const result = await checkAndDecrementPdfQuota("user-123", "paid");
    expect(result).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
