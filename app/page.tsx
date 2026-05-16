import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import OfflineBanner from "@/components/layout/OfflineBanner";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EpiRadar — Infectious Disease Early Warning Dashboard",
  description:
    "Track infectious disease outbreaks worldwide. AI-powered risk scores, real-time alerts, and country-level surveillance data.",
};

/**
 * Public home page — the primary lead magnet.
 * Renders the dashboard shell; individual data sections are loaded via client components.
 * Revalidated every hour (ISR).
 */
export const revalidate = 3600;

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <OfflineBanner />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Hero section */}
        <section className="mb-8 text-center">
          <h1
            className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: "var(--text-primary)" }}
          >
            Global Outbreak Intelligence
          </h1>
          <p
            className="mx-auto max-w-2xl text-base sm:text-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            AI-powered early warning for infectious disease outbreaks. Updated daily from WHO, ProMED, and global health sources.
          </p>
        </section>

        {/* Dashboard grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Risk Map placeholder */}
          <div
            className="card flex min-h-[320px] items-center justify-center rounded-lg p-6 lg:col-span-2"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)" }}
          >
            <div className="text-center">
              <div
                className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: "#F0FDF4" }}
              >
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="#1A5C4A" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                </svg>
              </div>
              <p style={{ color: "var(--text-muted)" }} className="text-sm">
                Interactive risk map — loading data
              </p>
            </div>
          </div>

          {/* Top Alerts sidebar */}
          <div
            className="card rounded-lg p-4"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)" }}
          >
            <h2
              className="mb-4 text-sm font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Top Alerts
            </h2>

            {/* Alert placeholders */}
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="mb-3 animate-pulse rounded-md p-3"
                style={{ backgroundColor: "var(--bg-page)" }}
              >
                <div
                  className="mb-2 h-3 w-24 rounded"
                  style={{ backgroundColor: "var(--border-default)" }}
                />
                <div
                  className="h-2 w-full rounded"
                  style={{ backgroundColor: "var(--border-default)" }}
                />
                <div
                  className="mt-1 h-2 w-3/4 rounded"
                  style={{ backgroundColor: "var(--border-default)" }}
                />
              </div>
            ))}

            {/* CTA */}
            <Link
              href="/login"
              className="mt-4 block w-full rounded-md py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--brand-green)" }}
            >
              Create free account to see all alerts
            </Link>
          </div>
        </div>

        {/* Trend chart placeholder */}
        <div
          className="card mt-6 rounded-lg p-6"
          style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)" }}
        >
          <h2
            className="mb-4 text-sm font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Global Risk Trend — Last 7 Days
          </h2>
          <div
            className="flex h-32 items-center justify-center rounded-md"
            style={{ backgroundColor: "var(--bg-page)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Risk trend chart — loading data
            </p>
          </div>
        </div>

        {/* CTA strip */}
        <section
          className="mt-10 rounded-xl border p-8 text-center"
          style={{
            borderColor: "var(--brand-green)",
            backgroundColor: "var(--bg-card)",
          }}
        >
          <h2
            className="mb-2 text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Get full access — free forever
          </h2>
          <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
            Sign up with Google to unlock 30-day alert history, country watchlists, and PDF exports.
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
