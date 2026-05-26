export const metadata = {
  title: "Help | EpiRadar",
  description: "Account recovery, billing, security, and support help.",
};

export default function HelpPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Help & Support</h1>
      <h2>Account recovery</h2>
      <p>If you lost access, contact support with your account email and proof of ownership.</p>
      <h2>Billing</h2>
      <p>For payment disputes, include your provider receipt ID and date.</p>
      <h2>Security</h2>
      <p>Enable 2FA and rotate API keys regularly from your account settings.</p>
      <h2>Privacy</h2>
      <p>Account deletion is soft-delete first, then hard-delete after retention window.</p>
    </main>
  );
}
