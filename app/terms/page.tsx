import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Terms of Service
        </h1>
        <p style={{ color: "var(--text-secondary)" }} className="mb-4">
          EpiRadar is a public health surveillance tool. By using EpiRadar, you agree to use the
          platform responsibly and in accordance with applicable laws.
        </p>
        <p style={{ color: "var(--text-secondary)" }} className="mb-4">
          Full terms of service will be published prior to public launch.
        </p>
        <Link href="/" className="text-sm underline" style={{ color: "var(--brand-green)" }}>
          ← Back to dashboard
        </Link>
      </main>
      <BottomToolbar />
    </div>
  );
}
