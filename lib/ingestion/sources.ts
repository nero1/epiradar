import { fetchWithTimeout, withRetry } from "@/lib/utils/retry";
import { assertAllowedUrl } from "@/lib/utils/safeFetch";
import crypto from "crypto";

/** Raw item fetched from a data source before AI processing */
export interface RawAlert {
  source: "WHO" | "ProMED" | "ReliefWeb" | "PubMed" | "GoogleNews";
  sourceUrl: string;
  title: string;
  content: string;
  publishedAt: Date;
  contentHash: string;
}

/** Compute SHA-256 content hash for deduplication */
function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Parse an RSS/Atom feed and return raw items */
async function parseRssFeed(xml: string, source: RawAlert["source"]): Promise<RawAlert[]> {
  const items: RawAlert[] = [];

  // Simple regex-based RSS parser — avoids heavy DOM dependencies on Edge
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = (/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(itemXml) ||
      /<title>([\s\S]*?)<\/title>/.exec(itemXml))?.[1]?.trim() ?? "";

    const link = (/<link>([\s\S]*?)<\/link>/.exec(itemXml))?.[1]?.trim() ?? "";

    const description = (/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/.exec(itemXml) ||
      /<description>([\s\S]*?)<\/description>/.exec(itemXml))?.[1]?.trim() ?? "";

    const pubDate = (/<pubDate>([\s\S]*?)<\/pubDate>/.exec(itemXml))?.[1]?.trim();

    const content = `${title}\n${description}`;
    if (!title || !link) continue;

    items.push({
      source,
      sourceUrl: link,
      title,
      content,
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
      contentHash: hashContent(content),
    });
  }

  return items;
}

/** WHO Disease Outbreak News RSS feed */
export async function fetchWHOAlerts(): Promise<RawAlert[]> {
  return withRetry(async () => {
    const url = "https://www.who.int/rss-feeds/news-releases.xml";
    assertAllowedUrl(url);
    const response = await fetchWithTimeout(
      url,
      {},
      15_000,
    );

    if (!response.ok) throw new Error(`WHO feed returned ${response.status}`);

    const xml = await response.text();
    return parseRssFeed(xml, "WHO");
  });
}

/** ProMED-mail alert RSS feed */
export async function fetchProMEDAlerts(): Promise<RawAlert[]> {
  return withRetry(async () => {
    const url = "https://promedmail.org/feed/";
    assertAllowedUrl(url);
    const response = await fetchWithTimeout(
      url,
      {},
      15_000,
    );

    if (!response.ok) throw new Error(`ProMED feed returned ${response.status}`);

    const xml = await response.text();
    return parseRssFeed(xml, "ProMED");
  });
}

/** ReliefWeb health situation reports API */
export async function fetchReliefWebAlerts(): Promise<RawAlert[]> {
  return withRetry(async () => {
    assertAllowedUrl("https://api.reliefweb.int/v1/reports");
    const response = await fetchWithTimeout(
      "https://api.reliefweb.int/v1/reports?" +
        new URLSearchParams({
          "filter[field]": "theme.name",
          "filter[value]": "Health",
          "fields[include][]": "title,date,url,body",
          limit: "20",
          sort: "date:desc",
        }),
      { headers: { "Accept": "application/json" } },
      15_000,
    );

    if (!response.ok) throw new Error(`ReliefWeb API returned ${response.status}`);

    const data = await response.json();
    const items: RawAlert[] = [];

    for (const item of data.data ?? []) {
      const title = item.fields?.title ?? "";
      const url = item.fields?.url ?? "";
      const body = item.fields?.body ?? "";
      const dateStr = item.fields?.date?.created;

      const content = `${title}\n${body}`;
      if (!title || !url) continue;

      items.push({
        source: "ReliefWeb",
        sourceUrl: url,
        title,
        content,
        publishedAt: dateStr ? new Date(dateStr) : new Date(),
        contentHash: hashContent(content),
      });
    }

    return items;
  });
}

/** PubMed new publications matching outbreak-related MeSH terms */
export async function fetchPubMedAlerts(): Promise<RawAlert[]> {
  return withRetry(async () => {
    assertAllowedUrl("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
    // Search for recent outbreak-related publications
    const searchResponse = await fetchWithTimeout(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" +
        new URLSearchParams({
          db: "pubmed",
          term: '("disease outbreak"[MeSH] OR "emerging infectious disease"[MeSH]) AND "last 7 days"[PDat]',
          retmax: "20",
          retmode: "json",
          usehistory: "y",
        }),
      {},
      15_000,
    );

    if (!searchResponse.ok) throw new Error(`PubMed search returned ${searchResponse.status}`);

    const searchData = await searchResponse.json();
    const ids: string[] = searchData.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    // Fetch summaries for those IDs
    const summaryResponse = await fetchWithTimeout(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?" +
        new URLSearchParams({
          db: "pubmed",
          id: ids.join(","),
          retmode: "json",
        }),
      {},
      15_000,
    );

    if (!summaryResponse.ok) throw new Error(`PubMed summary returned ${summaryResponse.status}`);

    const summaryData = await summaryResponse.json();
    const items: RawAlert[] = [];

    for (const id of ids) {
      const item = summaryData.result?.[id];
      if (!item) continue;

      const title = item.title ?? "";
      const url = `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
      const authors = (item.authors ?? []).map((a: { name: string }) => a.name).join(", ");
      const content = `${title}\n${item.source ?? ""} — ${authors}`;

      items.push({
        source: "PubMed",
        sourceUrl: url,
        title,
        content,
        publishedAt: item.pubdate ? new Date(item.pubdate) : new Date(),
        contentHash: hashContent(content),
      });
    }

    return items;
  });
}

/** Google News RSS for health keywords */
export async function fetchGoogleNewsAlerts(): Promise<RawAlert[]> {
  const queries = [
    "disease outbreak",
    "epidemic alert",
    "pandemic risk",
    "WHO health emergency",
  ];

  const results = await Promise.allSettled(
    queries.map(async (q) => {
      return withRetry(async () => {
        assertAllowedUrl("https://news.google.com/rss/search");
        const response = await fetchWithTimeout(
          `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:3d&hl=en-US&gl=US&ceid=US:en`,
          {},
          15_000,
        );

        if (!response.ok) throw new Error(`Google News returned ${response.status}`);
        const xml = await response.text();
        return parseRssFeed(xml, "GoogleNews");
      });
    }),
  );

  const items: RawAlert[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    }
  }

  // Deduplicate within the batch by contentHash
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.contentHash)) return false;
    seen.add(item.contentHash);
    return true;
  });
}

/** Fetch all sources in parallel, collect results, tolerate individual source failures */
export async function fetchAllSources(): Promise<{
  items: RawAlert[];
  errors: Record<string, string>;
  sourcesFetched: number;
}> {
  const sources = [
    { name: "WHO", fn: fetchWHOAlerts },
    { name: "ProMED", fn: fetchProMEDAlerts },
    { name: "ReliefWeb", fn: fetchReliefWebAlerts },
    { name: "PubMed", fn: fetchPubMedAlerts },
    { name: "GoogleNews", fn: fetchGoogleNewsAlerts },
  ];

  const results = await Promise.allSettled(sources.map(({ fn }) => fn()));

  const items: RawAlert[] = [];
  const errors: Record<string, string> = {};

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const sourceName = sources[i].name;

    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      errors[sourceName] = result.reason?.message ?? "Unknown error";
      console.error(`[ingestion] ${sourceName} failed:`, result.reason);
    }
  }

  return {
    items,
    errors,
    sourcesFetched: sources.length,
  };
}
