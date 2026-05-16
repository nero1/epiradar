import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // EpiRadar brand palette — no purple, no gradients
        brand: {
          green: "#1A5C4A",
          "green-light": "#2A7A63",
          amber: "#D97706",
          "amber-light": "#F59E0B",
          critical: "#DC2626",
          "critical-light": "#EF4444",
        },
        // Risk level colors
        risk: {
          low: "#16A34A",
          moderate: "#D97706",
          high: "#EA580C",
          critical: "#DC2626",
        },
      },
      backgroundColor: {
        page: "var(--bg-page)",
        card: "var(--bg-card)",
        nav: "var(--bg-nav)",
      },
      textColor: {
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
      },
      borderColor: {
        default: "var(--border-default)",
      },
    },
  },
  plugins: [],
};

export default config;
