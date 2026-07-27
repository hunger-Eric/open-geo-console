# Two-way transactional email design

Date: 2026-07-12
Status: approved direction; implementation not started

## Goal

Open GEO Console email must be a durable customer conversation entry point, not a one-way notification channel. Resend remains the delivery provider, while replies go to a mailbox operated in the existing `itheheda.online` Cloud Mail system.

The approved identities are:

- automated sender: `Open GEO Console <reports@itheheda.online>`
- customer reply mailbox: `support@itheheda.online`
- protected-staging recipient: `admin@itheheda.online`
- production recipient: the encrypted customer address captured by the paid order

## Approaches considered

### Resend delivery plus self-hosted reply mailbox — selected

Resend sends transactional mail and reports delivery events. Every message carries `Reply-To: support@itheheda.online`, so a normal customer reply enters Cloud Mail. This preserves provider delivery telemetry without making Resend the support inbox.

### Direct self-hosted SMTP

This gives full transport control, but the product would also own SMTP authentication, rate limits, retries, reputation, bounce handling, and provider-specific failure behavior. It is unnecessary for the current product boundary.

### Gmail SMTP or Gmail API

This can prove that a message reaches a second mailbox, but it introduces an App Password or OAuth lifecycle and does not certify the production Resend delivery/Webhook path. It is suitable only as a temporary transport experiment and is not selected.

## Configuration contract

The existing Resend configuration remains authoritative:

```env
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="Open GEO Console <reports@itheheda.online>"
RESEND_WEBHOOK_SECRET="whsec_..."
```

Add one required reply address:

```env
OGC_REPLY_TO_EMAIL="support@itheheda.online"
```

Protected staging continues to fail closed unless it has a single redirect recipient:

```env
OGC_TEST_EMAIL_RECIPIENT="admin@itheheda.online"
```

`OGC_REPLY_TO_EMAIL` is the same in staging and production so replies always enter the monitored support mailbox. Staging rewrites only the envelope recipient; it does not rewrite `From` or `Reply-To`.

## Sending flow

1. PostgreSQL creates an idempotent commercial email delivery for payment confirmation, report readiness, refund, assistance, or link reissue.
2. The commerce process decrypts the order recipient only at send time.
3. In protected test mode, `resolveEnvelopeRecipient` replaces that recipient with `admin@itheheda.online`. Production retains the real order recipient.
4. `ResendEmailGateway` renders the existing localized template and sends `from`, `to`, `reply_to`, `subject`, `html`, and `text` with the durable business idempotency key.
5. A customer clicking Reply addresses `support@itheheda.online`; no customer reply is ingested into PostgreSQL in this scope.
6. Resend delivery Webhooks continue to update sent, delivered, bounced, and failed transport state independently of human support replies.

## Code boundaries

- `apps/web/src/email/resend.ts` owns validation and the Resend `reply_to` request field.
- `apps/web/src/email/gateway.ts` remains provider-neutral; the reply address is deployment configuration rather than per-message business data, so `SendEmailInput` does not need a new customer-controlled field.
- `apps/web/src/commerce/readiness.ts` treats `OGC_REPLY_TO_EMAIL` as required for live commerce. Test commerce also fails before network I/O when it is absent or malformed.
- `apps/web/src/email/resend.test.ts` proves the exact sender, redirected staging recipient, reply address, production recipient behavior, and fail-closed validation.
- Operator documentation lists the Cloud Mail aliases/mailboxes and the Resend domain-verification requirement. No mailbox password, API key, Webhook secret, or raw customer address is persisted in documentation or logs.

No database migration is required. Existing queued deliveries can be retried after configuration because the reply address is resolved at send time and the business idempotency key is unchanged.

## Mailbox and DNS operations

Cloud Mail must provide `reports@itheheda.online` and `support@itheheda.online` as mailboxes or aliases. Both may initially forward into `admin@itheheda.online`, but the externally visible identities remain distinct.

Resend must verify `itheheda.online` before `reports@itheheda.online` is used as the sender. Existing MX records for receiving mail remain under Cloud Mail; Resend's required sending-domain DNS records must be added without replacing the receiving MX configuration.

## Failure and security behavior

- Missing or malformed `OGC_REPLY_TO_EMAIL` fails before calling Resend.
- A Resend 4xx remains a permanent delivery failure except for the existing retryable statuses; transient failures retain the existing retry schedule.
- Staging never sends to the customer-supplied address. It always redirects to `admin@itheheda.online`.
- Production never consults `OGC_TEST_EMAIL_RECIPIENT` for envelope routing.
- Customer replies remain in Cloud Mail and are handled by a human. Automatic support-ticket ingestion, autoresponders, mailbox reading, and refund authorization from inbound mail are explicitly out of scope.
- An email reply is not payment, refund, access, or fulfillment authority. Those states remain controlled by signed provider events and PostgreSQL workflows.

## Acceptance

Automated tests must prove:

- every Resend request contains the configured `reply_to` value;
- protected test mode sends only to `admin@itheheda.online` even when the order contains another address;
- production sends to the order recipient;
- missing or invalid sender, reply address, test recipient, or API key fails closed without network I/O;
- existing idempotency and localized template behavior is unchanged.

Protected-staging acceptance must then prove:

1. the existing queued payment-confirmation and report-ready deliveries are sent through Resend;
2. both messages arrive at `admin@itheheda.online`;
3. Reply opens a message addressed to `support@itheheda.online`;
4. a real reply appears in the Cloud Mail support inbox;
5. the Resend signed delivery event is accepted and the PostgreSQL delivery state reaches `delivered`;
6. no raw credential or customer address appears in logs or committed files.

## Out of scope

- replacing Resend with Gmail or self-hosted SMTP;
- reading or classifying inbound support mail;
- automatically approving refunds from a reply;
- customer support tickets, CRM synchronization, or autoresponders;
- changing report access, payment, refund, or fulfillment authority.
