"use client";

import { useState } from "react";

interface Props {
  countryIso?: string;
  pathogen?: string;
}

/**
 * On-demand deep AI report generator for paid users.
 * Calls POST /api/v1/reports and streams the markdown response.
 */
export default function DeepReportClient({ countryIso, pathogen }: Props) {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateReport() {
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/v1/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryIso, pathogen }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to generate report. Please try again.");
        return;
      }

      const data = await res.json();
      setReport(data.report ?? "No report content returned.");
    } catch {
      setError("Connection error. Please check your network and try again.");
    } finally {
      setLoading(false);
    }
  }

  const card: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "2px solid var(--brand-green)",
    borderRadius: 12,
    padding: 24,
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
            AI Situation Report
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {countryIso && pathogen
              ? `${pathogen} in ${countryIso}`
              : countryIso
              ? `Country focus: ${countryIso}`
              : pathogen
              ? `Pathogen focus: ${pathogen}`
              : "General outbreak report"}
          </p>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            background: "var(--brand-green)",
            color: "#fff",
            padding: "3px 8px",
            borderRadius: 4,
          }}
        >
          PAID
        </span>
      </div>

      {!report && !loading && (
        <button
          onClick={generateReport}
          style={{
            background: "var(--brand-green)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            width: "100%",
          }}
        >
          Generate Deep Report
        </button>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div
            style={{
              display: "inline-block",
              width: 28,
              height: 28,
              border: "3px solid var(--border-default)",
              borderTopColor: "var(--brand-green)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
            Generating report — this may take 15–30 seconds…
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <p style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{error}</p>
      )}

      {report && (
        <div style={{ marginTop: 16 }}>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "system-ui, sans-serif",
              fontSize: 14,
              lineHeight: 1.7,
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            {report}
          </pre>
          <button
            onClick={generateReport}
            style={{
              marginTop: 16,
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 12,
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
