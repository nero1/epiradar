"use client";

import { useState, useEffect } from "react";

/**
 * Returns true when the browser reports network connectivity.
 * Subscribes to window online/offline events and updates reactively.
 * SSR-safe: defaults to true on the server.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    function setOnline() { setIsOnline(true); }
    function setOffline() { setIsOnline(false); }

    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, []);

  return isOnline;
}
