import type { Metadata } from "next";
import OnboardingForm from "./OnboardingForm";

export const metadata: Metadata = {
  title: "Welcome to EpiRadar",
  description: "Set up your account to get started.",
};

/**
 * First-login onboarding — prompts user to set a password and recovery email.
 * PRD requirement: "On first login, prompt user to set a password and configure a recovery email."
 */
export default function OnboardingPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ backgroundColor: "var(--bg-page)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl border p-8 shadow-sm"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
      >
        <div className="mb-8 text-center">
          <span
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--brand-green)" }}
          >
            EpiRadar
          </span>
          <h1
            className="mt-4 text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Welcome! Let&apos;s set up your account
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Set a password and recovery email to secure your account.
          </p>
        </div>

        <OnboardingForm />
      </div>
    </div>
  );
}
