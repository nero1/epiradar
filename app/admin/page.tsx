import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import Header from "@/components/layout/Header";
import AdminClient from "./AdminClient";

export const metadata: Metadata = { title: "Admin Panel — EpiRadar" };

export default async function AdminPage() {
  // is_admin verified from DB — never from session alone
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Admin Panel
        </h1>
        <AdminClient />
      </main>
    </div>
  );
}
