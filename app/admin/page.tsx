import type { Metadata } from "next";
import Header from "@/components/layout/Header";

export const metadata: Metadata = { title: "Admin Panel" };

export default function AdminPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Admin Panel
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Full admin panel coming in Phase 6 — security hardening and launch prep.
        </p>
      </main>
    </div>
  );
}
