import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyPaystackSignature } from "@/lib/billing/paystack";
import { verifyDodoSignature } from "@/lib/billing/dodopayments";
import { generateApiKey, hashApiKey } from "@/lib/billing/apikey";

describe("verifyPaystackSignature", () => {
  const secret = "test_paystack_secret";
  const payload = JSON.stringify({ event: "charge.success", data: { reference: "ref_123" } });

  it("accepts a valid signature", () => {
    process.env.PAYSTACK_SECRET_KEY = secret;
    const sig = crypto.createHmac("sha512", secret).update(payload).digest("hex");
    expect(verifyPaystackSignature(payload, sig)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    process.env.PAYSTACK_SECRET_KEY = secret;
    expect(verifyPaystackSignature(payload, "bad_signature")).toBe(false);
  });

  it("rejects when secret not configured", () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const sig = crypto.createHmac("sha512", secret).update(payload).digest("hex");
    expect(verifyPaystackSignature(payload, sig)).toBe(false);
  });
});

describe("verifyDodoSignature", () => {
  const secret = "test_dodo_secret";
  const payload = JSON.stringify({ type: "payment.succeeded", data: { id: "evt_123" } });
  const timestamp = String(Math.floor(Date.now() / 1000));

  it("accepts a valid signature", () => {
    process.env.DODOPAYMENTS_WEBHOOK_SECRET = secret;
    const message = `${timestamp}.${payload}`;
    const sig = crypto.createHmac("sha256", secret).update(message).digest("hex");
    expect(verifyDodoSignature(payload, sig, timestamp)).toBe(true);
  });

  it("rejects tampered payload", () => {
    process.env.DODOPAYMENTS_WEBHOOK_SECRET = secret;
    const timestamp2 = String(Math.floor(Date.now() / 1000));
    const message = `${timestamp2}.${payload}`;
    const sig = crypto.createHmac("sha256", secret).update(message).digest("hex");
    expect(verifyDodoSignature("tampered payload", sig, timestamp2)).toBe(false);
  });

  it("rejects when secret not configured", () => {
    delete process.env.DODOPAYMENTS_WEBHOOK_SECRET;
    expect(verifyDodoSignature(payload, "any", timestamp)).toBe(false);
  });
});

describe("API key generation", () => {
  it("generates a key with epk_ prefix", () => {
    const { key } = generateApiKey();
    expect(key.startsWith("epk_")).toBe(true);
    expect(key.length).toBeGreaterThan(10);
  });

  it("generates a 64-char hex hash", () => {
    const { hash } = generateApiKey();
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hash is deterministic", () => {
    const { key, hash } = generateApiKey();
    expect(hashApiKey(key)).toBe(hash);
  });

  it("different keys produce different hashes", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it("raw key is never stored — only the hash should reach the DB", () => {
    // This test documents the contract: hash != key
    const { key, hash } = generateApiKey();
    expect(key).not.toBe(hash);
  });
});
