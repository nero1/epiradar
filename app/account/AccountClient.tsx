"use client";

import { useState, useTransition } from "react";
import type { User } from "@/lib/supabase/types";
import { getRemainingQuota } from "@/lib/export/pdf";

interface Props {
  user: User;
}

type Tab = "profile" | "security" | "exports";

const FREE_MONTHLY_PDF = 3;

export default function AccountClient({ user }: Props) {
  const [tab, setTab] = useState<Tab>("profile");
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [nameMsg, setNameMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  // 2FA state
  const [totpUri, setTotpUri] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [totpMsg, setTotpMsg] = useState("");
  const [showTotp, setShowTotp] = useState(false);

  const remaining = user.plan === "paid"
    ? "Unlimited"
    : `${getRemainingQuota(user.pdf_export_count, user.plan).toNumber()} / ${FREE_MONTHLY_PDF}`;

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

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setPwMsg("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/v1/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        setPwMsg("Password updated.");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const body = await res.json().catch(() => ({}));
        setPwMsg(body.error ?? "Failed to update password.");
      }
    });
  }

  async function handleSetup2FA() {
    startTransition(async () => {
      const res = await fetch("/api/v1/account/totp/setup", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.uri) {
        setTotpUri(body.uri);
        setShowTotp(true);
        setTotpMsg("");
      } else {
        setTotpMsg(body.error ?? "Failed to set up 2FA.");
      }
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
      if (res.ok) {
        setTotpMsg("2FA enabled successfully.");
        setShowTotp(false);
        setTotpToken("");
      } else {
        setTotpMsg(body.error ?? "Invalid token.");
      }
    });
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        padding: "8px 18px",
        borderRadius: 6,
        fontWeight: tab === t ? 700 : 400,
        background: tab === t ? "var(--color-brand)" : "transparent",
        color: tab === t ? "#fff" : "var(--text-secondary)",
        border: "none",
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );

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

  const btnStyle: React.CSSProperties = {
    background: "var(--color-brand)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "9px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: isPending ? "not-allowed" : "pointer",
    opacity: isPending ? 0.7 : 1,
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
            style={{
              background: "var(--color-brand)",
              color: "#fff",
              padding: "8px 18px",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Upgrade →
          </a>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {tabBtn("profile", "Profile")}
        {tabBtn("security", "Security")}
        {tabBtn("exports", "Export Usage")}
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
            <input
              style={inputStyle}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              placeholder="Your name"
            />
          </div>
          <button style={btnStyle} onClick={handleSaveName} disabled={isPending}>
            Save
          </button>
          {nameMsg && <p style={msgStyle(nameMsg === "Saved.")}>{nameMsg}</p>}
        </div>
      )}

      {/* Security tab */}
      {tab === "security" && (
        <>
          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "var(--text-primary)" }}>Change Password</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>New password</label>
              <input
                style={inputStyle}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Confirm password</label>
              <input
                style={inputStyle}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button style={btnStyle} onClick={handleChangePassword} disabled={isPending}>
              Update password
            </button>
            {pwMsg && <p style={msgStyle(pwMsg === "Password updated.")}>{pwMsg}</p>}
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "var(--text-primary)" }}>
              Two-Factor Authentication (TOTP)
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
              {user.totp_secret
                ? "2FA is currently enabled on your account."
                : "Add an authenticator app for extra security."}
            </p>
            {!showTotp && (
              <button style={btnStyle} onClick={handleSetup2FA} disabled={isPending || !!user.totp_secret}>
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
                  style={{
                    display: "inline-block",
                    padding: "8px 14px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 11,
                    wordBreak: "break-all",
                    color: "var(--text-secondary)",
                    marginBottom: 12,
                    maxWidth: 480,
                  }}
                >
                  {totpUri}
                </a>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input
                    style={{ ...inputStyle, width: 160 }}
                    value={totpToken}
                    onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                  />
                  <button style={btnStyle} onClick={handleVerifyTotp} disabled={isPending || totpToken.length !== 6}>
                    Verify
                  </button>
                </div>
              </div>
            )}
            {totpMsg && <p style={msgStyle(totpMsg.includes("successfully"))}>{totpMsg}</p>}
          </div>
        </>
      )}

      {/* Export usage tab */}
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
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min((user.pdf_export_count / FREE_MONTHLY_PDF) * 100, 100)}%`,
                    background: user.pdf_export_count >= FREE_MONTHLY_PDF ? "#DC2626" : "var(--color-brand)",
                    borderRadius: 4,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            )}
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
              {user.plan === "paid"
                ? "Paid users have unlimited PDF exports."
                : `Free accounts get ${FREE_MONTHLY_PDF} PDF exports per month. Resets on the 1st.`}
            </p>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, color: "var(--text-primary)" }}>CSV Exports</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {user.plan === "paid" ? "Available" : "Paid only"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Bulk CSV exports are available on the paid plan.
            </p>
          </div>

          {user.plan !== "paid" && (
            <a
              href="/pricing"
              style={{
                display: "inline-block",
                marginTop: 20,
                background: "var(--color-brand)",
                color: "#fff",
                padding: "9px 20px",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Upgrade for unlimited exports
            </a>
          )}
        </div>
      )}
    </div>
  );
}
