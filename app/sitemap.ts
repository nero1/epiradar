import type { MetadataRoute } from "next";
import { getCountryRiskScores, getTopAlerts, getTopPathogens } from "@/lib/data/alerts";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://epiradar.io";

/** Auto-generated sitemap — includes country and alert pages. Revalidated daily. */
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "hourly", priority: 1 },
    { url: `${BASE_URL}/alerts`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/map`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/login`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.5 },
  ];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return staticPages;
  }

  const [scores, alerts, pathogens] = await Promise.allSettled([
    getCountryRiskScores(),
    getTopAlerts(50),
    getTopPathogens(30),
  ]);

  const countryPages: MetadataRoute.Sitemap =
    scores.status === "fulfilled"
      ? scores.value.map((s) => ({
          url: `${BASE_URL}/countries/${s.countryIso.toLowerCase()}`,
          lastModified: new Date(),
          changeFrequency: "daily" as const,
          priority: 0.7,
        }))
      : [];

  const alertPages: MetadataRoute.Sitemap =
    alerts.status === "fulfilled"
      ? alerts.value.map((a) => ({
          url: `${BASE_URL}/alerts/${a.id}`,
          lastModified: new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.6,
        }))
      : [];

  const pathogenPages: MetadataRoute.Sitemap =
    pathogens.status === "fulfilled"
      ? pathogens.value.map((p) => ({
          url: `${BASE_URL}/pathogens/${encodeURIComponent(p.pathogen)}`,
          lastModified: new Date(),
          changeFrequency: "daily" as const,
          priority: 0.75,
        }))
      : [];

  return [...staticPages, ...countryPages, ...alertPages, ...pathogenPages];
}
