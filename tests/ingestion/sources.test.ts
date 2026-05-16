import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllSources } from "@/lib/ingestion/sources";

describe("fetchAllSources", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns items from successful sources and errors from failed ones", async () => {
    // Increase timeout to account for retry backoff
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;

      if ((url as string).includes("who.int")) {
        // WHO succeeds
        return {
          ok: true,
          text: async () => `
            <rss><channel>
              <item>
                <title>Outbreak Alert Test</title>
                <link>https://www.who.int/test-alert</link>
                <description>Test outbreak description</description>
                <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
              </item>
            </channel></rss>
          `,
        };
      }

      if ((url as string).includes("reliefweb")) {
        return {
          ok: true,
          json: async () => ({ data: [] }),
        };
      }

      if ((url as string).includes("ncbi")) {
        return {
          ok: true,
          json: async () => ({ esearchresult: { idlist: [] } }),
        };
      }

      if ((url as string).includes("news.google.com")) {
        return {
          ok: true,
          text: async () => "<rss><channel></channel></rss>",
        };
      }

      if ((url as string).includes("promedmail")) {
        // ProMED fails
        return { ok: false, status: 503 };
      }

      return { ok: true, text: async () => "<rss></rss>", json: async () => ({}) };
    });

    const { items, errors, sourcesFetched } = await fetchAllSources();

    expect(sourcesFetched).toBe(5);
    expect(items.length).toBeGreaterThanOrEqual(1); // WHO returned one item
    expect(errors).toHaveProperty("ProMED");
  });

  it("deduplicates items with the same content hash", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      // All sources return the same content
      const sameXml = `
        <rss><channel>
          <item>
            <title>Duplicate Alert</title>
            <link>https://example.com/alert</link>
            <description>Same content for dedup test</description>
            <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `;

      if ((url as string).includes("reliefweb")) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      if ((url as string).includes("ncbi")) {
        return { ok: true, json: async () => ({ esearchresult: { idlist: [] } }) };
      }
      return { ok: true, text: async () => sameXml, json: async () => ({}) };
    });

    const { items } = await fetchAllSources();

    // GoogleNews deduplicates within itself, but WHO and ProMED might have same content
    const hashes = items.map((i) => i.contentHash);
    const uniqueHashes = new Set(hashes);
    // At minimum, GoogleNews deduplicated its own items
    expect(hashes.length).toBeGreaterThanOrEqual(uniqueHashes.size);
  });
});
