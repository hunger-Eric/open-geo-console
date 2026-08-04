export interface CheckoutPayload {
  code?: "payment_confirmation_pending";
  orderId?: string;
  hpp?: {
    intentId?: string;
    clientSecret?: string;
    currency?: "CNY" | "USD" | "HKD";
    countryCode?: string | null;
    environment?: "demo" | "prod";
  };
  error?: string;
}

const ISO_ALPHA_2_COUNTRY_CODES = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ "
  + "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR "
  + "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP "
  + "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT "
  + "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW "
  + "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG "
  + "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" "));

export function buildCheckoutRequestBody(input: {
  email: string;
  locale: "en" | "zh";
  turnstileToken: string;
  questionSetId: string;
}) {
  return {
    email: input.email,
    locale: input.locale,
    turnstileToken: input.turnstileToken,
    questionSetId: input.questionSetId
  };
}

export function buildHostedPaymentPageOptions(
  hpp: {
    intentId: string;
    clientSecret: string;
    currency: "CNY" | "USD" | "HKD";
    countryCode?: string | null;
  },
  urls: { successUrl: string; cancelUrl: string }
) {
  return {
    intent_id: hpp.intentId,
    client_secret: hpp.clientSecret,
    currency: hpp.currency,
    ...(typeof hpp.countryCode === "string" && ISO_ALPHA_2_COUNTRY_CODES.has(hpp.countryCode)
      ? { country_code: hpp.countryCode }
      : {}),
    successUrl: urls.successUrl,
    cancelUrl: urls.cancelUrl
  };
}

export async function readCheckoutPayload(response: Response): Promise<CheckoutPayload> {
  const body = await response.text();
  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" ? parsed as CheckoutPayload : {};
  } catch {
    return {};
  }
}

export function getPaymentConfirmationReturnUrl(payload: CheckoutPayload, currentUrl: string): string | null {
  if (payload.code !== "payment_confirmation_pending"
    || typeof payload.orderId !== "string"
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.orderId)) return null;
  const url = new URL(currentUrl);
  url.searchParams.delete("order");
  url.searchParams.delete("payment_return");
  url.hash = "";
  url.searchParams.set("order", payload.orderId);
  url.searchParams.set("payment_return", "success");
  return url.href;
}
