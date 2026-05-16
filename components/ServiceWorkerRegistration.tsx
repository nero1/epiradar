"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount.
 * Must be rendered in a Client Component inside the root layout.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("[SW] Registration failed:", err));
    }
  }, []);

  return null;
}
