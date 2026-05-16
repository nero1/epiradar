"use client";

import { useState, useEffect, useTransition } from "react";

type Tab = "overview" | "users" | "revenue" | "themes" | "audit";

interface SourceHealth {
  source: string;
  errorCount: number;
  lastSuccess: string | null;
  status: "ok" | "degraded";
}

interface AiPipeline {
  totalScored: number;
  totalSkipped: number;
  failedRuns: number;
  avgLatencyMs: number | null;
  fallbackRate: number | null;
}

interface Stats {
  ingestion: {
    recentRuns: Array<{ id: string; status: string; items_ingested: number; started_at: string; errors: Record<string, string> }>;
    alertsToday: number;
    alertsThisWeek: number;
    totalActiveAlerts: number;
    sourceHealth: SourceHealth[];
  };
  aiPipeline: AiPipeline;
  users: { free: number; paid: number };
}

interface Revenue {
  mrr: { thisMonth: string; lastMonth: string; currency: string };
  subscriptions: { activePaid: number; newThisMonth: number; churnedThisMonth: number; churnRate: string };
  recentEvents: Array<{ amount: number; currency: string; provider: string; created_at: string }>;
}

interface User {
  id: string;
  email: string;
  display_name: string | null;
  plan: string;
  is_admin: boolean;
  deleted_at: string | null;
  created_at: string;
  pdf_export_count: number;
}

interface AuditEntry {
  id: string;
  admin_id: string;
  action: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const statusColor = (s: string) =>
  s === "completed" ? "#16A34A" : s === "failed" ? "#DC2626" : "#D97706";

export default function AdminClient() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [isPending, startTransition] = useTransition();
  const [actionMsg, setActionMsg] = useState("");
  const [scoreMsg, setScoreMsg] = useState("");

  // Theme builder
  const [themeName, setThemeName] = useState("");
  const [brandColor, setBrandColor] = useState("#1A5C4A");
  const [bgPage, setBgPage] = useState("#f8fafc");
  const [textPrimary, setTextPrimary] = useState("#111827");
  const [themeMsg, setThemeMsg] = useState("");
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  const [assignThemeValues, setAssignThemeValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (tab === "overview") fetchStats();
    if (tab === "revenue") fetchRevenue();
    if (tab === "users") { fetchUsers(); loadThemes(); }
    if (tab === "audit") fetchAudit();
    if (tab === "themes") loadThemes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadThemes() {
    const r = await fetch("/api/admin/themes");
    if (r.ok) {
      const b = await r.json();
      setAvailableThemes((b.themes ?? []).map((t: { name: string }) => t.name));
    }
  }

  async function fetchStats() {
    const r = await fetch("/api/admin/stats");
    if (r.ok) setStats(await r.json());
  }
  async function fetchRevenue() {
    const r = await fetch("/api/admin/revenue");
    if (r.ok) setRevenue(await r.json());
  }
  async function fetchUsers() {
    const r = await fetch("/api/admin/users");
    if (r.ok) { const b = await r.json(); setUsers(b.data ?? []); }
  }
  async function fetchAudit() {
    const r = await fetch("/api/admin/audit");
    if (r.ok) { const b = await r.json(); setAudit(b.data ?? []); }
  }

  async function handleUserAction(userId: string, action: string, extra?: Record<string, unknown>) {
    setActionMsg("");
    startTransition(async () => {
      if (action === "impersonate") {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, action }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.impersonateUrl) {
          window.open(body.impersonateUrl, "_blank", "noopener,noreferrer");
          setActionMsg("Impersonation link opened in new tab. Link expires in ~1 hour.");
        } else {
          setActionMsg(body.error ?? "Failed to generate impersonation link.");
        }
        return;
      }

      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, ...extra }),
      });
      const body = await res.json().catch(() => ({}));
      setActionMsg(res.ok ? "Done." : body.error ?? "Failed.");
      if (res.ok) fetchUsers();
    });
  }

  async function handleSaveTheme() {
    setThemeMsg("");
    startTransition(async () => {
      const res = await fetch("/api/admin/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: themeName || "custom", variables: { "--color-brand": brandColor, "--bg-page": bgPage, "--text-primary": textPrimary } }),
      });
      setThemeMsg(res.ok ? "Theme saved." : "Failed to save theme.");
    });
  }

  async function handleActivateTheme(name: string) {
    await fetch("/api/admin/themes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setThemeMsg(`Theme "${name}" activated.`);
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        fontWeight: tab === t ? 700 : 400,
        background: tab === t ? "var(--color-brand)" : "transparent",
        color: tab === t ? "#fff" : "var(--text-secondary)",
        border: "none",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginBottom: 16 };

  const statBox = (label: string, value: string | number, sub?: string) => (
    <div key={label} style={{ ...card, textAlign: "center", flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
        {tabBtn("overview", "Overview")}
        {tabBtn("users", "Users")}
        {tabBtn("revenue", "Revenue")}
        {tabBtn("themes", "Themes")}
        {tabBtn("audit", "Audit Log")}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div>
          {stats ? (
            <>
              {/* Summary stats */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                {statBox("Active Alerts", stats.ingestion.totalActiveAlerts)}
                {statBox("Alerts Today", stats.ingestion.alertsToday)}
                {statBox("Alerts (7d)", stats.ingestion.alertsThisWeek)}
                {statBox("Free Users", stats.users.free)}
                {statBox("Paid Users", stats.users.paid)}
              </div>

              {/* AI Pipeline stats */}
              <div style={card}>
                <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>AI Pipeline Stats</h2>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
                  <div><span style={{ color: "var(--text-secondary)" }}>Items scored: </span><strong>{stats.aiPipeline.totalScored}</strong></div>
                  <div><span style={{ color: "var(--text-secondary)" }}>Items skipped: </span><strong>{stats.aiPipeline.totalSkipped}</strong></div>
                  <div><span style={{ color: "var(--text-secondary)" }}>Failed runs: </span><strong style={{ color: stats.aiPipeline.failedRuns > 0 ? "#DC2626" : "inherit" }}>{stats.aiPipeline.failedRuns}</strong></div>
                  <div><span style={{ color: "var(--text-secondary)" }}>Avg latency: </span><strong>{stats.aiPipeline.avgLatencyMs != null ? `${(stats.aiPipeline.avgLatencyMs / 1000).toFixed(1)}s` : "—"}</strong></div>
                </div>
              </div>

              {/* Source health */}
              <div style={card}>
                <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Source Health</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {stats.ingestion.sourceHealth.map((s) => (
                    <div key={s.source} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${s.status === "degraded" ? "#FCA5A5" : "var(--border)"}`, background: s.status === "degraded" ? "#FFF5F5" : "var(--bg-page)" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{s.source}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        <span style={{ color: s.status === "degraded" ? "#DC2626" : "#16A34A", fontWeight: 600 }}>
                          {s.status === "degraded" ? `${s.errorCount} errors` : "OK"}
                        </span>
                      </div>
                      {s.lastSuccess && (
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                          Last OK: {new Date(s.lastSuccess).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ingestion runs */}
              <div style={card}>
                <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Recent Ingestion Runs</h2>
                {stats.ingestion.recentRuns.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>No runs yet.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {["Started", "Status", "Ingested", "Errors"].map((h) => (
                          <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.ingestion.recentRuns.map((run) => (
                        <tr key={run.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px" }}>{new Date(run.started_at).toLocaleString()}</td>
                          <td style={{ padding: "8px", color: statusColor(run.status), fontWeight: 600 }}>{run.status}</td>
                          <td style={{ padding: "8px" }}>{run.items_ingested}</td>
                          <td style={{ padding: "8px", color: "#DC2626" }}>
                            {Object.entries(run.errors ?? {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={async () => { await fetch("/api/admin/ingest", { method: "POST" }); setTimeout(fetchStats, 2000); }}
                  style={{ padding: "9px 18px", background: "var(--color-brand)", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Trigger Ingestion Run
                </button>
                <button
                  onClick={async () => {
                    setScoreMsg("Running…");
                    const res = await fetch("/api/admin/score", { method: "POST" });
                    const body = await res.json().catch(() => ({}));
                    if (res.ok) setScoreMsg(`Scored ${body.scored} alert(s), ${body.failed} failed. ${body.message ?? ""}`);
                    else setScoreMsg(body.error ?? "AI scoring run failed.");
                  }}
                  style={{ padding: "9px 18px", background: "transparent", color: "var(--color-brand)", border: "1px solid var(--color-brand)", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Trigger AI Scoring Run
                </button>
                {scoreMsg && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{scoreMsg}</span>}
              </div>
            </>
          ) : (
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading stats…</p>
          )}
        </div>
      )}

      {/* ── Users ── */}
      {tab === "users" && (
        <div>
          {actionMsg && (
            <p style={{ fontSize: 13, color: actionMsg === "Done." || actionMsg.includes("opened") ? "#16A34A" : "#DC2626", marginBottom: 12 }}>
              {actionMsg}
            </p>
          )}
          <div style={card}>
            <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Users</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Email", "Plan", "Admin", "Status", "PDF Exports", "Actions"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)", opacity: u.deleted_at ? 0.5 : 1 }}>
                      <td style={{ padding: "8px" }}>{u.email}</td>
                      <td style={{ padding: "8px", textTransform: "capitalize" }}>{u.plan}</td>
                      <td style={{ padding: "8px" }}>{u.is_admin ? "✓" : "—"}</td>
                      <td style={{ padding: "8px", color: u.deleted_at ? "#DC2626" : "#16A34A" }}>{u.deleted_at ? "Suspended" : "Active"}</td>
                      <td style={{ padding: "8px" }}>{u.pdf_export_count}</td>
                      <td style={{ padding: "8px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {u.deleted_at ? (
                            <button onClick={() => handleUserAction(u.id, "unsuspend")} disabled={isPending} style={actionBtnStyle("#16A34A")}>Restore</button>
                          ) : (
                            <button onClick={() => handleUserAction(u.id, "suspend")} disabled={isPending} style={actionBtnStyle("#DC2626")}>Suspend</button>
                          )}
                          {u.plan !== "paid" && (
                            <button onClick={() => handleUserAction(u.id, "set_plan", { plan: "paid" })} disabled={isPending} style={actionBtnStyle("var(--color-brand)")}>→ Paid</button>
                          )}
                          {u.plan === "paid" && (
                            <button onClick={() => handleUserAction(u.id, "set_plan", { plan: "free" })} disabled={isPending} style={actionBtnStyle("#6B7280")}>→ Free</button>
                          )}
                          <button onClick={() => handleUserAction(u.id, "set_admin", { is_admin: !u.is_admin })} disabled={isPending} style={actionBtnStyle(u.is_admin ? "#6B7280" : "#1A5C4A")}>
                            {u.is_admin ? "Remove Admin" : "Make Admin"}
                          </button>
                          <button onClick={() => handleUserAction(u.id, "impersonate")} disabled={isPending} style={actionBtnStyle("#7C3AED")}>Impersonate</button>
                          {availableThemes.length > 0 && (
                            <select
                              value={assignThemeValues[u.id] ?? ""}
                              onChange={(e) => setAssignThemeValues((prev) => ({ ...prev, [u.id]: e.target.value }))}
                              style={{ padding: "3px 6px", fontSize: 11, borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-page)", color: "var(--text-primary)" }}
                            >
                              <option value="">Default theme</option>
                              {availableThemes.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          )}
                          {availableThemes.length > 0 && (
                            <button
                              onClick={() => handleUserAction(u.id, "set_theme", { theme: assignThemeValues[u.id] || null })}
                              disabled={isPending}
                              style={actionBtnStyle("#0D9488")}
                            >
                              Set Theme
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Revenue ── */}
      {tab === "revenue" && (
        <div>
          {revenue ? (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                {statBox("MRR This Month", `$${revenue.mrr.thisMonth}`, "USD")}
                {statBox("MRR Last Month", `$${revenue.mrr.lastMonth}`, "USD")}
                {statBox("Active Paid", revenue.subscriptions.activePaid)}
                {statBox("New Paid (MTD)", revenue.subscriptions.newThisMonth)}
                {statBox("Churned (MTD)", revenue.subscriptions.churnedThisMonth, `${revenue.subscriptions.churnRate} churn`)}
              </div>
              <div style={card}>
                <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Recent Billing Events</h2>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Date", "Provider", "Amount"].map((h) => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.recentEvents.map((e, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px" }}>{new Date(e.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: "8px", textTransform: "capitalize" }}>{e.provider}</td>
                        <td style={{ padding: "8px" }}>{e.currency === "NGN" ? "₦" : "$"}{(e.amount / 100).toFixed(2)} {e.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading revenue data…</p>
          )}
        </div>
      )}

      {/* ── Themes ── */}
      {tab === "themes" && (
        <div style={card}>
          <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Custom Theme Builder</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>Create and activate custom UI themes. Changes apply globally.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "var(--text-primary)" }}>
              Theme name
              <input value={themeName} onChange={(e) => setThemeName(e.target.value)} placeholder="my-theme" style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-page)", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </label>
            {[
              { label: "Brand color", value: brandColor, set: setBrandColor },
              { label: "Page background", value: bgPage, set: setBgPage },
              { label: "Primary text", value: textPrimary, set: setTextPrimary },
            ].map(({ label, value, set }) => (
              <label key={label} style={{ fontSize: 13, color: "var(--text-primary)" }}>
                {label}
                <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                  <input type="color" value={value} onChange={(e) => set(e.target.value)} style={{ width: 40, height: 34, borderRadius: 4, border: "1px solid var(--border)", cursor: "pointer" }} />
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{value}</span>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSaveTheme} disabled={isPending} style={{ padding: "9px 18px", background: "var(--color-brand)", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save theme</button>
            <button onClick={() => handleActivateTheme(themeName || "custom")} disabled={isPending} style={{ padding: "9px 18px", background: "transparent", color: "var(--color-brand)", border: "1px solid var(--color-brand)", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Activate</button>
          </div>
          {themeMsg && <p style={{ marginTop: 10, fontSize: 13, color: themeMsg.includes("saved") || themeMsg.includes("activated") ? "#16A34A" : "#DC2626" }}>{themeMsg}</p>}
        </div>
      )}

      {/* ── Audit Log ── */}
      {tab === "audit" && (
        <div style={card}>
          <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Admin Audit Log</h2>
          {audit.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>No audit entries yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Date", "Admin", "Action", "Target"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px" }}>{new Date(entry.created_at).toLocaleString()}</td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11 }}>{entry.admin_id.slice(0, 8)}…</td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{entry.action}</td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11 }}>{entry.target_id?.slice(0, 8) ?? "—"}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 600,
    background: "transparent",
    border: `1px solid ${color}`,
    borderRadius: 4,
    color,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}
