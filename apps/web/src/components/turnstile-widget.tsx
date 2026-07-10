"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render(container: string | HTMLElement, options: Record<string, unknown>): string;
      remove(widgetId: string): void;
    };
  }
}

export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const id = `turnstile-${useId().replace(/:/g, "")}`;
  const widgetId = useRef<string | null>(null);

  const render = useCallback(() => {
    if (!window.turnstile || widgetId.current) return;
    const container = document.getElementById(id);
    if (!container) return;
    widgetId.current = window.turnstile.render(container, {
      sitekey: siteKey,
      callback: (token: unknown) => onToken(typeof token === "string" ? token : ""),
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken("")
    });
  }, [id, onToken, siteKey]);

  useEffect(() => {
    render();
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [render]);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={render} />
      <div id={id} className="min-h-[65px]" />
    </>
  );
}
