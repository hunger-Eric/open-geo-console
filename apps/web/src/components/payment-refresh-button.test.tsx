import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PaymentRefreshButton } from "./payment-return-banner";

describe("payment refresh button", () => {
  it("has an accessible name at icon-only mobile widths", () => {
    const markup = renderToStaticMarkup(
      <PaymentRefreshButton label="Refresh payment status" loading={false} onClick={vi.fn()} />
    );
    expect(markup).toContain('aria-label="Refresh payment status"');
    expect(markup).toContain('title="Refresh payment status"');
  });
});
