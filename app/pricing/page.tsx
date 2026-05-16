import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import BottomToolbar from "@/components/layout/BottomToolbar";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
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

        <div className="grid gap-6 sm:grid-cols-3">
          {/* Free tier */}
          <div className="card rounded-xl border p-6" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)" }}>
            <h2 className="mb-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Free</h2>
            <p className="mb-4 text-3xl font-bold" style={{ color: "var(--text-primary)" }}>$0<span className="text-base font-normal" style={{ color: "var(--text-muted)" }}>/mo</span></p>
            <ul className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <li>✓ Full dashboard access</li>
              <li>✓ 30-day alert history</li>
              <li>✓ 3 country watchlists</li>
              <li>✓ Daily email digest</li>
              <li>✓ 3 PDF exports/month</li>
            </ul>
          </div>

          {/* Paid tier */}
          <div className="card rounded-xl border-2 p-6" style={{ borderColor: "var(--brand-green)", backgroundColor: "var(--bg-card)" }}>
            <div className="mb-2 inline-block rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: "var(--brand-green)" }}>RECOMMENDED</div>
            <h2 className="mb-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Paid</h2>
            <p className="mb-4 text-3xl font-bold" style={{ color: "var(--text-primary)" }}>$29<span className="text-base font-normal" style={{ color: "var(--text-muted)" }}>/mo</span></p>
            <ul className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <li>✓ Everything in Free</li>
              <li>✓ Full alert archive</li>
              <li>✓ Unlimited watchlists</li>
              <li>✓ Deep AI reports</li>
              <li>✓ Unlimited PDF & CSV exports</li>
              <li>✓ API access (1,000 req/day)</li>
            </ul>
          </div>

          {/* Public */}
          <div className="card rounded-xl border p-6" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)" }}>
            <h2 className="mb-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Public</h2>
            <p className="mb-4 text-3xl font-bold" style={{ color: "var(--text-primary)" }}>Free<span className="text-base font-normal" style={{ color: "var(--text-muted)" }}> forever</span></p>
            <ul className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <li>✓ Global risk map</li>
              <li>✓ Top 10 active alerts</li>
              <li>✓ AI summary teasers</li>
              <li>✗ No account required</li>
            </ul>
          </div>
        </div>
      </main>
      <BottomToolbar />
    </div>
  );
}
