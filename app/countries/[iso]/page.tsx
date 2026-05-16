import type { Metadata } from "next";
import type { Route } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import OfflineBanner from "@/components/layout/OfflineBanner";
import DeepReportClient from "@/components/dashboard/DeepReportClient";
import { getCountrySummary, getCountryRiskScores } from "@/lib/data/alerts";
import { getAuthenticatedUser } from "@/lib/auth/session";

interface Props {
  params: Promise<{ iso: string }>;
}

/** ISR: revalidate country pages every hour */
export const revalidate = 3600;

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", NG: "Nigeria", CD: "DR Congo",
  IN: "India", CN: "China", BR: "Brazil", ZA: "South Africa", GH: "Ghana",
  KE: "Kenya", ET: "Ethiopia", EG: "Egypt", PK: "Pakistan", BD: "Bangladesh",
  PH: "Philippines", VN: "Vietnam", TH: "Thailand", ID: "Indonesia",
  MX: "Mexico", FR: "France", DE: "Germany", IT: "Italy", ES: "Spain",
};

function getCountryName(iso: string): string {
  return COUNTRY_NAMES[iso.toUpperCase()] ?? iso.toUpperCase();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { iso } = await params;
  const name = getCountryName(iso.toUpperCase());
  return {
    title: `${name} — Disease Outbreak Risk`,
    description: `View active disease outbreak alerts and AI risk scores for ${name}.`,
  };
}

/** Pre-generate country pages for tracked countries at build time — skips if credentials are absent */
export async function generateStaticParams() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const scores = await getCountryRiskScores();
    return scores.map((s) => ({ iso: s.countryIso.toLowerCase() }));
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
  if (score > 0)  return "Low";
  return "No data";
}

function countryFlag(iso: string) {
  if (!iso || iso.length !== 2) return "🌍";
  const offset = 127397;
  return String.fromCodePoint(...iso.toUpperCase().split("").map((c) => c.charCodeAt(0) + offset));
}

export default async function CountryPage({ params }: Props) {
  const { iso } = await params;
  const isoUpper = iso.toUpperCase();

  if (!/^[A-Z]{2}$/.test(isoUpper)) notFound();

  const [summary, user] = await Promise.all([getCountrySummary(isoUpper), getAuthenticatedUser()]);
  if (!summary) notFound();
  const isPaid = user?.plan === "paid";

  const countryName = getCountryName(isoUpper);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <OfflineBanner />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm" aria-label="Breadcrumb">
          <Link href="/" className="hover:opacity-80" style={{ color: "var(--text-muted)" }}>Home</Link>
          <span className="mx-2" style={{ color: "var(--text-muted)" }}>›</span>
          <span style={{ color: "var(--text-secondary)" }}>{countryName}</span>
        </nav>

        {/* Country header */}
        <div
          className="mb-6 rounded-xl border p-6"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
        >
          <div className="flex items-start gap-4">
            <span className="text-5xl leading-none">{countryFlag(isoUpper)}</span>
            <div className="flex-1">
              <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {countryName}
              </h1>
              <div className="mt-2 flex items-center gap-3">
                <span className={`rounded px-2.5 py-1 text-sm font-semibold ${riskBadgeClass(summary.riskScore)}`}>
                  {riskLabel(summary.riskScore)}
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                  Risk score: {Math.round(summary.riskScore)}/100
                </span>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {summary.activeAlerts.length} active alert{summary.activeAlerts.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Active alerts */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Active Alerts
        </h2>
        {summary.activeAlerts.length === 0 ? (
          <div
            className="rounded-xl border p-8 text-center"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
          >
            <p style={{ color: "var(--text-muted)" }}>No active alerts for this country.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {summary.activeAlerts.map((alert) => (
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
                  {alert.pathogen && (
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {alert.pathogen as string}
                    </span>
                  )}
                  <span className="ml-auto text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                    {Math.round(Number(alert.risk_score))}/100
                  </span>
                </div>
                {alert.ai_summary && (
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {(alert.ai_summary as string).slice(0, 160)}
                    {(alert.ai_summary as string).length > 160 ? "…" : ""}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* Deep report: generate for paid users, upgrade CTA for others */}
        <div className="mt-8">
          {isPaid ? (
            <DeepReportClient countryIso={isoUpper} />
          ) : (
            <div
              className="rounded-xl border-2 p-6 text-center"
              style={{ borderColor: "var(--brand-green)", backgroundColor: "var(--bg-card)" }}
            >
              <h2 className="mb-2 font-bold" style={{ color: "var(--text-primary)" }}>
                Get the full {countryName} situation report
              </h2>
              <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                Paid plan: AI-generated deep reports with background, transmission risk analysis, and recommended actions.
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
