import type { Metadata } from "next";
import Link from "next/link";
import GoogleSignInButton from "./GoogleSignInButton";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to EpiRadar with your Google account.",
};

/**
 * Login page — Google OAuth only for MVP.
 * Shows the sign-in button and a link back to the public dashboard.
 */
export default function LoginPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ backgroundColor: "var(--bg-page)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl border p-8 shadow-sm"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/">
            <span
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--brand-green)" }}
            >
              EpiRadar
            </span>
          </Link>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Infectious Disease Early Warning
          </p>
        </div>

        <h1
          className="mb-6 text-center text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Sign in to your account
        </h1>

        <GoogleSignInButton />

        <p
          className="mt-6 text-center text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          By signing in, you agree to our{" "}
          <Link href="/terms" className="underline hover:opacity-80">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:opacity-80">
            Privacy Policy
          </Link>
          .
        </p>

        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-xs hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            ← Back to public dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
