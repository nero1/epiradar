"use client";

import { useState, useTransition } from "react";
import type { Plan } from "@/lib/supabase/types";

interface Props {
  currentPlan: Plan | "public";
  isAuthenticated: boolean;
}

// Detect if user is likely in Nigeria based on browser timezone heuristic
function isNigeriaLikely(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === "Africa/Lagos";
  } catch {
    return false;
  }
}

const FREE_FEATURES = [
  "Full global risk map",
  "30-day alert history",
  "AI-powered summaries",
  "Up to 3 country watchlists",
  "Daily email digest",
  "3 PDF exports/month",
];

const PAID_FEATURES = [
  "Everything in Free",
  "Full alert archive (unlimited history)",
  "Unlimited watchlists",
  "Deep AI situation reports",
  "Unlimited PDF & CSV exports",
  "API access (1,000 req/day)",
  "Priority support",
];

const PUBLIC_FEATURES = [
  "Global risk map (live)",
  "Top 10 active alerts",
  "AI summary teasers",
  "No sign-up required",
];

export default function PricingClient({ currentPlan, isAuthenticated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const nigeria = isNigeriaLikely();

  async function handleUpgrade() {
    if (!isAuthenticated) {
      window.location.href = "/login?next=/pricing";
      return;
    }
    setError("");
    startTransition(async () => {
      const provider = nigeria ? "paystack" : "dodopayments";
      const res = await fetch("/api/v1/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
      } else {
        setError(body.error ?? "Failed to initiate checkout. Please try again.");
      }
    });
  }

  const cardBase: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 28,
    display: "flex",
    flexDirection: "column",
  };

  const featList = (features: string[], included = true) =>
    features.map((f) => (
      <li key={f} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, color: included ? "var(--text-primary)" : "var(--text-secondary)", marginBottom: 8 }}>
        <span style={{ color: included ? "#16A34A" : "#9CA3AF", flexShrink: 0, marginTop: 1 }}>
          {included ? "✓" : "✗"}
        </span>
        {f}
      </li>
    ));

  return (
    <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>

      {/* Public */}
      <div style={cardBase}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Public</h2>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            Free <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-secondary)" }}>forever</span>
          </p>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 auto" }}>{featList(PUBLIC_FEATURES)}</ul>
        <div style={{ marginTop: 24 }}>
          <span style={{
            display: "block",
            textAlign: "center",
            padding: "10px 0",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--text-secondary)",
          }}>
            No sign-up needed
          </span>
        </div>
      </div>

      {/* Free */}
      <div style={cardBase}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Free</h2>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            $0 <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-secondary)" }}>/mo</span>
          </p>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 auto" }}>{featList(FREE_FEATURES)}</ul>
        <div style={{ marginTop: 24 }}>
          {!isAuthenticated ? (
            <a
              href="/login"
              style={{
                display: "block",
                textAlign: "center",
                padding: "10px 0",
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                textDecoration: "none",
              }}
            >
              Sign up free
            </a>
          ) : currentPlan === "free" ? (
            <span style={{ display: "block", textAlign: "center", padding: "10px 0", fontSize: 13, color: "#16A34A", fontWeight: 600 }}>
              ✓ Current plan
            </span>
          ) : (
            <span style={{ display: "block", textAlign: "center", padding: "10px 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Included in all plans
            </span>
          )}
        </div>
      </div>

      {/* Paid */}
      <div style={{ ...cardBase, border: "2px solid var(--color-brand)", position: "relative" }}>
        <div style={{
          position: "absolute",
          top: -12,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--color-brand)",
          color: "#fff",
          padding: "2px 14px",
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
        }}>
          MOST POPULAR
        </div>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Paid</h2>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {nigeria ? "₦15,000" : "$29"}{" "}
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-secondary)" }}>/mo</span>
          </p>
          {nigeria && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-secondary)" }}>
              Billed via Paystack (NGN)
            </p>
          )}
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 auto" }}>{featList(PAID_FEATURES)}</ul>
        {error && <p style={{ fontSize: 13, color: "#DC2626", marginTop: 12 }}>{error}</p>}
        <div style={{ marginTop: 24 }}>
          {currentPlan === "paid" ? (
            <span style={{ display: "block", textAlign: "center", padding: "10px 0", fontSize: 13, color: "#16A34A", fontWeight: 600 }}>
              ✓ Current plan
            </span>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={isPending}
              style={{
                display: "block",
                width: "100%",
                padding: "11px 0",
                background: "var(--color-brand)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 700,
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? "Redirecting…" : isAuthenticated ? `Upgrade now →` : "Sign up and upgrade"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
