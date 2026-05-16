import type { Metadata } from "next";
import { getAuthenticatedUser } from "@/lib/auth/session";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import PricingClient from "./PricingClient";

export const metadata: Metadata = { title: "Pricing — EpiRadar" };

export default async function PricingPage() {
  const user = await getAuthenticatedUser();
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="mb-4 text-center text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
          Simple, transparent pricing
        </h1>
        <p className="mb-12 text-center" style={{ color: "var(--text-secondary)" }}>
          Start free. Upgrade when you need more.
        </p>
        <PricingClient currentPlan={user?.plan ?? "public"} isAuthenticated={!!user} />
      </main>
      <BottomToolbar />
    </div>
  );
}
