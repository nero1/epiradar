"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Onboarding form — password + recovery email for new Google OAuth users.
 * Both fields are optional; users can skip and set them later in Account settings.
 */
export default function OnboardingForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);

    const supabase = createClient();

    // Update password if provided
    if (password) {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        setError(pwError.message);
        setIsLoading(false);
        return;
      }
    }

    // Store recovery email separately if provided
    if (recoveryEmail) {
      const { error: metaError } = await supabase.auth.updateUser({
        data: { recovery_email: recoveryEmail },
      });
      if (metaError) {
        setError(metaError.message);
        setIsLoading(false);
        return;
      }
    }

    router.push("/");
  }

  function handleSkip() {
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Password <span style={{ color: "var(--text-muted)" }}>(optional)</span>
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 characters"
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={{
            backgroundColor: "var(--bg-page)",
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-1 block text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Confirm password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat password"
          autoComplete="new-password"
          className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={{
            backgroundColor: "var(--bg-page)",
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <div>
        <label
          htmlFor="recoveryEmail"
          className="mb-1 block text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Recovery email <span style={{ color: "var(--text-muted)" }}>(optional)</span>
        </label>
        <input
          id="recoveryEmail"
          type="email"
          value={recoveryEmail}
          onChange={(e) => setRecoveryEmail(e.target.value)}
          placeholder="backup@example.com"
          autoComplete="email"
          className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={{
            backgroundColor: "var(--bg-page)",
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {error && (
        <p className="text-xs" role="alert" style={{ color: "var(--brand-critical)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: "var(--brand-green)" }}
      >
        {isLoading ? "Saving…" : "Save and continue"}
      </button>

      <button
        type="button"
        onClick={handleSkip}
        className="w-full text-center text-sm hover:opacity-80"
        style={{ color: "var(--text-muted)" }}
      >
        Skip for now
      </button>
    </form>
  );
}
