"use client";

import { useState, useEffect, useRef } from "react";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

interface Props {
  countryIso?: string;
  pathogen?: string;
}

/**
 * On-demand deep AI report generator for paid users.
 * Calls POST /api/v1/reports and renders the markdown response.
 * Offline-aware: queues the request and retries automatically when back online.
 */
export default function DeepReportClient({ countryIso, pathogen }: Props) {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const isOnline = useOnlineStatus();
  const queuedRef = useRef(false);

  // Auto-retry when connection is restored
  useEffect(() => {
    if (isOnline && queuedRef.current) {
      queuedRef.current = false;
      setQueued(false);
      doGenerate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  async function doGenerate() {
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

  async function generateReport() {
    if (!isOnline) {
      queuedRef.current = true;
      setQueued(true);
      setError(null);
      return;
    }
    await doGenerate();
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

      {/* Offline queued state */}
      {queued && (
        <div style={{
          background: "#FFFBEB",
          border: "1px solid #FCD34D",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 12,
          fontSize: 13,
          color: "#92400E",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Queued — report will generate automatically when back online.
        </div>
      )}

      {!report && !loading && !queued && (
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
