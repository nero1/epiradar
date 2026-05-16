import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import OfflineBanner from "@/components/layout/OfflineBanner";

export const metadata: Metadata = { title: "Global Risk Map" };
export const revalidate = 3600;

export default function MapPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <OfflineBanner />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Global Risk Map
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Interactive risk map coming in Phase 3 — public dashboard.
        </p>
      </main>
      <BottomToolbar />
    </div>
  );
}
