import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Watchlist
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Country and pathogen watchlists coming in Phase 4 — free account features.
        </p>
      </main>
      <BottomToolbar />
    </div>
  );
}
