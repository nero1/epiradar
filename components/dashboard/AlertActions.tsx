"use client";

import { useState, useEffect, useRef } from "react";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

interface Props {
  alertId: string;
  alertTitle: string;
  userPlan: "public" | "free" | "paid" | null;
}

/**
 * Share button and PDF export CTA for alert detail pages.
 * Share uses Web Share API with clipboard fallback.
 * Export enforces tier — free users see quota, paid users export freely.
 * Offline-aware: queues the export and retries automatically when back online.
 */
export default function AlertActions({ alertId, alertTitle, userPlan }: Props) {
  const [shareMsg, setShareMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [queued, setQueued] = useState(false);
  const isOnline = useOnlineStatus();
  const queuedRef = useRef(false);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const alertUrl = `${appUrl}/alerts/${alertId}`;
  const shareText = `Outbreak alert on EpiRadar: ${alertTitle}`;

  // Auto-retry the export when connection is restored
  useEffect(() => {
    if (isOnline && queuedRef.current) {
      queuedRef.current = false;
      setQueued(false);
      setExportMsg("Back online — retrying export…");
      doExport();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareText, url: alertUrl });
      } catch {
        // User cancelled — no-op
      }
    } else {
      await navigator.clipboard.writeText(alertUrl).catch(() => {});
      setShareMsg("Link copied!");
      setTimeout(() => setShareMsg(""), 2500);
    }
  }

  async function doExport() {
    setExporting(true);
    setExportMsg("");
    try {
      const res = await fetch("/api/v1/exports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertId,
          idempotencyKey: `pdf-${alertId}-${Date.now()}`,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setExportMsg(body.error ?? "Export failed. Please try again.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `epiradar-alert-${alertId}.html`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg("PDF downloaded.");
    } catch {
      setExportMsg("Export failed. Check your connection.");
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(""), 4000);
    }
  }

  async function handleExportPdf() {
    if (!userPlan || userPlan === "public") {
      window.location.href = "/login";
      return;
    }

    if (!isOnline) {
      queuedRef.current = true;
      setQueued(true);
      setExportMsg("Queued — will retry when online.");
      return;
    }

    await doExport();
  }

  const btnBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    transition: "opacity 0.15s",
  };

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <button
        onClick={handleShare}
        style={{
          ...btnBase,
          background: "transparent",
          border: "1px solid var(--border-default)",
          color: "var(--text-secondary)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        {shareMsg || "Share"}
      </button>

      {userPlan === null || userPlan === "public" ? (
        <a
          href="/login"
          style={{
            ...btnBase,
            background: "var(--brand-green)",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          Sign in to export PDF
        </a>
      ) : (
        <button
          onClick={handleExportPdf}
          disabled={exporting}
          style={{
            ...btnBase,
            background: queued ? "#D97706" : "var(--brand-green)",
            color: "#fff",
            opacity: exporting ? 0.7 : 1,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {exporting ? "Exporting…" : queued ? "Queued…" : "Export PDF"}
        </button>
      )}

      {exportMsg && (
        <span
          style={{
            fontSize: 12,
            color: exportMsg.includes("Queued") || exportMsg.includes("retry")
              ? "#D97706"
              : exportMsg.includes("fail") || exportMsg.includes("failed")
              ? "#DC2626"
              : "#16A34A",
          }}
        >
          {exportMsg}
        </span>
      )}
    </div>
  );
}
