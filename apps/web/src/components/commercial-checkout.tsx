"use client";

import { Check, Loader2, LockKeyhole } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Dictionary, Locale } from "@/i18n";
import {
  buildCheckoutRequestBody,
  getPaymentConfirmationReturnUrl,
  getStripeCheckoutRedirect,
  readCheckoutPayload,
} from "./checkout-response";
import {
  fetchPaymentReturnStatus,
  getPaymentReturnContext,
  shouldHidePurchaseControls,
  type PublicOrderStatus
} from "./payment-return";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";

type Currency = "CNY" | "USD" | "HKD";
export type CatalogReasonCode =
  | "commerce_disabled" | "commerce_configuration" | "commerce_capacity" | "commerce_incident"
  | "product_disabled" | "product_environment" | "product_runtime_incomplete"
  | "product_authority_unavailable" | "product_authority_mismatch" | "internal_error";
export interface CatalogPayload {
  enabled: boolean;
  mode: "disabled" | "test" | "live";
  reasonCode: CatalogReasonCode | null;
  prices: Array<{ currency: Currency; amountMinor: number }>;
  turnstileSiteKey: string | null;
}
interface BusinessQuestionPayload {
  id: string;
  questions: Array<{ purpose: string; generatedText: string; privateText?: string }>;
}

export function CommercialCheckout({ dictionary, locale, reportId }: { dictionary: Dictionary; locale: Locale; reportId: string }) {
  return <Suspense fallback={null}>
    <CommercialCheckoutContent dictionary={dictionary} locale={locale} reportId={reportId} />
  </Suspense>;
}

function CommercialCheckoutContent({ dictionary, locale, reportId }: { dictionary: Dictionary; locale: Locale; reportId: string }) {
  const searchParams = useSearchParams();
  const returnContext = useMemo(() => getPaymentReturnContext(searchParams), [searchParams]);
  const [returnResult, setReturnResult] = useState<{ orderId: string; status: PublicOrderStatus } | null>(null);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [catalogSettled, setCatalogSettled] = useState(false);
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionSetId, setQuestionSetId] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const pendingCheckout = useRef(false);
  const checkoutIdempotencyKey = useRef("");

  useEffect(() => {
    if (!returnContext) return;
    const controller = new AbortController();
    void fetchPaymentReturnStatus(
      `/api/reports/${encodeURIComponent(reportId)}/orders/${encodeURIComponent(returnContext.orderId)}/status`,
      { signal: controller.signal }
    )
      .then(async (response) => response.ok ? response.json() as Promise<PublicOrderStatus> : null)
      .then((status) => { if (status) setReturnResult({ orderId: returnContext.orderId, status }); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [reportId, returnContext]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/commerce/catalog", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogPayload> : null)
      .then((value) => {
        if (value) setCatalog(value);
        setCatalogSettled(true);
      })
      .catch(() => { if (!controller.signal.aborted) setCatalogSettled(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/reports/${reportId}/business-questions`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to prepare the three business questions.");
        return response.json() as Promise<BusinessQuestionPayload>;
      })
      .then((value) => {
        if (value.questions.length !== 3) throw new Error("The business question contract is incomplete.");
        setQuestionSetId(value.id);
        setQuestions(value.questions.map((question) => question.privateText ?? question.generatedText));
      })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to prepare business questions."); });
    return () => controller.abort();
  }, [reportId]);

  const price = catalog?.prices[0];
  const returnStatus = returnResult && returnContext && returnResult.orderId === returnContext.orderId ? returnResult.status : null;
  const hidePurchaseControls = shouldHidePurchaseControls(returnContext, returnStatus);
  const catalogPhase = resolveCheckoutCatalogPhase(catalog, catalogSettled);
  if (catalogPhase !== "ready" || !catalog) {
    return <CheckoutCatalogBoundary dictionary={dictionary} phase={catalogPhase} reasonCode={catalog?.reasonCode ?? null} />;
  }

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
      if (!questionSetId || questions.length !== 3 || questions.some((question) => !question.trim())) {
        throw new Error(locale === "zh" ? "请先确认三个付费报告问题。" : "Confirm all three paid-report questions first.");
      }
      const response = await postConfirmedCheckout(fetch, {
        reportId, questionSetId, questions, email, locale, turnstileToken: token,
        idempotencyKey: checkoutIdempotencyKey.current
      });
      const payload = await readCheckoutPayload(response);
      const confirmationReturnUrl = getPaymentConfirmationReturnUrl(payload, window.location.href);
      if (confirmationReturnUrl) {
        window.location.assign(confirmationReturnUrl);
        return;
      }
      const checkoutUrl = getStripeCheckoutRedirect(payload);
      if (!response.ok || !checkoutUrl) {
        throw new Error(payload.code === "payment_confirmation_pending"
          ? dictionary.commerce.paymentConfirming
          : payload.error ?? dictionary.commerce.checkoutFailed);
      }
      window.location.assign(checkoutUrl);
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
      <div className="mt-5 grid gap-4">
        <div>
          <h4 className="text-sm font-semibold">{locale === "zh" ? "确认付费报告的三个问题" : "Confirm three questions for the paid report"}</h4>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{locale === "zh" ? "这三个问题由大模型另外生成。你可以修改；确认成功后才会进入付款。" : "These are generated separately for the paid report. Edit them as needed; checkout starts only after confirmation succeeds."}</p>
        </div>
        <PaidQuestionEditor locale={locale} questions={questions} onChange={(next) => {
          setQuestions(next);
          checkoutIdempotencyKey.current = "";
        }} />
      </div>
      {!hidePurchaseControls ? <form onSubmit={checkout} className="mt-5 grid gap-4">
        <label className="text-sm font-semibold">
          {dictionary.commerce.emailLabel}
          <input className="input-control mt-2 w-full" type="email" required autoComplete="email" value={email} onChange={(event) => {
            setEmail(event.target.value);
            checkoutIdempotencyKey.current = "";
          }} />
        </label>
        {catalog.turnstileSiteKey ? (
          <div>
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={catalog.turnstileSiteKey}
              onToken={receiveTurnstileToken}
              onError={failTurnstile}
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-[var(--foreground)]">{dictionary.commerce.deliveryPromise}</p>
          <button className="button-primary min-h-12 shrink-0" disabled={submitting || verifying || !email || !price || questions.length !== 3 || questions.some((question) => !question.trim())} type="submit">
            {submitting || verifying ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LockKeyhole aria-hidden="true" className="size-4" />}
            {verifying
              ? dictionary.commerce.verifying
              : submitting
                ? dictionary.commerce.redirecting
                : `${dictionary.commerce.buyAction} · ${price?.currency ?? ""} ${price ? (price.amountMinor / 100).toFixed(2) : ""}`}
          </button>
        </div>
      </form> : null}
      {!hidePurchaseControls && catalog.mode === "test" ? <p className="mt-3 text-xs text-[var(--muted)]">Sandbox / test mode</p> : null}
      {error ? <p className="mt-3 text-sm text-[var(--red)]" role="alert">{error}</p> : null}
    </section>
  );
}

export async function postConfirmedCheckout(
  fetcher: typeof fetch,
  input: {
    reportId: string;
    questionSetId: string;
    questions: readonly string[];
    email: string;
    locale: Locale;
    turnstileToken: string;
    idempotencyKey: string;
  }
): Promise<Response> {
  const confirmationResponse = await fetcher(`/api/reports/${input.reportId}/business-questions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      questionSetId: input.questionSetId,
      questions: input.questions,
      acknowledgedLowConfidence: true
    })
  });
  const confirmed = await confirmationResponse.json() as { id?: string; error?: string };
  if (!confirmationResponse.ok || confirmed.id !== input.questionSetId) {
    throw new Error(confirmed.error ?? (input.locale === "zh" ? "无法确认付费报告问题。" : "Unable to confirm the paid-report questions."));
  }
  return fetcher(`/api/reports/${input.reportId}/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(buildCheckoutRequestBody(input))
  });
}

export function PaidQuestionEditor({ locale, questions, onChange }: {
  locale: Locale;
  questions: readonly string[];
  onChange: (questions: string[]) => void;
}) {
  return <ol className="grid gap-3">
    {questions.map((question, index) => <li className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm" key={index}>
      <label className="font-semibold text-[var(--teal)]" htmlFor={`paid-question-${index + 1}`}>{locale === "zh" ? `问题 ${index + 1}` : `Question ${index + 1}`}</label>
      <textarea className="input-control min-h-24 w-full resize-y" id={`paid-question-${index + 1}`} maxLength={500} required value={question} onChange={(event) => {
        const next = [...questions];
        next[index] = event.target.value;
        onChange(next);
      }} />
    </li>)}
  </ol>;
}
export type CheckoutCatalogPhase = "loading" | "unavailable" | "ready";

export function resolveCheckoutCatalogPhase(
  catalog: Pick<CatalogPayload, "enabled" | "prices"> | null,
  settled: boolean
): CheckoutCatalogPhase {
  if (!settled) return "loading";
  return catalog?.enabled && catalog.prices.length > 0 ? "ready" : "unavailable";
}

export function CheckoutCatalogBoundary({
  children,
  dictionary,
  phase,
  reasonCode = null
}: {
  children?: ReactNode;
  dictionary: Dictionary;
  phase: CheckoutCatalogPhase;
  reasonCode?: CatalogReasonCode | null;
}) {
  if (phase === "ready") return <>{children}</>;
  return (
    <section aria-live="polite" className="mt-7 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        {phase === "loading"
          ? <Loader2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin" />
          : <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
        <div>
          <h3 className="font-display text-xl font-black tracking-[-0.03em]">{dictionary.commerce.offerTitle}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {phase === "loading" ? dictionary.commerce.verifying : catalogUnavailableMessage(dictionary, reasonCode)}
          </p>
          {phase === "unavailable" && reasonCode ? <code className="mt-2 block text-xs text-[var(--muted)]">{reasonCode}</code> : null}
        </div>
      </div>
    </section>
  );
}

function catalogUnavailableMessage(dictionary: Dictionary, reasonCode: CatalogReasonCode | null): string {
  if (reasonCode === "commerce_disabled" || reasonCode === "commerce_configuration") return dictionary.commerce.unavailableConfiguration;
  if (reasonCode === "commerce_capacity") return dictionary.commerce.unavailableCapacity;
  if (reasonCode === "commerce_incident") return dictionary.commerce.unavailableIncident;
  if (reasonCode?.startsWith("product_")) return dictionary.commerce.unavailableProduct;
  if (reasonCode === "internal_error") return dictionary.commerce.unavailableInternal;
  return dictionary.commerce.unavailable;
}
