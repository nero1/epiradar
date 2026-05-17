import type { Metadata } from "next";
import type { Route } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import OfflineBanner from "@/components/layout/OfflineBanner";
import DeepReportClient from "@/components/dashboard/DeepReportClient";
import { getTopPathogens } from "@/lib/data/alerts";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import type { Alert } from "@/lib/supabase/types";

interface Props {
  params: Promise<{ name: string }>;
}

/** ISR: revalidate pathogen pages every hour */
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const displayName = decodeURIComponent(name);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://epiradar.io";
  return {
    title: `${displayName} Outbreak Alerts | EpiRadar`,
    description: `AI-powered disease outbreak risk scores and active alerts for ${displayName}. Updated daily.`,
    openGraph: {
      title: `${displayName} Outbreak Risk — EpiRadar`,
      description: `Active alerts, AI risk scores, and situation reports for ${displayName}.`,
      url: `${appUrl}/pathogens/${name}`,
      siteName: "EpiRadar",
      type: "website",
    },
  };
}

/** Pre-generate pages for top pathogens at build time */
export async function generateStaticParams() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const pathogens = await getTopPathogens(30);
    return pathogens.map((p) => ({ name: encodeURIComponent(p.pathogen) }));
  } catch {
    return [];
  }
}

function riskBadgeClass(score: number) {
  if (score >= 75) return "risk-badge-critical";
  if (score >= 50) return "risk-badge-high";
  if (score >= 25) return "risk-badge-moderate";
  return "risk-badge-low";
}

function riskLabel(score: number) {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Moderate";
  if (score > 0) return "Low";
  return "No data";
}

function countryFlag(iso: string) {
  if (!iso || iso.length !== 2) return "🌍";
  const offset = 127397;
  return String.fromCodePoint(...iso.toUpperCase().split("").map((c) => c.charCodeAt(0) + offset));
}

export default async function PathogenPage({ params }: Props) {
  const { name } = await params;
  const displayName = decodeURIComponent(name);

  if (!displayName || displayName.length > 100) notFound();

  const [user] = await Promise.all([getAuthenticatedUser()]);
  const isPaid = user?.plan === "paid";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://epiradar.io";

  // Fetch active alerts for this pathogen
  const supabase = createAdminClient();
  const { data: alerts, error } = await supabase
    .from("alerts")
    .select("id, pathogen, country_iso, risk_score, ai_summary, published_at, source")
    .ilike("pathogen", displayName)
    .eq("is_active", true)
    .order("risk_score", { ascending: false })
    .limit(20);

  if (error || !alerts || alerts.length === 0) notFound();

  const maxRisk = Math.max(...alerts.map((a) => Number(a.risk_score)));
  const affectedCountries = [...new Set(alerts.flatMap((a) => (a.country_iso as string[]) ?? []))];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${displayName} Outbreak Risk`,
    description: `Active alerts, AI risk scores, and situation reports for ${displayName}.`,
    url: `${appUrl}/pathogens/${name}`,
    publisher: { "@type": "Organization", name: "EpiRadar", url: appUrl },
    about: { "@type": "MedicalCondition", name: displayName },
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Header />
      <OfflineBanner />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm" aria-label="Breadcrumb">
          <Link href="/" className="hover:opacity-80" style={{ color: "var(--text-muted)" }}>Home</Link>
          <span className="mx-2" style={{ color: "var(--text-muted)" }}>›</span>
          <span style={{ color: "var(--text-secondary)" }}>{displayName}</span>
        </nav>

        {/* Pathogen header */}
        <div
          className="mb-6 rounded-xl border p-6"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {displayName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className={`rounded px-2.5 py-1 text-sm font-semibold ${riskBadgeClass(maxRisk)}`}>
                  {riskLabel(maxRisk)}
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                  Peak risk: {Math.round(maxRisk)}/100
                </span>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {alerts.length} active alert{alerts.length !== 1 ? "s" : ""} · {affectedCountries.length} countr{affectedCountries.length !== 1 ? "ies" : "y"} affected
              </p>
            </div>
          </div>

          {/* Affected countries */}
          {affectedCountries.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {affectedCountries.slice(0, 12).map((iso) => (
                <Link
                  key={iso}
                  href={`/countries/${iso.toLowerCase()}` as Route}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:opacity-80"
                  style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                >
                  <span>{countryFlag(iso)}</span>
                  <span>{iso}</span>
                </Link>
              ))}
              {affectedCountries.length > 12 && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>+{affectedCountries.length - 12} more</span>
              )}
            </div>
          )}
        </div>

        {/* Active alerts */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Active Alerts
        </h2>
        <div className="space-y-3">
          {(alerts as Partial<Alert>[]).map((alert) => (
            <Link
              key={alert.id}
              href={`/alerts/${alert.id}` as Route}
              className="block rounded-xl border p-4 transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${riskBadgeClass(Number(alert.risk_score))}`}>
                  {riskLabel(Number(alert.risk_score))}
                </span>
                <span className="flex gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {(alert.country_iso ?? []).slice(0, 5).map((iso: string) => (
                    <span key={iso}>{countryFlag(iso)}</span>
                  ))}
                </span>
                <span className="ml-auto text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                  {Math.round(Number(alert.risk_score))}/100
                </span>
              </div>
              {alert.ai_summary && (
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {(alert.ai_summary as string).slice(0, 180)}
                  {(alert.ai_summary as string).length > 180 ? "…" : ""}
                </p>
              )}
            </Link>
          ))}
        </div>

        {/* Deep report — paid gate */}
        <div className="mt-8">
          {isPaid ? (
            <DeepReportClient pathogen={displayName} />
          ) : (
            <div
              className="rounded-xl border-2 p-6 text-center"
              style={{ borderColor: "var(--brand-green)", backgroundColor: "var(--bg-card)" }}
            >
              <h2 className="mb-2 font-bold" style={{ color: "var(--text-primary)" }}>
                Get the full {displayName} situation report
              </h2>
              <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                Paid plan: AI-generated deep reports with background, transmission risk, and recommended actions.
              </p>
              <Link
                href="/pricing"
                className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--brand-green)" }}
              >
                Upgrade to Paid →
              </Link>
            </div>
          )}
        </div>
      </main>

      <BottomToolbar />
    </div>
  );
}
