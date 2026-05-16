"use client";

import { useState, useEffect, useTransition } from "react";
import type { User } from "@/lib/supabase/types";
import { getRemainingQuota, FREE_PDF_LIMIT } from "@/lib/utils/quota";

interface Props {
  user: User;
}

type Tab = "profile" | "security" | "exports" | "apikey" | "pin" | "theme";

const FREE_MONTHLY_PDF = FREE_PDF_LIMIT;

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "24px",
  marginBottom: 20,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const msgStyle = (ok: boolean): React.CSSProperties => ({
  marginTop: 8,
  fontSize: 13,
  color: ok ? "#16A34A" : "#DC2626",
});

export default function AccountClient({ user }: Props) {
  const [tab, setTab] = useState<Tab>("profile");
  const [isPending, startTransition] = useTransition();

  // Profile
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [nameMsg, setNameMsg] = useState("");

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  // 2FA
  const [totpUri, setTotpUri] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [totpMsg, setTotpMsg] = useState("");
  const [showTotp, setShowTotp] = useState(false);

  // PIN
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [hasPin, setHasPin] = useState(!!user.pin_hash);
  const [removePin, setRemovePin] = useState("");
  const [removePinMsg, setRemovePinMsg] = useState("");

  // API key (paid only)
  const [apiKeyInfo, setApiKeyInfo] = useState<{ hasKey: boolean; rawKey?: string } | null>(null);
  const [apiKeyMsg, setApiKeyMsg] = useState("");

  // Theme
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string>(user.preferred_theme ?? "");
  const [themeMsg, setThemeMsg] = useState("");

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteMsg, setDeleteMsg] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  // Load available themes when theme tab is opened
  useEffect(() => {
    if (tab === "theme" && availableThemes.length === 0) {
      fetch("/api/admin/themes")
        .then((r) => r.ok ? r.json() : { themes: [] })
        .then((b) => setAvailableThemes((b.themes ?? []).map((t: { name: string }) => t.name)))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const remaining = user.plan === "paid"
    ? "Unlimited"
    : `${getRemainingQuota(user.pdf_export_count, user.plan).toNumber()} / ${FREE_MONTHLY_PDF}`;

  const btnStyle = (danger = false): React.CSSProperties => ({
    background: danger ? "#DC2626" : "var(--color-brand)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "9px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: isPending ? "not-allowed" : "pointer",
    opacity: isPending ? 0.7 : 1,
  });

  // --- Profile ---
  async function handleSaveName() {
    startTransition(async () => {
      const res = await fetch("/api/v1/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });
      setNameMsg(res.ok ? "Saved." : "Failed to save.");
    });
  }

  // --- Password ---
  async function handleChangePassword() {
    if (newPassword !== confirmPassword) { setPwMsg("Passwords do not match."); return; }
    if (newPassword.length < 8) { setPwMsg("Password must be at least 8 characters."); return; }
    startTransition(async () => {
      const res = await fetch("/api/v1/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) { setPwMsg("Password updated."); setNewPassword(""); setConfirmPassword(""); }
      else { const b = await res.json().catch(() => ({})); setPwMsg(b.error ?? "Failed to update password."); }
    });
  }

  // --- 2FA ---
  async function handleSetup2FA() {
    startTransition(async () => {
      const res = await fetch("/api/v1/account/totp/setup", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.uri) { setTotpUri(body.uri); setShowTotp(true); setTotpMsg(""); }
      else { setTotpMsg(body.error ?? "Failed to set up 2FA."); }
    });
  }

  async function handleVerifyTotp() {
    startTransition(async () => {
      const res = await fetch("/api/v1/account/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: totpToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setTotpMsg("2FA enabled successfully."); setShowTotp(false); setTotpToken(""); }
      else { setTotpMsg(body.error ?? "Invalid token."); }
    });
  }

  // --- PIN ---
  async function handleSetPin() {
    if (newPin !== confirmPin) { setPinMsg("PINs do not match."); return; }
    if (!/^\d{4}$/.test(newPin)) { setPinMsg("PIN must be exactly 4 digits."); return; }
    startTransition(async () => {
      const res = await fetch("/api/v1/account/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin, currentPin: hasPin ? currentPin : undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setPinMsg(body.message ?? "PIN saved."); setHasPin(true); setNewPin(""); setConfirmPin(""); setCurrentPin(""); }
      else { setPinMsg(body.error ?? "Failed to save PIN."); }
    });
  }

  async function handleRemovePin() {
    if (!/^\d{4}$/.test(removePin)) { setRemovePinMsg("Enter your current 4-digit PIN."); return; }
    startTransition(async () => {
      const res = await fetch("/api/v1/account/pin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: removePin }),
      });
      if (res.ok) { setRemovePinMsg("PIN removed."); setHasPin(false); setRemovePin(""); }
      else { const b = await res.json().catch(() => ({})); setRemovePinMsg(b.error ?? "Failed to remove PIN."); }
    });
  }

  // --- API key ---
  async function loadApiKeyStatus() {
    const res = await fetch("/api/v1/apikeys");
    if (res.ok) { const b = await res.json(); setApiKeyInfo({ hasKey: b.hasApiKey }); }
  }

  async function handleGenerateKey() {
    startTransition(async () => {
      const res = await fetch("/api/v1/apikeys", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setApiKeyInfo({ hasKey: true, rawKey: body.apiKey });
        setApiKeyMsg("Store this key now — it won't be shown again.");
      } else {
        setApiKeyMsg(body.error ?? "Failed to generate key.");
      }
    });
  }

  async function handleRevokeKey() {
    startTransition(async () => {
      const res = await fetch("/api/v1/apikeys", { method: "DELETE" });
      if (res.ok) { setApiKeyInfo({ hasKey: false }); setApiKeyMsg("API key revoked."); }
      else { setApiKeyMsg("Failed to revoke key."); }
    });
  }

  // --- Theme ---
  async function handleSaveTheme() {
    setThemeMsg("");
    startTransition(async () => {
      const res = await fetch("/api/v1/account/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeName: selectedTheme || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setThemeMsg("Theme preference saved. Reload to see changes.");
      } else {
        setThemeMsg(body.error ?? "Failed to save theme preference.");
      }
    });
  }

  // --- Delete account ---
  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") { setDeleteMsg('Type "DELETE" to confirm.'); return; }
    startTransition(async () => {
      const res = await fetch("/api/v1/account/delete", { method: "POST" });
      if (res.ok) {
        setDeleteMsg("Account deleted. You will be signed out.");
        setTimeout(() => { window.location.href = "/"; }, 2500);
      } else {
        const b = await res.json().catch(() => ({}));
        setDeleteMsg(b.error ?? "Failed to delete account.");
      }
    });
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      onClick={() => {
        setTab(t);
        if (t === "apikey" && !apiKeyInfo) loadApiKeyStatus();
      }}
      style={{
        padding: "8px 14px",
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

  return (
    <div>
      {/* Plan badge */}
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
        <div>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Current plan</span>
          <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text-primary)", textTransform: "capitalize" }}>
            {user.plan}
          </div>
        </div>
        {user.plan !== "paid" && (
          <a
            href="/pricing"
            style={{ background: "var(--color-brand)", color: "#fff", padding: "8px 18px", borderRadius: 6, textDecoration: "none", fontSize: 13, fontWeight: 600 }}
          >
            Upgrade →
          </a>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {tabBtn("profile", "Profile")}
        {tabBtn("security", "Security")}
        {tabBtn("exports", "Exports")}
        {tabBtn("pin", "PIN")}
        {tabBtn("theme", "Theme")}
        {user.plan === "paid" && tabBtn("apikey", "API Key")}
      </div>

      {/* Profile tab */}
      {tab === "profile" && (
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "var(--text-primary)" }}>Profile</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email</label>
            <div style={{ ...inputStyle, background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
              {user.email}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Display name</label>
            <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} placeholder="Your name" />
          </div>
          <button style={btnStyle()} onClick={handleSaveName} disabled={isPending}>Save</button>
          {nameMsg && <p style={msgStyle(nameMsg === "Saved.")}>{nameMsg}</p>}
        </div>
      )}

      {/* Security tab */}
      {tab === "security" && (
        <>
          {/* 2FA encouragement banner for paid users who haven't set it up (PRD §4.4) */}
          {user.plan === "paid" && !user.totp_secret && (
            <div style={{
              marginBottom: 16,
              padding: "14px 18px",
              borderRadius: 8,
              background: "#FEF3C7",
              border: "1px solid #F59E0B",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠</span>
              <div>
                <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 13, color: "#92400E" }}>
                  Secure your paid account with two-factor authentication
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "#92400E" }}>
                  Your account has access to sensitive data and API keys. Enable 2FA below to protect it.
                </p>
              </div>
              <button
                onClick={() => setTab("security")}
                style={{ marginLeft: "auto", flexShrink: 0, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Set up 2FA ↓
              </button>
            </div>
          )}

          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "var(--text-primary)" }}>Change Password</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>New password</label>
              <input style={inputStyle} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Confirm password</label>
              <input style={inputStyle} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <button style={btnStyle()} onClick={handleChangePassword} disabled={isPending}>Update password</button>
            {pwMsg && <p style={msgStyle(pwMsg === "Password updated.")}>{pwMsg}</p>}
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "var(--text-primary)" }}>Two-Factor Authentication (TOTP)</h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
              {user.totp_secret ? "2FA is currently enabled on your account." : "Add an authenticator app for extra security."}
            </p>
            {!showTotp && (
              <button style={btnStyle()} onClick={handleSetup2FA} disabled={isPending || !!user.totp_secret}>
                {user.totp_secret ? "2FA Enabled" : "Set up 2FA"}
              </button>
            )}
            {showTotp && totpUri && (
              <div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                  Scan the QR code with your authenticator app, then enter the 6-digit token.
                </p>
                <a
                  href={totpUri}
                  style={{ display: "inline-block", padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, wordBreak: "break-all", color: "var(--text-secondary)", marginBottom: 12, maxWidth: 480 }}
                >
                  {totpUri}
                </a>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input style={{ ...inputStyle, width: 160 }} value={totpToken} onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" maxLength={6} />
                  <button style={btnStyle()} onClick={handleVerifyTotp} disabled={isPending || totpToken.length !== 6}>Verify</button>
                </div>
              </div>
            )}
            {totpMsg && <p style={msgStyle(totpMsg.includes("successfully"))}>{totpMsg}</p>}
          </div>

          {/* Delete account */}
          <div style={{ ...cardStyle, borderColor: "#FCA5A5" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "#DC2626" }}>Delete Account</h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
              Your account will be soft-deleted immediately and permanently removed after 30 days.
              Contact support within that window to recover it.
            </p>
            {!showDelete ? (
              <button style={btnStyle(true)} onClick={() => setShowDelete(true)}>Delete my account</button>
            ) : (
              <div>
                <label style={labelStyle}>Type DELETE to confirm</label>
                <input
                  style={{ ...inputStyle, borderColor: "#FCA5A5" }}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={btnStyle(true)} onClick={handleDeleteAccount} disabled={isPending || deleteConfirm !== "DELETE"}>
                    Confirm delete
                  </button>
                  <button style={{ ...btnStyle(), background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }} onClick={() => { setShowDelete(false); setDeleteConfirm(""); setDeleteMsg(""); }}>
                    Cancel
                  </button>
                </div>
                {deleteMsg && <p style={msgStyle(!deleteMsg.includes("fail") && !deleteMsg.includes("Type"))}>{deleteMsg}</p>}
              </div>
            )}
          </div>
        </>
      )}

      {/* Exports tab */}
      {tab === "exports" && (
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "var(--text-primary)" }}>Export Usage</h2>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, color: "var(--text-primary)" }}>PDF Exports this month</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{remaining}</span>
            </div>
            {user.plan !== "paid" && (
              <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min((user.pdf_export_count / FREE_MONTHLY_PDF) * 100, 100)}%`, background: user.pdf_export_count >= FREE_MONTHLY_PDF ? "#DC2626" : "var(--color-brand)", borderRadius: 4, transition: "width 0.3s" }} />
              </div>
            )}
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
              {user.plan === "paid" ? "Paid users have unlimited PDF exports." : `Free accounts get ${FREE_MONTHLY_PDF} PDF exports per month. Resets on the 1st.`}
            </p>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, color: "var(--text-primary)" }}>CSV Exports</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{user.plan === "paid" ? "Available" : "Paid only"}</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Bulk CSV exports are available on the paid plan.</p>
          </div>
          {user.plan !== "paid" && (
            <a href="/pricing" style={{ display: "inline-block", marginTop: 20, background: "var(--color-brand)", color: "#fff", padding: "9px 20px", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
              Upgrade for unlimited exports
            </a>
          )}
        </div>
      )}

      {/* PIN tab */}
      {tab === "pin" && (
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "var(--text-primary)" }}>4-Digit PIN</h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
            Optional PIN for sensitive operations: API key reveal, exports, plan upgrade.
            {hasPin ? " A PIN is currently set." : " No PIN is currently set."}
          </p>

          {hasPin && (
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
              <label style={labelStyle}>Current PIN</label>
              <input style={{ ...inputStyle, width: 120 }} type="password" inputMode="numeric" value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" maxLength={4} />
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>New PIN</label>
            <input style={{ ...inputStyle, width: 120 }} type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" maxLength={4} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Confirm PIN</label>
            <input style={{ ...inputStyle, width: 120 }} type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" maxLength={4} />
          </div>
          <button style={btnStyle()} onClick={handleSetPin} disabled={isPending || newPin.length !== 4}>
            {hasPin ? "Update PIN" : "Set PIN"}
          </button>
          {pinMsg && <p style={msgStyle(!pinMsg.toLowerCase().includes("fail") && !pinMsg.toLowerCase().includes("mismatch") && !pinMsg.toLowerCase().includes("incorrect"))}>{pinMsg}</p>}

          {hasPin && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#DC2626" }}>Remove PIN</h3>
              <input style={{ ...inputStyle, width: 120, borderColor: "#FCA5A5" }} type="password" inputMode="numeric" value={removePin} onChange={(e) => setRemovePin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" maxLength={4} />
              <button style={{ ...btnStyle(true), marginTop: 8, display: "block" }} onClick={handleRemovePin} disabled={isPending || removePin.length !== 4}>
                Remove PIN
              </button>
              {removePinMsg && <p style={msgStyle(removePinMsg === "PIN removed.")}>{removePinMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* Theme tab */}
      {tab === "theme" && (
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "var(--text-primary)" }}>Display Theme</h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
            Choose a custom theme created by your administrator, or leave blank to use the platform default.
          </p>

          {availableThemes.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              No custom themes available. Administrators can create themes in the admin panel.
            </p>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Select theme
              </label>
              <select
                value={selectedTheme}
                onChange={(e) => setSelectedTheme(e.target.value)}
                style={{ padding: "9px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-page)", color: "var(--text-primary)", fontSize: 14, outline: "none", minWidth: 200 }}
              >
                <option value="">Default (platform theme)</option>
                {availableThemes.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}

          <button style={btnStyle()} onClick={handleSaveTheme} disabled={isPending || availableThemes.length === 0}>
            Save preference
          </button>
          {themeMsg && (
            <p style={{ marginTop: 8, fontSize: 13, color: themeMsg.includes("Reload") || themeMsg.includes("saved") ? "#16A34A" : "#DC2626" }}>
              {themeMsg}
            </p>
          )}
        </div>
      )}

      {/* API Key tab (paid only) */}
      {tab === "apikey" && user.plan === "paid" && (
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "var(--text-primary)" }}>API Key</h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
            Your API key grants access to all <code>/api/v1/</code> endpoints. Rate limit: 1,000 requests/day.
            The key is shown only once at generation time — store it securely.
          </p>

          {apiKeyInfo === null && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</p>
          )}

          {apiKeyInfo !== null && (
            <>
              {apiKeyInfo.rawKey && (
                <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 6, padding: "12px 14px", marginBottom: 16 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#15803D" }}>Your new API key — copy it now:</p>
                  <code style={{ fontSize: 13, wordBreak: "break-all", color: "#166534", display: "block" }}>{apiKeyInfo.rawKey}</code>
                </div>
              )}

              {!apiKeyInfo.rawKey && apiKeyInfo.hasKey && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                  An API key is active. The key value is not shown for security — generate a new one to rotate it.
                </p>
              )}

              {!apiKeyInfo.hasKey && !apiKeyInfo.rawKey && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>No API key generated yet.</p>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnStyle()} onClick={handleGenerateKey} disabled={isPending}>
                  {apiKeyInfo.hasKey ? "Rotate Key" : "Generate Key"}
                </button>
                {apiKeyInfo.hasKey && (
                  <button style={btnStyle(true)} onClick={handleRevokeKey} disabled={isPending}>Revoke Key</button>
                )}
              </div>
              {apiKeyMsg && <p style={msgStyle(!apiKeyMsg.toLowerCase().includes("fail"))}>{apiKeyMsg}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
