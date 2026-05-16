import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import OfflineBanner from "@/components/layout/OfflineBanner";
import AlertActions from "@/components/dashboard/AlertActions";
import DeepReportClient from "@/components/dashboard/DeepReportClient";
import { getAlertById, getTopAlerts } from "@/lib/data/alerts";
import { getAuthenticatedUser } from "@/lib/auth/session";

interface Props {
  params: Promise<{ id: string }>;
}

/** ISR: revalidate every 5 minutes for alert detail pages */
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const alert = await getAlertById(id);
  if (!alert) return { title: "Alert Not Found" };

  return {
    title: `${alert.pathogen ?? "Outbreak Alert"} — ${alert.country_iso.join(", ")}`,
    description: alert.ai_summary ?? `Risk score: ${alert.risk_score}/100`,
    openGraph: {
      title: `EpiRadar Alert: ${alert.pathogen ?? "Outbreak"} in ${alert.country_iso.join(", ")}`,
      description: alert.ai_summary ?? undefined,
    },
  };
}

/** Pre-generate the top 20 alert pages at build time — skips if credentials are absent */
export async function generateStaticParams() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const alerts = await getTopAlerts(20);
    return alerts.map((a) => ({ id: String(a.id) }));
  } catch {
    return [];
  }
}

function riskColor(score: number) {
  if (score >= 75) return "var(--brand-critical)";
  if (score >= 50) return "#EA580C";
  if (score >= 25) return "var(--brand-amber)";
  return "var(--risk-low)";
}

function riskLabel(score: number) {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Moderate";
  return "Low";
}

function countryFlag(iso: string) {
  if (!iso || iso.length !== 2) return "🌍";
  const offset = 127397;
  return String.fromCodePoint(...iso.toUpperCase().split("").map((c) => c.charCodeAt(0) + offset));
}

export default async function AlertDetailPage({ params }: Props) {
  const { id } = await params;
  const [alert, user] = await Promise.all([getAlertById(id), getAuthenticatedUser()]);

  if (!alert) notFound();

  const riskScore = Number(alert.risk_score);
  const userPlan = (user?.plan ?? null) as "public" | "free" | "paid" | null;
  const alertTitle = `${alert.pathogen ?? "Outbreak"} in ${alert.country_iso.join(", ")}`;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <OfflineBanner />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm" aria-label="Breadcrumb">
          <Link href="/" className="hover:opacity-80" style={{ color: "var(--text-muted)" }}>Home</Link>
          <span className="mx-2" style={{ color: "var(--text-muted)" }}>›</span>
          <Link href="/alerts" className="hover:opacity-80" style={{ color: "var(--text-muted)" }}>Alerts</Link>
          <span className="mx-2" style={{ color: "var(--text-muted)" }}>›</span>
          <span style={{ color: "var(--text-secondary)" }}>{alert.pathogen ?? "Alert"}</span>
        </nav>

        {/* Header card */}
        <div
          className="mb-6 rounded-xl border p-6"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-sm font-bold text-white"
              style={{ backgroundColor: riskColor(riskScore) }}
            >
              {riskLabel(riskScore)} Risk
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
              {Math.round(riskScore)}/100
            </span>
            <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
              Source: {alert.source}
            </span>
          </div>

          <h1 className="mb-3 text-xl font-bold leading-snug" style={{ color: "var(--text-primary)" }}>
            {alert.pathogen ? `${alert.pathogen} Outbreak` : "Disease Outbreak Alert"}
            {alert.country_iso.length > 0 && (
              <span style={{ color: "var(--text-secondary)" }}>
                {" — "}
                {alert.country_iso.map((iso) => (
                  <span key={iso} title={iso}>
                    {countryFlag(iso)} {iso}{"  "}
                  </span>
                ))}
              </span>
            )}
          </h1>

          {/* AI Summary */}
          {alert.ai_summary ? (
            <p className="mb-4 text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {alert.ai_summary}
            </p>
          ) : (
            <p className="mb-4 text-sm italic" style={{ color: "var(--text-muted)" }}>
              AI summary not yet available.
            </p>
          )}

          {/* Share + PDF export actions */}
          <AlertActions alertId={id} alertTitle={alertTitle} userPlan={userPlan} />
        </div>

        {/* Score breakdown */}
        <div
          className="mb-6 rounded-xl border p-5"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Risk Score Breakdown
          </h2>
          <div className="space-y-3">
            {[
              { label: "Severity", value: Number(alert.severity_score) },
              { label: "Geographic Spread", value: Number(alert.spread_score) },
              { label: "Novelty", value: Number(alert.novelty_score) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {Math.round(value)}/100
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bg-page)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${value}%`, backgroundColor: riskColor(value) }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Epidemiological data */}
        {(alert.case_count != null || alert.death_count != null) && (
          <div
            className="mb-6 rounded-xl border p-5"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
          >
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Epidemiological Data
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {alert.case_count != null && (
                <div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Confirmed Cases</p>
                  <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                    {alert.case_count.toLocaleString()}
                  </p>
                </div>
              )}
              {alert.death_count != null && (
                <div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Deaths</p>
                  <p className="text-2xl font-bold" style={{ color: "var(--brand-critical)" }}>
                    {alert.death_count.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Source link */}
        <div
          className="mb-6 rounded-xl border p-4"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
        >
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Primary Source
          </h2>
          <a
            href={alert.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sm underline hover:opacity-80"
            style={{ color: "var(--brand-green)" }}
          >
            {alert.source_url}
          </a>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Published: {new Date(alert.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Deep report: generate for paid, upgrade CTA for others */}
        {userPlan === "paid" ? (
          <DeepReportClient
            countryIso={alert.country_iso[0]}
            pathogen={alert.pathogen ?? undefined}
          />
        ) : (
          <div
            className="rounded-xl border-2 p-6 text-center"
            style={{ borderColor: "var(--brand-green)", backgroundColor: "var(--bg-card)" }}
          >
            <h2 className="mb-2 text-base font-bold" style={{ color: "var(--text-primary)" }}>
              Get a full AI situation report
            </h2>
            <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
              Paid plan includes deep AI-generated reports: background, current situation, transmission risk, and recommended actions.
            </p>
            <Link
              href="/pricing"
              className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--brand-green)" }}
            >
              Upgrade to Paid →
            </Link>
          </div>
        )}
      </main>

      <BottomToolbar />
    </div>
  );
}
