import { describe, it, expect, vi, beforeEach } from "vitest";
import { scoreAlert } from "@/lib/ai/pipeline";
import type { RawAlert } from "@/lib/ingestion/sources";

const mockAlert: RawAlert = {
  source: "WHO",
  sourceUrl: "https://www.who.int/test",
  title: "Ebola outbreak in DRC — 50 confirmed cases",
  content: "The World Health Organization reports 50 confirmed Ebola cases in the Democratic Republic of Congo. 12 deaths have been recorded.",
  publishedAt: new Date("2026-01-01"),
  contentHash: "abc123",
};

const validAIResponse = JSON.stringify({
  isRelevant: true,
  riskScore: 78,
  severityScore: 85,
  spreadScore: 65,
  noveltyScore: 55,
  aiSummary: "An Ebola outbreak has been confirmed in the DRC with 50 cases and 12 deaths. WHO is coordinating response.",
  countryIso: ["CD"],
  pathogen: "Ebola virus",
  caseCount: 50,
  deathCount: 12,
});

describe("scoreAlert", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.DEEPSEEK_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("returns scored alert on successful DeepSeek response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: validAIResponse } }],
      }),
    });

    const result = await scoreAlert(mockAlert);

    expect(result).not.toBeNull();
    expect(result!.isRelevant).toBe(true);
    expect(result!.riskScore).toBe(78);
    expect(result!.countryIso).toContain("CD");
    expect(result!.pathogen).toBe("Ebola virus");
    expect(result!.caseCount).toBe(50);
    expect(result!.deathCount).toBe(12);
  });

  it("falls back to Gemini when DeepSeek fails", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if ((url as string).includes("deepseek")) {
        throw new Error("DeepSeek timeout");
      }
      // Gemini response
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: validAIResponse }] } }],
        }),
      };
    });

    const result = await scoreAlert(mockAlert);

    expect(result).not.toBeNull();
    expect(result!.riskScore).toBe(78);
    // Should have called both DeepSeek (failed) and Gemini (succeeded)
    expect(callCount).toBeGreaterThan(0);
  });

  it("returns null when both providers fail", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await scoreAlert(mockAlert);

    expect(result).toBeNull();
  });

  it("returns null on invalid JSON from AI", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not valid json {{{" } }],
      }),
    });

    const result = await scoreAlert(mockAlert);

    expect(result).toBeNull();
  });

  it("returns null when AI output fails schema validation", async () => {
    const badResponse = JSON.stringify({
      isRelevant: true,
      riskScore: 9999, // out of range
      aiSummary: "test",
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: badResponse } }],
      }),
    });

    const result = await scoreAlert(mockAlert);

    expect(result).toBeNull();
  });

  it("marks irrelevant items correctly", async () => {
    const irrelevantResponse = JSON.stringify({
      isRelevant: false,
      riskScore: 5,
      severityScore: 5,
      spreadScore: 5,
      noveltyScore: 5,
      aiSummary: "This is not an outbreak report.",
      countryIso: [],
      pathogen: null,
      caseCount: null,
      deathCount: null,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: irrelevantResponse } }],
      }),
    });

    const result = await scoreAlert(mockAlert);

    expect(result).not.toBeNull();
    expect(result!.isRelevant).toBe(false);
  });
});
