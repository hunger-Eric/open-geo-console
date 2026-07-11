"use client";

import { Check, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { buildHppReturnUrls } from "./payment-return";
import { TurnstileWidget } from "./turnstile-widget";

type Currency = "CNY" | "USD" | "HKD";
interface CatalogPayload {
  enabled: boolean;
  mode: "disabled" | "test" | "live";
  prices: Array<{ currency: Currency; amountMinor: number }>;
  turnstileSiteKey: string | null;
}

interface CheckoutPayload {
  orderId?: string;
  hpp?: {
    intentId?: string;
    clientSecret?: string;
    currency?: Currency;
    environment?: "demo" | "prod";
  };
  error?: string;
}

export function CommercialCheckout({ dictionary, locale, reportId }: { dictionary: Dictionary; locale: Locale; reportId: string }) {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [currency, setCurrency] = useState<Currency>(locale === "zh" ? "CNY" : "USD");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/commerce/catalog", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogPayload> : null)
      .then((value) => {
        if (!value) return;
        setCatalog(value);
        setCurrency((current) => value.prices.some((price) => price.currency === current) ? current : value.prices[0]?.currency ?? current);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const price = useMemo(() => catalog?.prices.find((item) => item.currency === currency), [catalog, currency]);
  if (!catalog?.enabled) return null;

  async function checkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (catalog?.turnstileSiteKey && !turnstileToken) {
      setError(dictionary.commerce.humanVerification);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/${reportId}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ email, currency, locale, turnstileToken })
      });
      const payload = await response.json() as CheckoutPayload;
      if (!response.ok || !isHppPayload(payload)) throw new Error(payload.error ?? dictionary.commerce.unavailable);
      const urls = buildHppReturnUrls(window.location.href, payload.orderId);
      const { init } = await import("@airwallex/components-sdk");
      const { payments } = await init({
        env: payload.hpp.environment,
        enabledElements: ["payments"],
        locale
      });
      if (!payments) throw new Error(dictionary.commerce.unavailable);
      const hppOptions = {
        intent_id: payload.hpp.intentId,
        client_secret: payload.hpp.clientSecret,
        currency: payload.hpp.currency,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl
      };
      payments.redirectToCheckout(hppOptions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : dictionary.commerce.unavailable);
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-7 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <LockKeyhole aria-hidden="true" className="mt-1 size-5 shrink-0 text-[var(--teal)]" />
        <div>
          <h3 className="text-lg font-semibold">{dictionary.commerce.offerTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{dictionary.commerce.offerDescription}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        {[dictionary.commerce.scopeEvidence, dictionary.commerce.scopeFixes, dictionary.commerce.scopeRoadmap].map((item) => (
          <li key={item} className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--teal)]" />{item}</li>
        ))}
      </ul>
      <form onSubmit={checkout} className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
        <label className="text-sm font-semibold">
          {dictionary.commerce.emailLabel}
          <input className="input-control mt-2 w-full" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          {dictionary.commerce.currencyLabel}
          <select className="input-control mt-2 w-full" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
            {catalog.prices.map((item) => <option key={item.currency} value={item.currency}>{item.currency} {(item.amountMinor / 100).toFixed(2)}</option>)}
          </select>
        </label>
        {catalog.turnstileSiteKey ? <div className="sm:col-span-2"><TurnstileWidget siteKey={catalog.turnstileSiteKey} onToken={setTurnstileToken} /></div> : null}
        <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-[var(--foreground)]">{dictionary.commerce.deliveryPromise}</p>
          <button className="button-primary min-h-12 shrink-0" disabled={submitting || !email || !price} type="submit">
            {submitting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LockKeyhole aria-hidden="true" className="size-4" />}
            {submitting ? dictionary.commerce.redirecting : `${dictionary.commerce.buyAction} · ${currency} ${price ? (price.amountMinor / 100).toFixed(2) : ""}`}
          </button>
        </div>
      </form>
      {catalog.mode === "test" ? <p className="mt-3 text-xs text-[var(--muted)]">Sandbox / test mode</p> : null}
      {error ? <p className="mt-3 text-sm text-[var(--red)]" role="alert">{error}</p> : null}
    </section>
  );
}

function isHppPayload(payload: CheckoutPayload): payload is Required<Pick<CheckoutPayload, "orderId">> & {
  hpp: { intentId: string; clientSecret: string; currency: Currency; environment: "demo" | "prod" };
} {
  return typeof payload.orderId === "string"
    && typeof payload.hpp?.intentId === "string"
    && typeof payload.hpp.clientSecret === "string"
    && (payload.hpp.currency === "CNY" || payload.hpp.currency === "USD" || payload.hpp.currency === "HKD")
    && (payload.hpp.environment === "demo" || payload.hpp.environment === "prod");
}
