"use client";

import { useEffect, useState } from "react";

/**
 * Displays a banner when the user is offline.
 * Shows last-known data timestamp for transparency.
 * PRD requirement: graceful offline state on every page.
 */
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [lastOnline, setLastOnline] = useState<string | null>(null);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
      setLastOnline(new Date().toLocaleTimeString());
    }

    function handleOffline() {
      setIsOffline(true);
      if (!lastOnline) {
        setLastOnline(new Date().toLocaleTimeString());
      }
    }

    // Set initial state
    setIsOffline(!navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [lastOnline]);

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      className="sticky top-[var(--nav-height)] z-30 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium"
      style={{ backgroundColor: "var(--brand-amber)", color: "#fff" }}
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
      You are offline — showing cached data
      {lastOnline && (
        <span className="opacity-80">
          · Last updated {lastOnline}
        </span>
      )}
    </div>
  );
}
