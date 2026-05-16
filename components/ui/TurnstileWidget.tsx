"use client";

import { useEffect, useRef } from "react";

interface Props {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    turnstile?: any;
    onloadTurnstileCallback?: () => void;
  }
}

/**
 * Cloudflare Turnstile widget.
 * Renders the challenge widget and calls onVerify with the token on success.
 * Set NEXT_PUBLIC_TURNSTILE_SITE_KEY env var. Widget is hidden if key not set.
 */
export default function TurnstileWidget({ onVerify, onExpire }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    function renderWidget() {
      if (!containerRef.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        "expired-callback": onExpire,
        theme: "auto",
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      window.onloadTurnstileCallback = renderWidget;
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    return () => {
      if (window.turnstile && widgetId.current) {
        window.turnstile.remove(widgetId.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;

  return <div ref={containerRef} style={{ marginTop: 12 }} />;
}
