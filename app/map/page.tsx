import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import OfflineBanner from "@/components/layout/OfflineBanner";
import RiskMapClient from "@/components/dashboard/RiskMapClient";
import { getCountryRiskScores } from "@/lib/data/alerts";

export const metadata: Metadata = {
  title: "Global Risk Map",
  description: "Interactive world map showing infectious disease outbreak risk by country.",
};

export const revalidate = 3600;

export default async function MapPage() {
  const hasCredentials =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co";
  const scores = hasCredentials ? await getCountryRiskScores() : [];

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <OfflineBanner />

      <main className="flex flex-1 flex-col px-4 py-4 sm:px-6">
        <h1 className="mb-3 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Global Risk Map
        </h1>
        <div
          className="flex-1 overflow-hidden rounded-xl border"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-default)",
            minHeight: "500px",
          }}
        >
          <RiskMapClient initialScores={scores} />
        </div>
      </main>

      <BottomToolbar />
    </div>
  );
}
