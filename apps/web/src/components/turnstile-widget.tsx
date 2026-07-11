"use client";

import Script from "next/script";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef } from "react";
import { DeferredTurnstileExecution } from "./turnstile-execution";

declare global {
  interface Window {
    turnstile?: {
      render(container: string | HTMLElement, options: Record<string, unknown>): string;
      execute(widgetId: string): void;
      reset(widgetId: string): void;
      remove(widgetId: string): void;
    };
  }
}

export interface TurnstileWidgetHandle {
  execute(): void;
  reset(): void;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, {
  siteKey: string;
  onToken: (token: string) => void;
  onError?: () => void;
}>(function TurnstileWidget({ siteKey, onToken, onError }, ref) {
  const id = `turnstile-${useId().replace(/:/g, "")}`;
  const widgetId = useRef<string | null>(null);
  const execution = useRef(new DeferredTurnstileExecution());
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  const render = useCallback(() => {
    if (!window.turnstile || widgetId.current) return;
    const container = document.getElementById(id);
    if (!container) return;
    widgetId.current = window.turnstile.render(container, {
      sitekey: siteKey,
      appearance: "interaction-only",
      execution: "execute",
      callback: (token: unknown) => onTokenRef.current(typeof token === "string" ? token : ""),
      "expired-callback": () => {
        onTokenRef.current("");
        onErrorRef.current?.();
      },
      "error-callback": () => {
        onTokenRef.current("");
        onErrorRef.current?.();
      }
    });
    execution.current.ready(() => {
      if (widgetId.current && window.turnstile) window.turnstile.execute(widgetId.current);
    });
  }, [id, siteKey]);

  useImperativeHandle(ref, () => ({
    execute: () => execution.current.request(),
    reset: () => {
      onTokenRef.current("");
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    }
  }), []);

  useEffect(() => {
    const executionQueue = execution.current;
    render();
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
      executionQueue.clear();
    };
  }, [render]);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />
      <div id={id} />
    </>
  );
});
