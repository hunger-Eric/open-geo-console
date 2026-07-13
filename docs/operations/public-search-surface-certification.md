# Public-search surface certification

The V2 framework certifies one accurately labeled public-search surface. Certification does not claim an AI recommendation, consumer-application behavior, model agreement, ranking causation, or future outcome.

## Current status

MiMo is the first compile-time registered adapter. This is only code registration: no live certification artifact has been accepted, no authority is active, and catalog, checkout, Worker execution, and production remain fail-closed. Fixture artifacts used by tests are never installable or activatable.

MiMo is selected only by `OGC_PUBLIC_SEARCH_ADAPTER=mimo` and reads only `OGC_PUBLIC_SEARCH_MIMO_BASE_URL`, `OGC_PUBLIC_SEARCH_MIMO_API_KEY`, and `OGC_PUBLIC_SEARCH_MIMO_MODEL`. Its configuration is independent from the report-generation `OGC_AI_*` namespace; identical secret values may be supplied deliberately, but there is no inheritance or fallback.

## Framework boundary

An eventual separately reviewed adapter must produce an immutable artifact covering exact provider/product/surface/adapter versions, locale and region capabilities, commercial-use terms, storage/display rights, provenance and error semantics, bounded request/result/timeout/cost behavior, reviewer identity, environment, signing key identity, payload hash, and HMAC signature.

Signing configuration is independent from model, token, payment, access, and runtime credentials:

```text
OGC_PUBLIC_SEARCH_CERTIFICATION_SIGNING_SECRET
OGC_PUBLIC_SEARCH_CERTIFICATION_SIGNING_KEY_ID
OGC_PUBLIC_SEARCH_CERTIFICATION_SIGNING_VERSION=v1
```

Artifacts must be regular private files directly under `.data/public-search-certification/`; symlinks, junctions, traversal, and nested paths are rejected.

## Commands

The redacted MiMo probe is repeatable capability evidence only. It prints adapter/surface identity, status, source domains, counts, usage, and sanitized error classes. It never prints keys, authorization headers, full provider responses, or generated answer prose; it also never installs or activates authority:

```bash
npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN
```

Certification requires every fixed quality case and independent review references for terms, commercial use, and storage/display. A successful probe alone is not certification, and a signed certification artifact alone is not activation:

```bash
npm run public-search:certify -- --adapter mimo --locale zh-CN --region CN --output .data/public-search-certification/mimo.json --reviewed-by <operator> --terms-review-reference <reference> --commercial-use-review-reference <reference> --storage-display-review-reference <reference>
npm run public-search:authority:install -- --artifact .data/public-search-certification/<artifact>.json --reviewed-by <operator>
```

Installation verifies the signature, content hash, environment, capability set, review evidence, and private path, then writes an **inactive** deterministic authority. Activation is a separate reviewed database operation. Environment flags, caller-supplied modules, fixture adapters, and unsigned artifacts cannot activate availability.

## Operations boundaries

- Changing the report-generation model never changes the selected public-search adapter. Changing `OGC_PUBLIC_SEARCH_ADAPTER` takes effect only after a Worker restart, and new jobs bind the exact adapter/authority identity; running or resumable work never switches suppliers automatically.
- A provider outage follows the existing limited/failed/refund path. It never selects a fallback supplier.
- Staging acceptance is not production authority. Production activation remains a separate reviewed decision after protected-staging certification, inactive installation, explicit activation, and paid failure-drill evidence.
- MiMo's commercial-use and data-retention terms remain external review gates. Do not use a local probe as proof of contractual rights or search quality.
