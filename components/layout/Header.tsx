"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

/**
 * Global navigation header.
 * Shows brand mark, theme toggle, and auth CTA.
 * On mobile, auth links are in the bottom toolbar instead.
 */
export default function Header() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("epiradar-theme");
    setIsDark(stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches));
  }, []);

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    setIsDark(!isDark);
    localStorage.setItem("epiradar-theme", next);
    document.documentElement.classList.toggle("dark", !isDark);
  }

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        backgroundColor: "var(--bg-nav)",
        borderColor: "var(--border-default)",
        height: "var(--nav-height)",
      }}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--brand-green)" }}
          >
            EpiRadar
          </span>
          <span
            className="hidden rounded px-1.5 py-0.5 text-xs font-semibold sm:block"
            style={{ backgroundColor: "var(--brand-green)", color: "#fff" }}
          >
            BETA
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/"
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
          >
            Dashboard
          </Link>
          <Link
            href="/alerts"
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
          >
            Alerts
          </Link>
          <Link
            href="/map"
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
          >
            Map
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
          >
            Pricing
          </Link>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-md p-2 transition-colors hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            {isDark ? (
              // Sun icon
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : (
              // Moon icon
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )}
          </button>

          {/* Auth CTA — desktop only */}
          <Link
            href="/login"
            className="hidden rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 md:block"
            style={{ backgroundColor: "var(--brand-green)" }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
