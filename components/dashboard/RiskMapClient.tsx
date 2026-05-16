"use client";

import dynamic from "next/dynamic";
import type { CountryRiskScore } from "@/lib/data/alerts";

const RiskMap = dynamic(() => import("./RiskMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full items-center justify-center"
      style={{ backgroundColor: "var(--bg-card)" }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-4"
          style={{
            borderColor: "var(--border-default)",
            borderTopColor: "var(--brand-green)",
          }}
        />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading map…
        </p>
      </div>
    </div>
  ),
});

/** Client wrapper for the Leaflet-based risk map (ssr: false requires a Client Component in Next.js 16). */
export default function RiskMapClient({ initialScores }: { initialScores?: CountryRiskScore[] }) {
  return <RiskMap initialScores={initialScores} />;
}
