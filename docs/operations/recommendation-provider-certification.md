# Recommendation Provider Certification Runbook

Recommendation forensics stays closed until OpenAI Responses Web Search and Perplexity Sonar each produce a reviewed, source-bearing protected-staging artifact and the resulting authority is installed in the staging PostgreSQL database. An adapter commit, API key, fixture, or artifact file does not certify a provider.

## Protected configuration

Use `apps/web/.env.staging.local`; never commit it. Set `OGC_DEPLOYMENT_PROFILE=staging`, a staging `DATABASE_URL`, and non-live commerce. Configure independent credentials and exact surfaces:

- OpenAI: `OGC_ANSWER_OPENAI_API_KEY`, `OGC_ANSWER_OPENAI_MODEL`, `OGC_ANSWER_OPENAI_LOCALE`, `OGC_ANSWER_OPENAI_REGION`.
- Perplexity: `OGC_ANSWER_PERPLEXITY_API_KEY`, `OGC_ANSWER_PERPLEXITY_MODEL` (`sonar`, `sonar-pro`, `sonar-deep-research`, or `sonar-reasoning-pro`), `OGC_ANSWER_PERPLEXITY_LOCALE`, `OGC_ANSWER_PERPLEXITY_REGION`.
- Artifact signing: an independent random `OGC_RECOMMENDATION_CERTIFICATION_SIGNING_SECRET` of at least 32 bytes, a current `OGC_RECOMMENDATION_CERTIFICATION_SIGNING_KEY_ID`, and `OGC_RECOMMENDATION_CERTIFICATION_SIGNING_VERSION=v1`. Never reuse model, token, payment, email, or access secrets.
- Keep `OGC_RECOMMENDATION_RUNTIME_ENABLED=false`, `OGC_RECOMMENDATION_OPERATOR_ENABLED=false`, and `OGC_RECOMMENDATION_PUBLIC_ENABLED=false` during certification.

Current certification supports locale `en` or `zh` and region `global` only. Perplexity sends both `language_preference` and `search_language_filter` using that explicit locale. Non-global location claims remain unsupported until official provider location mapping is implemented and the resulting surface is separately certified.

Use a reserved certification site or an operator-approved public test site. Use a non-brand purchase question that does not name the site or customer. The command refuses missing credentials before a provider request, requires the staging database marker, records the normalized cell and bounded cost metadata, retrieves provider sources through the SSRF/robots-safe crawler, and creates a new file without overwriting an earlier artifact.

```powershell
npm run recommendation:certify -- --provider openai --model <exact-model> --locale en --region global --site https://<test-site>/ --question "Which supplier is suitable for this export requirement?" --output .data/recommendation-certification/openai.json
npm run recommendation:certify -- --provider perplexity --model sonar-pro --locale en --region global --site https://<test-site>/ --question "Which supplier is suitable for this export requirement?" --output .data/recommendation-certification/perplexity.json
```

Artifacts may be written only as direct files in the ignored `.data/recommendation-certification/` directory. The command rejects nested paths, parent escapes, symlinks and junctions; creates rather than overwrites; attempts file mode `0600`; and emits a Windows ACL review warning where POSIX mode is not authoritative. Logs contain the artifact path and hash, never the answer or excerpt. Do not move artifacts into a tracked repository path.

`--dry-fixture` exercises artifact formatting only and accepts only reserved `.example`, `.test`, or `.invalid` sites. Its output is `dry_fixture`, `candidate_uncertified`, and `installable=false`; the install command always rejects it.

## Human review and installation

For each artifact, review current provider commercial/storage/display terms, confirm the report label describes the developer API rather than a consumer app, and inspect the returned answer, citations, safe-retrieval results, locale, region, model, usage, and errors. Installation is an explicit operator attestation, not an automatic continuation of certification.

Set the separately reviewed `OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON`, then install both immutable artifacts:

```powershell
npm run recommendation:authority:install -- --artifact .data/recommendation-certification/openai.json --artifact .data/recommendation-certification/perplexity.json --reviewed-by <operator-id> --terms-reviewed --surface-reviewed --evidence-reviewed
```

The command verifies each content hash and HMAC before and after schema normalization with the current signing key ID, requires two distinct live providers with safely retrieved source text and hashes, deterministically constructs the certification authority, and writes it through the staging database authority boundary. Reinstalling the same artifacts produces the identical authority version, capture time, and snapshot. Copy the emitted `authority` JSON into the protected `OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON` value. Do not put it in ordinary report payloads.

Rotate the signing key by generating a new independent secret and key ID, updating protected staging, and recertifying both providers. Old artifacts intentionally fail against the current key and cannot be mixed with new artifacts. Keep retired secrets outside application runtime; retaining them for audit is an operator key-custody decision, never a report payload.

## Staging paid drill

After both authorities are installed and protected environment values exactly match them, set `OGC_RECOMMENDATION_RUNTIME_ENABLED=true` and `OGC_RECOMMENDATION_OPERATOR_ENABLED=true` only in protected staging. Restart Web and deep Worker, verify the catalog opens only for the operator lane, then run a paid Sandbox order through Webhook, deep fulfillment, private HTML/PDF, report-ready email, and credit settlement.

Run failure drills before any public flag: remove one key, drift one model/locale/region, remove the authority JSON, use an unpersisted authority version, tamper with an artifact, submit one dry fixture, make one provider unavailable, and make one source robots-inaccessible. Expected behavior is respectively zero/one registered adapter, closed product, rejected install, or truthful limited/failed commercial outcome. `OGC_RECOMMENDATION_PUBLIC_ENABLED` remains false until the full paid drill and refund/email invariants pass.
