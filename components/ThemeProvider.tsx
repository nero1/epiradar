"use client";

import { useEffect } from "react";

/**
 * Applies the authenticated user's preferred theme (or the admin global theme)
 * by injecting CSS variable overrides into the document root.
 * Called once on mount for authenticated pages.
 *
 * Fetches GET /api/v1/account/theme and applies the variables as inline style
 * on <html data-custom-theme="...">.
 */
export default function ThemeProvider() {
  useEffect(() => {
    let cancelled = false;

    async function applyUserTheme() {
      try {
        const res = await fetch("/api/v1/account/theme");
        if (!res.ok || cancelled) return;

        const { themeName, variables } = await res.json();
        if (!themeName || !variables || Object.keys(variables).length === 0) return;

        // Apply CSS variable overrides to the root element
        const root = document.documentElement;
        root.setAttribute("data-custom-theme", themeName);
        for (const [key, value] of Object.entries(variables as Record<string, string>)) {
          root.style.setProperty(key, value);
        }
      } catch {
        // Non-fatal — default theme stays in effect
      }
    }

    applyUserTheme();
    return () => { cancelled = true; };
  }, []);

  return null;
}
