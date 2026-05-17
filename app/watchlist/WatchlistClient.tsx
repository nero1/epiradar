"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import type { Watchlist, WatchlistType, AlertMode, Plan } from "@/lib/supabase/types";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

interface Props {
  initialWatchlists: Watchlist[];
  plan: Plan;
}

interface QueuedOp {
  kind: "add";
  type: WatchlistType;
  value: string;
  alertMode: AlertMode;
}

const FREE_LIMIT = 3;

const TYPE_LABELS: Record<WatchlistType, string> = {
  country: "Country",
  pathogen: "Pathogen",
  region: "Region",
};

const MODE_LABELS: Record<AlertMode, string> = {
  daily: "Daily digest",
  immediate: "Immediate",
};

export default function WatchlistClient({ initialWatchlists, plan }: Props) {
  const [items, setItems] = useState<Watchlist[]>(initialWatchlists);
  const [type, setType] = useState<WatchlistType>("country");
  const [value, setValue] = useState("");
  const [alertMode, setAlertMode] = useState<AlertMode>("daily");
  const [error, setError] = useState("");
  const [offlineMsg, setOfflineMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const isOnline = useOnlineStatus();
  const queuedOp = useRef<QueuedOp | null>(null);

  const atLimit = plan === "free" && items.length >= FREE_LIMIT;

  // Auto-retry queued add when back online
  useEffect(() => {
    if (isOnline && queuedOp.current) {
      const op = queuedOp.current;
      queuedOp.current = null;
      setOfflineMsg("Back online — saving watchlist item…");
      doAdd(op.type, op.value, op.alertMode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  async function doAdd(t: WatchlistType, v: string, mode: AlertMode) {
    startTransition(async () => {
      const res = await fetch("/api/v1/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: t, value: v.trim(), alert_mode: mode }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) => [...prev, body.data as Watchlist]);
        setValue("");
        setOfflineMsg("");
      } else {
        setError(body.error ?? "Failed to add.");
        setOfflineMsg("");
      }
    });
  }

  async function handleAdd() {
    if (!value.trim()) { setError("Please enter a value."); return; }
    setError("");
    setOfflineMsg("");

    if (!isOnline) {
      queuedOp.current = { kind: "add", type, value, alertMode };
      setOfflineMsg("Queued — will save when back online.");
      return;
    }

    await doAdd(type, value, alertMode);
  }

  async function handleToggleMode(id: string, current: AlertMode) {
    if (!isOnline) {
      setOfflineMsg("Cannot update alert mode while offline.");
      return;
    }
    const next: AlertMode = current === "daily" ? "immediate" : "daily";
    startTransition(async () => {
      const res = await fetch(`/api/v1/watchlists?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_mode: next }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((w) => w.id === id ? { ...w, alert_mode: next } : w));
      }
    });
  }

  async function handleDelete(id: string) {
    if (!isOnline) {
      setOfflineMsg("Cannot remove while offline. Will be available when back online.");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/v1/watchlists?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((w) => w.id !== id));
      }
    });
  }

  const selectStyle: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "9px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
        Get notified when new alerts match your watchlist. Free accounts can add up to 3 items.
      </p>

      {/* Offline queue message */}
      {offlineMsg && (
        <div style={{
          background: "#FFFBEB",
          border: "1px solid #FCD34D",
          borderRadius: 8,
          padding: "10px 16px",
          marginBottom: 16,
          fontSize: 13,
          color: "#92400E",
        }}>
          {offlineMsg}
        </div>
      )}

      {/* Add form */}
      {!atLimit ? (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            Add watchlist item
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <select value={type} onChange={(e) => setType(e.target.value as WatchlistType)} style={selectStyle}>
              <option value="country">Country</option>
              <option value="pathogen">Pathogen</option>
              <option value="region">Region</option>
            </select>
            <input
              style={inputStyle}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "country" ? "e.g. NG, US, BR" : type === "pathogen" ? "e.g. Mpox, Cholera" : "e.g. West Africa"}
              maxLength={100}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <select value={alertMode} onChange={(e) => setAlertMode(e.target.value as AlertMode)} style={selectStyle}>
              <option value="daily">Daily digest</option>
              <option value="immediate">Immediate</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={isPending || !value.trim()}
              style={{
                background: !isOnline ? "#D97706" : "var(--color-brand)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "9px 18px",
                fontSize: 14,
                fontWeight: 600,
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {!isOnline ? "Queue" : "Add"}
            </button>
          </div>
          {error && <p style={{ fontSize: 13, color: "#DC2626", margin: 0 }}>{error}</p>}
        </div>
      ) : (
        <div
          style={{
            background: "#FEF3C7",
            border: "1px solid #FCD34D",
            borderRadius: 10,
            padding: "14px 20px",
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, color: "#92400E" }}>
            Free plan limit reached (3/3).
          </span>
          <a
            href="/pricing"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#92400E",
              textDecoration: "underline",
            }}
          >
            Upgrade for unlimited →
          </a>
        </div>
      )}

      {/* Watchlist items */}
      {items.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: "var(--text-secondary)",
            fontSize: 14,
            border: "1px dashed var(--border)",
            borderRadius: 10,
          }}
        >
          No watchlist items yet. Add a country, pathogen, or region to start receiving alerts.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)" }}>
                  {item.value}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {TYPE_LABELS[item.type]} · {MODE_LABELS[item.alert_mode]}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => handleToggleMode(item.id, item.alert_mode)}
                  disabled={isPending}
                  aria-label={`Switch to ${item.alert_mode === "daily" ? "immediate" : "daily"} alerts`}
                  title={item.alert_mode === "daily" ? "Switch to immediate alerts" : "Switch to daily digest"}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "5px 10px",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {item.alert_mode === "daily" ? "→ Immediate" : "→ Daily"}
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={isPending}
                  aria-label="Remove watchlist item"
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "5px 10px",
                    fontSize: 13,
                    color: "#DC2626",
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
