"use client";

/**
 * Telegram Login Widget button — scaffold only.
 * Rendered only when NEXT_PUBLIC_ENABLE_TELEGRAM_AUTH=true.
 *
 * To activate:
 *   1. Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=<your-bot-username>
 *   2. Set NEXT_PUBLIC_ENABLE_TELEGRAM_AUTH=true
 *   3. Wire the widget's onauth callback to POST /api/auth/telegram
 *   4. Implement /api/auth/telegram to call verifyTelegramAuth() from lib/auth/telegram.ts
 *
 * @see lib/auth/telegram.ts for signature verification
 */
export default function TelegramLoginButton() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_TELEGRAM_AUTH === "true";
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  if (!enabled || !botUsername) return null;

  return (
    <div style={{ marginTop: 12, textAlign: "center" }}>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
        Or sign in with
      </p>
      {/* The real Telegram Login Widget is loaded as a <script> tag.
          Replace this placeholder with the official widget script once activated. */}
      <button
        disabled
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 18px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          color: "var(--text-secondary)",
          fontSize: 13,
          cursor: "not-allowed",
          opacity: 0.6,
        }}
        title="Telegram sign-in is not yet activated"
      >
        Telegram (coming soon)
      </button>
    </div>
  );
}
