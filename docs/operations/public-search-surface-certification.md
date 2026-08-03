# Public-search surface certification

The V2 framework certifies one accurately labeled public-search surface. Certification does not claim an AI recommendation, consumer-application behavior, model agreement, ranking causation, or future outcome.

## Current status

MiMo is the first compile-time registered adapter. Its latest live artifact is signed with a sensitive protected-Preview HMAC and installed inactive; no authority is active, and catalog, checkout, Worker execution, and production remain fail-closed. Fixture artifacts used by tests are never installable or activatable.

The protected-staging capability probe on 2026-07-13 used the configured `mimo-v2.5-pro` surface without enabling runtime. After raising the bounded search timeout to 30 seconds and reducing certification sampling to three sources, its official-factual, Chinese B2B-discovery, and narrow structured-search cases passed with structured annotations; a subsequent redacted retry also passed. The persistent Preview signing key produced inactive authority `public-search-authority-101c9dbb38db639d7f5b4207f8eb14e9832008672df617858239b6770b546c6e`; schema version is 14 and `OGC_PUBLIC_SEARCH_RUNTIME_ENABLED` remains false. This is not activation or customer readiness.

The independent certification HMAC secret and key ID are stored as sensitive protected-Preview values. They are not committed or retained in a local env file. A previously ephemeral signed artifact is not an activation candidate.

Worker runtime selection is owned only by `OGC_PROVIDER_PROFILE`: `mimo_native` selects the MiMo surface, while `sensenova_anysearch` selects the AnySearch surface and SenseNova grounded-answer synthesis. Explicit probe/certification commands still name one adapter because their artifact identity is adapter-specific. `OGC_PUBLIC_SEARCH_ADAPTER`, when retained during migration, is only a compatibility assertion and cannot select a Worker route. Credential namespaces remain independent with no inheritance or fallback.

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

The redacted per-adapter probe is repeatable capability evidence only. It prints adapter/surface identity, status, source domains, counts, usage, and sanitized error classes. It never prints keys, authorization headers, full provider responses, or generated answer prose; it also never installs or activates authority:

```bash
npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN
npm run public-search:probe -- --adapter anysearch --locale zh-CN --region CN
```

Certification requires every fixed quality case and independent review references for terms, commercial use, and storage/display. A successful probe alone is not certification, and a signed certification artifact alone is not activation:

```bash
npm run public-search:certify -- --adapter mimo --locale zh-CN --region CN --output .data/public-search-certification/mimo.json --reviewed-by <operator> --terms-review-reference <reference> --commercial-use-review-reference <reference> --storage-display-review-reference <reference>
npm run public-search:certify -- --adapter anysearch --locale zh-CN --region CN --output .data/public-search-certification/anysearch.json --reviewed-by <operator> --terms-review-reference <reference> --commercial-use-review-reference <reference> --storage-display-review-reference <reference>
npm run public-search:authority:install -- --artifact .data/public-search-certification/<artifact>.json --reviewed-by <operator>
```

Installation verifies the signature, content hash, environment, capability set, review evidence, and private path, then writes an **inactive** deterministic authority. Activation is a separate reviewed database operation. Environment flags, caller-supplied modules, fixture adapters, and unsigned artifacts cannot activate availability.

## Operations boundaries

- Changing provider credentials or legacy selectors never changes the selected route. Changing `OGC_PROVIDER_PROFILE` takes effect only after a Worker restart and complete pre-claim readiness; new jobs bind the exact model/adapter/authority identity, while incompatible running or resumable work fails rather than switching suppliers automatically.
- A provider outage follows the existing limited/failed/refund path. It never selects a fallback supplier.
- The V2 snapshot resolver records only structured annotations and marks any not-yet-safe-fetched source `not_retrieved`; it cannot make a source-quality claim. The Worker now binds its checkpoint to the lease, retrieves sources through the V2 safe-fetch/robots boundary, and renders the canonical V2 component to a real Chromium PDF before atomic terminalization. It remains disabled until protected-staging paid and failure drills pass.
- Staging acceptance is not production authority. Production activation remains a separate reviewed decision after protected-staging certification, inactive installation, explicit activation, and paid failure-drill evidence.
- MiMo's commercial-use and data-retention terms remain external review gates. Do not use a local probe as proof of contractual rights or search quality.
