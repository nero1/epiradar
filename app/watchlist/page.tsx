import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import WatchlistClient from "./WatchlistClient";
import type { Watchlist } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Watchlist — EpiRadar" };

export default async function WatchlistPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("watchlists")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const watchlists: Watchlist[] = data ?? [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Watchlist
          </h1>
          <span style={{
            fontSize: 12,
            padding: "3px 10px",
            borderRadius: 12,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}>
            {watchlists.length} / {user.plan === "paid" ? "∞" : "3"}
          </span>
        </div>
        <WatchlistClient initialWatchlists={watchlists} plan={user.plan} />
      </main>
      <BottomToolbar />
    </div>
  );
}
