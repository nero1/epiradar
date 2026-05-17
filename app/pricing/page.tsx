import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth/session";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import PricingClient from "./PricingClient";

export const metadata: Metadata = { title: "Pricing — EpiRadar" };

/** Detect Nigerian users from IP headers set by Cloudflare or Vercel. */
async function detectNigeriaFromHeaders(): Promise<boolean> {
  const headersList = await headers();
  // Cloudflare sets CF-IPCountry; Vercel sets X-Vercel-IP-Country
  const country =
    headersList.get("cf-ipcountry") ??
    headersList.get("x-vercel-ip-country") ??
    "";
  return country.toUpperCase() === "NG";
}

export default async function PricingPage() {
  const [user, isNigeria] = await Promise.all([
    getAuthenticatedUser(),
    detectNigeriaFromHeaders(),
  ]);

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
        <PricingClient currentPlan={user?.plan ?? "public"} isAuthenticated={!!user} isNigeria={isNigeria} />
      </main>
      <BottomToolbar />
    </div>
  );
}
