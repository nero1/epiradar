import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import OfflineBanner from "@/components/layout/OfflineBanner";
import AlertTicker from "@/components/dashboard/AlertTicker";
import RiskTrendChart from "@/components/dashboard/RiskTrendChart";
import RiskMapClient from "@/components/dashboard/RiskMapClient";
import { getTopAlerts, getCountryRiskScores, getGlobalRiskTrend } from "@/lib/data/alerts";
import ThemeProvider from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "EpiRadar — Infectious Disease Early Warning Dashboard",
  description:
    "Track infectious disease outbreaks worldwide. AI-powered risk scores, real-time alerts, and country-level surveillance data.",
  openGraph: {
    type: "website",
    title: "EpiRadar — Infectious Disease Early Warning",
    description: "AI-powered outbreak surveillance. WHO, ProMED, ReliefWeb and more — scored and summarised daily.",
  },
};

/** ISR: revalidate every hour */
export const revalidate = 3600;

export default async function HomePage() {
  // Fetch initial data server-side for fast first paint
  // Guard: skip DB calls if credentials not configured (CI/build env)
  const hasCredentials =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co";

  const [initialAlerts, initialScores, initialTrend] = hasCredentials
    ? await Promise.allSettled([getTopAlerts(10, true), getCountryRiskScores(), getGlobalRiskTrend()])
    : [
        { status: "fulfilled" as const, value: [] },
        { status: "fulfilled" as const, value: [] },
        { status: "fulfilled" as const, value: [] },
      ];

  const alerts = initialAlerts.status === "fulfilled" ? initialAlerts.value : [];
  const scores = initialScores.status === "fulfilled" ? initialScores.value : [];
  const trend = initialTrend.status === "fulfilled" ? initialTrend.value : [];

  const activeCount = scores.reduce((sum, s) => sum + s.alertCount, 0);
  const criticalCount = scores.filter((s) => s.riskScore >= 75).length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <ThemeProvider />
      <Header />
      <OfflineBanner />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="mb-6">
          <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: "var(--text-primary)" }}>
            Global Outbreak Intelligence
          </h1>
          <p className="text-sm sm:text-base" style={{ color: "var(--text-secondary)" }}>
            AI-powered early warning. Updated daily from WHO, ProMED, ReliefWeb, PubMed, and news sources.
          </p>
          {/* Live stats bar */}
          {activeCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span style={{ color: "var(--text-muted)" }}>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{activeCount}</span> active alerts
              </span>
              {criticalCount > 0 && (
                <span style={{ color: "var(--text-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--brand-critical)" }}>{criticalCount}</span> critical-risk countries
                </span>
              )}
              <span style={{ color: "var(--text-muted)" }}>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{scores.length}</span> countries tracked
              </span>
            </div>
          )}
        </section>

        {/* Main dashboard grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Risk map — 2/3 width on large screens */}
          <div
            className="rounded-xl border lg:col-span-2"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-default)",
              minHeight: "400px",
            }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-default)" }}>
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Global Risk Map
              </h2>
              <Link
                href="/map"
                className="text-xs font-medium hover:opacity-80"
                style={{ color: "var(--brand-green)" }}
              >
                Full map →
              </Link>
            </div>
            <div style={{ height: "360px" }}>
              <RiskMapClient initialScores={scores} />
            </div>
          </div>

          {/* Alert ticker — 1/3 width */}
          <div
            className="rounded-xl border"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-default)" }}>
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Top Alerts
              </h2>
              <Link
                href="/alerts"
                className="text-xs font-medium hover:opacity-80"
                style={{ color: "var(--brand-green)" }}
              >
                View all →
              </Link>
            </div>
            {/* @ts-expect-error — initialAlerts typed correctly at runtime */}
            <AlertTicker initialAlerts={alerts} showTeaserCta />
          </div>
        </div>

        {/* Trend chart */}
        <div
          className="mt-6 rounded-xl border p-4"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Global Risk Trend — Last 7 Days
            </h2>
          </div>
          <RiskTrendChart initialData={trend} />
        </div>

        {/* CTA strip */}
        <section
          className="mt-10 rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--brand-green)", backgroundColor: "var(--bg-card)" }}
        >
          <h2 className="mb-2 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Get full access — free forever
          </h2>
          <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
            Sign up with Google to unlock 30-day alert history, country watchlists, and PDF exports.
            No credit card required.
          </p>
          <Link
            href="/login"
            className="inline-block rounded-lg px-8 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--brand-green)" }}
          >
            Create Free Account
          </Link>
        </section>
      </main>

      <BottomToolbar />
    </div>
  );
}
