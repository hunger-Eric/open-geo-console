# Public-search surface certification

The V2 framework certifies one accurately labeled public-search surface. Certification does not claim an AI recommendation, consumer-application behavior, model agreement, ranking causation, or future outcome.

## Current status

The compile-time approved adapter registry is empty. Therefore `npm run public-search:certify` always refuses before network access, no live artifact can currently be created, and staging/production product availability remains closed. Fixture artifacts used by tests are never installable or activatable.

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

The framework commands exist but remain inert without a future approved adapter:

```bash
npm run public-search:certify -- --adapter <approved-id> --locale zh-CN --region CN --output .data/public-search-certification/<artifact>.json
npm run public-search:authority:install -- --artifact .data/public-search-certification/<artifact>.json --reviewed-by <operator>
```

Installation verifies the signature, content hash, environment, capability set, review evidence, and private path, then writes an **inactive** deterministic authority. Activation is a separate reviewed database operation. Environment flags, caller-supplied modules, fixture adapters, and unsigned artifacts cannot activate availability.
