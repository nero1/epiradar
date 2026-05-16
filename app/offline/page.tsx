import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 text-center"
      style={{ backgroundColor: "var(--bg-page)" }}
    >
      <div
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: "#FEF3C7" }}
      >
        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="#D97706" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.318 10.318A3.757 3.757 0 0 0 8.25 14.25m3.5 0H12m0 0h.01M5.25 6.75A9.015 9.015 0 0 0 3 12c0 4.97 4.03 9 9 9a9.015 9.015 0 0 0 5.944-2.233" />
        </svg>
      </div>
      <h1 className="mb-2 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
        You are offline
      </h1>
      <p className="mb-6 max-w-sm text-sm" style={{ color: "var(--text-secondary)" }}>
        EpiRadar needs an internet connection to load fresh data. Cached data is shown where available.
      </p>
      <Link
        href="/"
        className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--brand-green)" }}
      >
        Try again
      </Link>
    </div>
  );
}
