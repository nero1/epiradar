import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import OfflineBanner from "@/components/layout/OfflineBanner";
import { getTopAlerts } from "@/lib/data/alerts";

export const metadata: Metadata = {
  title: "Active Alerts",
  description: "Browse active disease outbreak alerts ranked by AI risk score.",
};

export const revalidate = 3600;

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
  return "Low";
}

function countryFlag(iso: string) {
  if (!iso || iso.length !== 2) return "🌍";
  const offset = 127397;
  return String.fromCodePoint(...iso.toUpperCase().split("").map((c) => c.charCodeAt(0) + offset));
}

export default async function AlertsPage() {
  const hasCredentials =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co";
  const alerts = hasCredentials ? await getTopAlerts(10, true) : [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <OfflineBanner />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Active Alerts
          </h1>
          <Link
            href="/login"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--brand-green)" }}
          >
            Sign in for full history
          </Link>
        </div>

        {alerts.length === 0 ? (
          <div
            className="rounded-xl border p-12 text-center"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
          >
            <p style={{ color: "var(--text-muted)" }}>
              No active alerts yet. Check back after the first data ingestion run.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => {
              const score = Number(alert.risk_score);
              const primaryIso = (alert.country_iso as string[])?.[0] ?? "";
              return (
                <Link
                  key={alert.id}
                  href={`/alerts/${alert.id}` as Route}
                  className="block rounded-xl border p-4 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-lg">{countryFlag(primaryIso)}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${riskBadgeClass(score)}`}>
                      {riskLabel(score)}
                    </span>
                    {alert.pathogen && (
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {alert.pathogen as string}
                      </span>
                    )}
                    <span className="ml-auto text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      {Math.round(score)}/100
                    </span>
                  </div>
                  {alert.ai_summary && (
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {(alert.ai_summary as string).slice(0, 200)}
                      {(alert.ai_summary as string).length > 200 ? "…" : ""}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{alert.source as string}</span>
                    <span>·</span>
                    <span>
                      {alert.published_at
                        ? new Date(alert.published_at as string).toLocaleDateString()
                        : "—"}
                    </span>
                    {(alert.country_iso as string[]).length > 1 && (
                      <>
                        <span>·</span>
                        <span>{(alert.country_iso as string[]).length} countries</span>
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div
          className="mt-8 rounded-xl border p-6 text-center"
          style={{ borderColor: "var(--brand-green)", backgroundColor: "var(--bg-card)" }}
        >
          <p className="mb-4 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Showing top 10 public alerts. Sign up free for 30-day history and country watchlists.
          </p>
          <Link
            href="/login"
            className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--brand-green)" }}
          >
            Create Free Account
          </Link>
        </div>
      </main>

      <BottomToolbar />
    </div>
  );
}
