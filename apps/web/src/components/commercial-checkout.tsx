"use client";

import { Check, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import {
  getPaymentConfirmationReturnUrl,
  readCheckoutPayload,
  type CheckoutPayload
} from "./checkout-response";
import { buildHppReturnUrls } from "./payment-return";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";

type Currency = "CNY" | "USD" | "HKD";
interface CatalogPayload {
  enabled: boolean;
  mode: "disabled" | "test" | "live";
  prices: Array<{ currency: Currency; amountMinor: number }>;
  turnstileSiteKey: string | null;
}

export function CommercialCheckout({ dictionary, locale, reportId }: { dictionary: Dictionary; locale: Locale; reportId: string }) {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [currency, setCurrency] = useState<Currency>(locale === "zh" ? "CNY" : "USD");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const pendingCheckout = useRef(false);
  const checkoutIdempotencyKey = useRef("");

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
    if (submitting || verifying) return;
    if (catalog?.turnstileSiteKey && !turnstileToken) {
      setError(null);
      pendingCheckout.current = true;
      setVerifying(true);
      turnstileRef.current?.execute();
      return;
    }
    await startCheckout(turnstileToken);
  }

  async function startCheckout(token: string) {
    setVerifying(false);
    setSubmitting(true);
    setError(null);
    checkoutIdempotencyKey.current ||= crypto.randomUUID();
    try {
      const response = await fetch(`/api/reports/${reportId}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": checkoutIdempotencyKey.current },
        body: JSON.stringify({ email, currency, locale, turnstileToken: token })
      });
      const payload = await readCheckoutPayload(response);
      const confirmationReturnUrl = getPaymentConfirmationReturnUrl(payload, window.location.href);
      if (confirmationReturnUrl) {
        window.location.assign(confirmationReturnUrl);
        return;
      }
      if (!response.ok || !isHppPayload(payload)) {
        throw new Error(payload.code === "payment_confirmation_pending"
          ? dictionary.commerce.paymentConfirming
          : payload.error ?? dictionary.commerce.checkoutFailed);
      }
      const urls = buildHppReturnUrls(window.location.href, payload.orderId);
      const { init } = await import("@airwallex/components-sdk");
      const { payments } = await init({
        env: payload.hpp.environment,
        enabledElements: ["payments"],
        locale
      });
      if (!payments) throw new Error(dictionary.commerce.checkoutFailed);
      const hppOptions = {
        intent_id: payload.hpp.intentId,
        client_secret: payload.hpp.clientSecret,
        currency: payload.hpp.currency,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl
      };
      payments.redirectToCheckout(hppOptions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : dictionary.commerce.checkoutFailed);
      setSubmitting(false);
      setTurnstileToken("");
      turnstileRef.current?.reset();
    }
  }

  function receiveTurnstileToken(token: string) {
    setTurnstileToken(token);
    if (!token || !pendingCheckout.current) return;
    pendingCheckout.current = false;
    void startCheckout(token);
  }

  function failTurnstile() {
    pendingCheckout.current = false;
    setVerifying(false);
    setError(dictionary.commerce.humanVerification);
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
          <input className="input-control mt-2 w-full" type="email" required autoComplete="email" value={email} onChange={(event) => {
            setEmail(event.target.value);
            checkoutIdempotencyKey.current = "";
          }} />
        </label>
        <label className="text-sm font-semibold">
          {dictionary.commerce.currencyLabel}
          <select className="input-control mt-2 w-full" value={currency} onChange={(event) => {
            setCurrency(event.target.value as Currency);
            checkoutIdempotencyKey.current = "";
          }}>
            {catalog.prices.map((item) => <option key={item.currency} value={item.currency}>{item.currency} {(item.amountMinor / 100).toFixed(2)}</option>)}
          </select>
        </label>
        {catalog.turnstileSiteKey ? (
          <div className="sm:col-span-2">
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={catalog.turnstileSiteKey}
              onToken={receiveTurnstileToken}
              onError={failTurnstile}
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-[var(--foreground)]">{dictionary.commerce.deliveryPromise}</p>
          <button className="button-primary min-h-12 shrink-0" disabled={submitting || verifying || !email || !price} type="submit">
            {submitting || verifying ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LockKeyhole aria-hidden="true" className="size-4" />}
            {verifying
              ? dictionary.commerce.verifying
              : submitting
                ? dictionary.commerce.redirecting
                : `${dictionary.commerce.buyAction} · ${currency} ${price ? (price.amountMinor / 100).toFixed(2) : ""}`}
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
