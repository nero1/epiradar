import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import AccountClient from "./AccountClient";

export const metadata: Metadata = { title: "Account Settings — EpiRadar" };

export default async function AccountPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Account Settings
        </h1>
        <AccountClient user={user} />
      </main>
      <BottomToolbar />
    </div>
  );
}
