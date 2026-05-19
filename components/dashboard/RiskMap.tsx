"use client";

import { useEffect, useRef, useState } from "react";
import type { CountryRiskScore } from "@/lib/data/alerts";

interface RiskMapProps {
  initialScores?: CountryRiskScore[];
}

/** Map color based on risk score */
function riskColor(score: number): string {
  if (score >= 75) return "#DC2626"; // critical red
  if (score >= 50) return "#EA580C"; // high orange
  if (score >= 25) return "#D97706"; // moderate amber
  if (score > 0)  return "#16A34A"; // low green
  return "#D1D5DB"; // no data gray
}

function riskLabel(score: number): string {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Moderate";
  if (score > 0)  return "Low";
  return "No data";
}

/**
 * Interactive world risk map using Leaflet.
 * Color-codes countries by outbreak risk score.
 * Loaded client-side only (Leaflet requires browser DOM).
 */
export default function RiskMap({ initialScores = [] }: RiskMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  const [scores, setScores] = useState<CountryRiskScore[]>(initialScores);
  const [isLoading, setIsLoading] = useState(initialScores.length === 0);
  const [tooltip] = useState<{ country: string; score: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (initialScores.length === 0) {
      fetch("/api/v1/risk-scores")
        .then((r) => r.json())
        .then((d) => setScores(d.data ?? []))
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [initialScores.length]);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    // Dynamically import Leaflet to avoid SSR issues
    import("leaflet").then((L) => {
      // Fix Leaflet default icon path in Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false,
      });

      // Light basemap tile layer (no labels, clean for data overlay)
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      leafletMapRef.current = map;
    }).catch(console.error);

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      {/* Leaflet map container */}
      <div
        ref={mapRef}
        className="h-full w-full"
        aria-label="Global outbreak risk map"
        role="img"
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "var(--bg-card)" }}>
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "var(--brand-green)", borderTopColor: "transparent" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading risk data…</p>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-md px-3 py-2 text-sm shadow-lg"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y - 40,
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        >
          <div className="font-semibold">{tooltip.country}</div>
          <div style={{ color: riskColor(tooltip.score) }}>
            {riskLabel(tooltip.score)} — {Math.round(tooltip.score)}
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        className="absolute bottom-4 left-4 z-20 rounded-lg p-3 text-xs shadow"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-default)" }}
      >
        <div className="mb-1 font-semibold" style={{ color: "var(--text-secondary)" }}>Risk Level</div>
        {[
          { label: "Critical", color: "#DC2626" },
          { label: "High", color: "#EA580C" },
          { label: "Moderate", color: "#D97706" },
          { label: "Low", color: "#16A34A" },
          { label: "No data", color: "#D1D5DB" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2 py-0.5">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
            <span style={{ color: "var(--text-secondary)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Country count badge */}
      {scores.length > 0 && (
        <div
          className="absolute right-4 top-4 z-20 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: "var(--brand-green)", color: "#fff" }}
        >
          {scores.length} countries tracked
        </div>
      )}

      {/* Score info — accessible summary for screen readers */}
      <div className="sr-only">
        {scores.map((s) => (
          <span key={s.countryIso}>
            {s.countryIso}: {riskLabel(s.riskScore)} risk ({Math.round(s.riskScore)}/100).{" "}
          </span>
        ))}
      </div>
    </div>
  );
}

export { riskColor, riskLabel, type CountryRiskScore };
