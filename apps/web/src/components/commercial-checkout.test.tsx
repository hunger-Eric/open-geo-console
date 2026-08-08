import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n";
import { CheckoutCatalogBoundary, PaidQuestionEditor, resolveCheckoutCatalogPhase } from "./commercial-checkout";

const dictionary = getDictionary("en");

describe("commercial checkout catalog states", () => {
  it("renders a visible non-purchase state while the catalog is loading", () => {
    const html = renderToStaticMarkup(
      <CheckoutCatalogBoundary dictionary={dictionary} phase="loading" />
    );

    expect(html).toContain(dictionary.commerce.offerTitle);
    expect(html).toContain(dictionary.commerce.verifying);
    expect(html).not.toContain("<form");
  });

  it("renders a visible unavailable state without a purchase form", () => {
    const html = renderToStaticMarkup(
      <CheckoutCatalogBoundary dictionary={dictionary} phase="unavailable" reasonCode="commerce_configuration" />
    );

    expect(html).toContain(dictionary.commerce.unavailableConfiguration);
    expect(html).toContain("commerce_configuration");
    expect(html).not.toContain("<form");
  });

  it.each([
    ["commerce_capacity", dictionary.commerce.unavailableCapacity],
    ["commerce_incident", dictionary.commerce.unavailableIncident],
    ["product_authority_unavailable", dictionary.commerce.unavailableProduct],
    ["internal_error", dictionary.commerce.unavailableInternal]
  ] as const)("renders distinct safe state %s", (reasonCode, message) => {
    const html = renderToStaticMarkup(
      <CheckoutCatalogBoundary dictionary={dictionary} phase="unavailable" reasonCode={reasonCode} />
    );
    expect(html).toContain(message);
    expect(html).toContain(reasonCode);
  });

  it("preserves ready purchase controls supplied by the checkout component", () => {
    const html = renderToStaticMarkup(
      <CheckoutCatalogBoundary dictionary={dictionary} phase="ready">
        <form><button type="submit">Checkout</button></form>
      </CheckoutCatalogBoundary>
    );

    expect(html).toContain("<form");
    expect(html).toContain("type=\"submit\"");
  });

  it("classifies only a settled, enabled catalog with a price as ready", () => {
    expect(resolveCheckoutCatalogPhase(null, false)).toBe("loading");
    expect(resolveCheckoutCatalogPhase(null, true)).toBe("unavailable");
    expect(resolveCheckoutCatalogPhase({ enabled: false, prices: [] }, true)).toBe("unavailable");
    expect(resolveCheckoutCatalogPhase({ enabled: true, prices: [] }, true)).toBe("unavailable");
    expect(resolveCheckoutCatalogPhase({
      enabled: true,
      prices: [{ currency: "USD", amountMinor: 9900 }]
    }, true)).toBe("ready");
  });

  it("renders exactly three editable paid-question fields", () => {
    const html = renderToStaticMarkup(<PaidQuestionEditor locale="en" questions={["Q1", "Q2", "Q3"]} onChange={() => undefined} />);
    expect((html.match(/<textarea/gu) ?? [])).toHaveLength(3);
    expect(html).toContain("paid-question-1");
    expect(html).toContain("paid-question-3");
    expect(html).toContain("Q1");
  });
});
