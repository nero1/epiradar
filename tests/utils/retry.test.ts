import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/lib/utils/retry";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "success";
    });

    const result = await withRetry(fn, { baseDelayMs: 1, maxAttempts: 5 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after max attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when retryIf returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("do not retry"));

    await expect(
      withRetry(fn, { retryIf: () => false, baseDelayMs: 1 }),
    ).rejects.toThrow("do not retry");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
