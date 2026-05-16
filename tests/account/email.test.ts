import { describe, it, expect } from "vitest";
import { buildAlertDigestHtml } from "@/lib/email";
import type { AlertDigestItem } from "@/lib/email";

const mockAlerts: AlertDigestItem[] = [
  {
    pathogen: "Mpox",
    countryIso: ["NG", "GH"],
    riskScore: 78,
    aiSummary: "An outbreak of Mpox has been reported across West Africa with rising case counts.",
    alertUrl: "https://epiradar.io/alerts/abc-123",
  },
  {
    pathogen: "Cholera",
    countryIso: ["SO"],
    riskScore: 60,
    aiSummary: "Cholera cases surging in Somalia following flood displacement.",
    alertUrl: "https://epiradar.io/alerts/def-456",
  },
];

describe("buildAlertDigestHtml", () => {
  it("returns a non-empty HTML string", () => {
    const html = buildAlertDigestHtml(mockAlerts, "Alice");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
  });

  it("includes user name in greeting", () => {
    const html = buildAlertDigestHtml(mockAlerts, "Alice");
    expect(html).toContain("Alice");
  });

  it("includes pathogen names", () => {
    const html = buildAlertDigestHtml(mockAlerts, "Test User");
    expect(html).toContain("Mpox");
    expect(html).toContain("Cholera");
  });

  it("includes risk scores", () => {
    const html = buildAlertDigestHtml(mockAlerts, "Test User");
    expect(html).toContain("78");
    expect(html).toContain("60");
  });

  it("includes alert URLs", () => {
    const html = buildAlertDigestHtml(mockAlerts, "Test User");
    expect(html).toContain("abc-123");
  });

  it("caps at 10 alerts", () => {
    const manyAlerts = Array.from({ length: 15 }, (_, i) => ({
      ...mockAlerts[0],
      pathogen: `Pathogen-${i}`,
      alertUrl: `https://epiradar.io/alerts/id-${i}`,
    }));
    const html = buildAlertDigestHtml(manyAlerts, "Test");
    // Only first 10 should appear
    expect(html).toContain("Pathogen-9");
    expect(html).not.toContain("Pathogen-10");
  });

  it("handles empty alert list gracefully", () => {
    const html = buildAlertDigestHtml([], "Test");
    expect(typeof html).toBe("string");
    // No alert rows but html structure still present
    expect(html).toContain("EpiRadar Alert Digest");
  });
});
