import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: {
    default: "EpiRadar — Infectious Disease Early Warning",
    template: "%s | EpiRadar",
  },
  description:
    "AI-powered infectious disease surveillance platform. Track outbreak risks by country and pathogen in real time.",
  keywords: ["infectious disease", "outbreak", "epidemic", "surveillance", "WHO", "public health"],
  authors: [{ name: "EpiRadar" }],
  creator: "EpiRadar",
  openGraph: {
    type: "website",
    siteName: "EpiRadar",
    title: "EpiRadar — Infectious Disease Early Warning",
    description:
      "AI-powered infectious disease surveillance platform. Track outbreak risks by country and pathogen in real time.",
  },
  twitter: {
    card: "summary_large_image",
    title: "EpiRadar — Infectious Disease Early Warning",
    description: "AI-powered infectious disease surveillance platform.",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EpiRadar",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1A5C4A" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1117" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icons/favicon.ico" sizes="any" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body>
        {/* Theme initializer — prevents FOUC by reading localStorage before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('epiradar-theme') || 'light';
                  if (theme === 'dark') document.documentElement.classList.add('dark');
                  var custom = localStorage.getItem('epiradar-custom-theme');
                  if (custom) document.documentElement.setAttribute('data-theme', custom);
                } catch(e) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
