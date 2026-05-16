"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

interface TickerAlert {
  id: string;
  country_iso: string[];
  pathogen: string | null;
  risk_score: number;
  ai_summary: string | null;
  published_at: string;
  _teaser?: boolean;
}

interface AlertTickerProps {
  initialAlerts?: TickerAlert[];
  showTeaserCta?: boolean;
}

/** Risk badge label and color */
function getRiskBadge(score: number): { label: string; className: string } {
  if (score >= 75) return { label: "Critical", className: "risk-badge-critical" };
  if (score >= 50) return { label: "High", className: "risk-badge-high" };
  if (score >= 25) return { label: "Moderate", className: "risk-badge-moderate" };
  return { label: "Low", className: "risk-badge-low" };
}

/** Country flag emoji from ISO code */
function countryFlag(iso: string): string {
  if (!iso || iso.length !== 2) return "🌍";
  const offset = 127397; // Unicode flag offset
  return String.fromCodePoint(...iso.toUpperCase().split("").map((c) => c.charCodeAt(0) + offset));
}

/** Format relative time */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "Just now";
}

/**
 * Scrollable alert list showing the top active alerts.
 * Public users see truncated summaries with a "create account" CTA gate.
 */
export default function AlertTicker({ initialAlerts = [], showTeaserCta = true }: AlertTickerProps) {
  const [alerts, setAlerts] = useState<TickerAlert[]>(initialAlerts);
  const [isLoading, setIsLoading] = useState(initialAlerts.length === 0);

  useEffect(() => {
    if (initialAlerts.length === 0) {
      fetch("/api/v1/alerts?limit=10")
        .then((r) => r.json())
        .then((d) => setAlerts(d.data ?? []))
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [initialAlerts.length]);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-md p-3" style={{ backgroundColor: "var(--bg-page)" }}>
            <div className="mb-2 h-3 w-28 rounded" style={{ backgroundColor: "var(--border-default)" }} />
            <div className="h-2 w-full rounded" style={{ backgroundColor: "var(--border-default)" }} />
            <div className="mt-1 h-2 w-3/4 rounded" style={{ backgroundColor: "var(--border-default)" }} />
          </div>
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center p-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No active alerts</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "480px" }}>
        {alerts.map((alert, idx) => {
          const badge = getRiskBadge(Number(alert.risk_score));
          const primaryIso = alert.country_iso?.[0] ?? "";
          const isTeaser = alert._teaser;

          return (
            <div key={alert.id}>
              <Link
                href={`/alerts/${alert.id}` as Route}
                className="block rounded-lg p-3 transition-colors hover:opacity-90"
                style={{ backgroundColor: "var(--bg-page)" }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-base leading-none" aria-hidden="true">
                    {countryFlag(primaryIso)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  {alert.pathogen && (
                    <span className="truncate text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      {alert.pathogen}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                    {relativeTime(alert.published_at)}
                  </span>
                </div>
                {alert.ai_summary && (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {alert.ai_summary}
                    {isTeaser && (
                      <span className="font-medium" style={{ color: "var(--brand-green)" }}>
                        {" "}Read more →
                      </span>
                    )}
                  </p>
                )}
                <div className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  Risk: <span className="font-semibold">{Math.round(Number(alert.risk_score))}/100</span>
                  {alert.country_iso.length > 1 && (
                    <span> · {alert.country_iso.length} countries</span>
                  )}
                </div>
              </Link>

              {/* Teaser paywall after 3rd alert for public users */}
              {showTeaserCta && isTeaser && idx === 2 && (
                <div
                  className="my-2 rounded-lg border p-4 text-center"
                  style={{ borderColor: "var(--brand-green)", backgroundColor: "var(--bg-card)" }}
                >
                  <p className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Sign up free to see all {alerts.length} active alerts with full AI summaries
                  </p>
                  <Link
                    href="/login"
                    className="inline-block rounded-md px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "var(--brand-green)" }}
                  >
                    Create Free Account
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom CTA for public users */}
      {showTeaserCta && (
        <Link
          href="/login"
          className="mx-4 mt-4 block rounded-md py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--brand-green)" }}
        >
          See all alerts — free account
        </Link>
      )}
    </div>
  );
}
