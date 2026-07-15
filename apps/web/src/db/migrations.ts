// Idempotent bootstrap for self-hosted deployments. A future migration runner can
// execute the same statements and then take ownership of schema versioning.
export const V9_DATABASE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS deployment_environment (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
    profile text NOT NULL CHECK (profile IN ('staging','production')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS scan_reports (
    id text PRIMARY KEY,
    url text NOT NULL,
    site_key text,
    kind text NOT NULL DEFAULT 'geo',
    score integer,
    payload jsonb NOT NULL,
    report_locale text CONSTRAINT scan_reports_report_locale_check CHECK (report_locale IS NULL OR report_locale IN ('en','zh')),
    locale_correction_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS report_locale text`,
  `ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS locale_correction_used_at timestamptz`,
  `CREATE INDEX IF NOT EXISTS scan_reports_created_at_idx ON scan_reports (created_at)`,
  `CREATE INDEX IF NOT EXISTS scan_reports_site_key_idx ON scan_reports (site_key)`,
  `CREATE TABLE IF NOT EXISTS report_bot_evidence (
    report_id text PRIMARY KEY REFERENCES scan_reports(id) ON DELETE CASCADE,
    summary jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS scan_jobs (
    id text PRIMARY KEY,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE CASCADE,
    tier text NOT NULL CHECK (tier IN ('free', 'deep')),
    product_contract text NOT NULL DEFAULT 'legacy_website_audit_v1'
      CONSTRAINT scan_jobs_product_contract_check
      CHECK (product_contract IN ('legacy_website_audit_v1','recommendation_forensics_v1')),
    locale text NOT NULL CONSTRAINT scan_jobs_locale_check CHECK (locale IN ('en','zh')),
    reason text NOT NULL DEFAULT 'standard' CONSTRAINT scan_jobs_reason_check CHECK (reason IN ('standard','system_recovery','locale_correction','staging_regeneration','paid_report_correction','staging_artifact_refresh')),
    stage text NOT NULL DEFAULT 'queued' CONSTRAINT scan_jobs_stage_check CHECK (stage IN ('queued','discovering','planning','fetching','analyzing','synthesizing','completed','completed_limited','failed')),
    progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
    planned_pages integer NOT NULL DEFAULT 0 CHECK (planned_pages >= 0),
    successful_pages integer NOT NULL DEFAULT 0 CHECK (successful_pages >= 0),
    failed_pages integer NOT NULL DEFAULT 0 CHECK (failed_pages >= 0),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    lease_owner text,
    lease_expires_at timestamptz,
    error_code text,
    public_error text,
    credit_reservation_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS product_contract text NOT NULL DEFAULT 'legacy_website_audit_v1'`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_product_contract_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_product_contract_check
    CHECK (product_contract IN ('legacy_website_audit_v1','recommendation_forensics_v1'))`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'standard'`,
  `CREATE INDEX IF NOT EXISTS scan_jobs_claim_idx ON scan_jobs (stage, lease_expires_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS scan_jobs_tier_queue_idx ON scan_jobs (tier, stage, created_at, id)`,
  `CREATE INDEX IF NOT EXISTS scan_jobs_tier_lease_idx ON scan_jobs (tier, lease_expires_at)`,
  `CREATE INDEX IF NOT EXISTS scan_jobs_report_idx ON scan_jobs (report_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS ai_reports (
    id text PRIMARY KEY,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE CASCADE,
    job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
    tier text NOT NULL CHECK (tier IN ('free', 'deep')),
    locale text NOT NULL,
    report_version integer NOT NULL DEFAULT 1,
    payload jsonb NOT NULL,
    model text NOT NULL,
    prompt_version text NOT NULL,
    content_hash text NOT NULL,
    is_private boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (report_id, tier)
  )`,
  `CREATE INDEX IF NOT EXISTS ai_reports_job_idx ON ai_reports (job_id)`,
  `ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS technical_payload jsonb`,
  `UPDATE scan_reports reports
   SET report_locale = COALESCE(
     (
       SELECT ai.locale
       FROM ai_reports ai
       WHERE ai.report_id = reports.id AND ai.locale IN ('en','zh')
       ORDER BY CASE WHEN ai.tier = 'deep' THEN 0 ELSE 1 END, ai.updated_at DESC
       LIMIT 1
     ),
     (
       SELECT job.locale
       FROM scan_jobs job
       WHERE job.report_id = reports.id AND job.locale IN ('en','zh')
       ORDER BY job.created_at DESC
       LIMIT 1
     )
   )
   WHERE reports.report_locale IS NULL`,
  `ALTER TABLE scan_reports DROP CONSTRAINT IF EXISTS scan_reports_report_locale_check`,
  `ALTER TABLE scan_reports ADD CONSTRAINT scan_reports_report_locale_check
   CHECK (report_locale IS NULL OR report_locale IN ('en','zh'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_locale_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_locale_check CHECK (locale IN ('en','zh'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_reason_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_reason_check
   CHECK (reason IN ('standard','system_recovery','locale_correction','staging_regeneration','paid_report_correction','staging_artifact_refresh'))`,
  `CREATE TABLE IF NOT EXISTS crawl_evidence (
    id text PRIMARY KEY,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE CASCADE,
    job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
    url text NOT NULL,
    canonical_url text,
    page_type text,
    fetch_status text NOT NULL,
    http_status integer,
    content_hash text,
    normalized_content text,
    evidence_excerpts jsonb NOT NULL DEFAULT '[]'::jsonb,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    content_expires_at timestamptz NOT NULL,
    UNIQUE (job_id, url)
  )`,
  `CREATE INDEX IF NOT EXISTS crawl_evidence_expiry_idx ON crawl_evidence (content_expires_at)`,
  `CREATE TABLE IF NOT EXISTS free_site_trials (
    site_key text PRIMARY KEY,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE CASCADE,
    job_id text REFERENCES scan_jobs(id) ON DELETE SET NULL,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS staging_free_regenerations (
    site_key text PRIMARY KEY,
    reservation_id text NOT NULL UNIQUE,
    report_id text REFERENCES scan_reports(id) ON DELETE SET NULL,
    job_id text REFERENCES scan_jobs(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS anonymous_rate_buckets (
    ip_hash text NOT NULL,
    bucket_date date NOT NULL,
    site_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ip_hash, bucket_date, site_key)
  )`,
  `CREATE INDEX IF NOT EXISTS anonymous_rate_ip_date_idx ON anonymous_rate_buckets (ip_hash, bucket_date)`,
  `CREATE TABLE IF NOT EXISTS access_keys (
    id text PRIMARY KEY,
    key_prefix text NOT NULL,
    key_hmac text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','exhausted')),
    credits_remaining integer NOT NULL CHECK (credits_remaining >= 0),
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS access_keys_prefix_idx ON access_keys (key_prefix)`,
  `CREATE TABLE IF NOT EXISTS credit_ledger (
    id text PRIMARY KEY,
    access_key_id text NOT NULL REFERENCES access_keys(id) ON DELETE RESTRICT,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
    job_id text REFERENCES scan_jobs(id) ON DELETE SET NULL,
    idempotency_key text NOT NULL,
    credits integer NOT NULL DEFAULT 1 CHECK (credits > 0),
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','settled','refunded')),
    reserved_at timestamptz NOT NULL DEFAULT now(),
    settled_at timestamptz,
    refunded_at timestamptz,
    UNIQUE (access_key_id, idempotency_key)
  )`,
  `CREATE INDEX IF NOT EXISTS credit_ledger_report_idx ON credit_ledger (report_id)`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_stage_check`,
  `WITH migrated_jobs AS (
     UPDATE scan_jobs jobs
     SET stage = CASE
       WHEN EXISTS (SELECT 1 FROM ai_reports ai WHERE ai.job_id = jobs.id) THEN 'completed_limited'
       ELSE 'failed'
     END,
     progress = CASE
       WHEN EXISTS (SELECT 1 FROM ai_reports ai WHERE ai.job_id = jobs.id) THEN 100
       ELSE progress
     END,
     lease_owner = NULL,
     lease_expires_at = NULL,
     updated_at = now()
     WHERE jobs.stage = 'partial'
     RETURNING jobs.credit_reservation_id
   ), refunded AS (
     UPDATE credit_ledger ledger
     SET status = 'refunded', refunded_at = now(), settled_at = NULL
     FROM migrated_jobs
     WHERE ledger.id = migrated_jobs.credit_reservation_id AND ledger.status = 'reserved'
     RETURNING ledger.access_key_id, ledger.credits
   )
   UPDATE access_keys access
   SET credits_remaining = access.credits_remaining + refunded.credits,
       status = CASE WHEN access.status = 'exhausted' THEN 'active' ELSE access.status END
   FROM refunded
   WHERE access.id = refunded.access_key_id`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_stage_check
   CHECK (stage IN ('queued','discovering','planning','fetching','analyzing','synthesizing','completed','completed_limited','failed'))`,
  `CREATE TABLE IF NOT EXISTS report_access_tokens (
    id text PRIMARY KEY,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE CASCADE,
    token_prefix text NOT NULL,
    token_hmac text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    last_used_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS report_access_tokens_report_idx ON report_access_tokens (report_id)`,
  `ALTER TABLE report_access_tokens ADD COLUMN IF NOT EXISTS artifact_scope text NOT NULL DEFAULT 'legacy_website_audit_v1'`,
  `ALTER TABLE report_access_tokens DROP CONSTRAINT IF EXISTS report_access_tokens_artifact_scope_check`,
  `ALTER TABLE report_access_tokens ADD CONSTRAINT report_access_tokens_artifact_scope_check
   CHECK (artifact_scope IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1'))`,
  `CREATE INDEX IF NOT EXISTS report_access_tokens_report_scope_idx ON report_access_tokens (report_id, artifact_scope)`,
  `CREATE TABLE IF NOT EXISTS payment_orders (
    id text PRIMARY KEY,
    checkout_idempotency_hmac text NOT NULL UNIQUE,
    provider text NOT NULL CHECK (provider IN ('airwallex','stripe')),
    provider_checkout_id text,
    provider_payment_id text,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
    fulfillment_job_id text REFERENCES scan_jobs(id) ON DELETE RESTRICT,
    site_key text NOT NULL,
    customer_email_encrypted text NOT NULL,
    customer_email_hmac text NOT NULL,
    email_key_version text NOT NULL,
    product_code text NOT NULL,
    catalog_version text NOT NULL,
    terms_version text NOT NULL,
    refund_policy_version text NOT NULL,
    report_locale text NOT NULL CHECK (report_locale IN ('en','zh')),
    currency text NOT NULL CHECK (currency IN ('CNY','USD','HKD')),
    amount_minor integer NOT NULL CHECK (amount_minor > 0),
    tax_amount_minor integer CHECK (tax_amount_minor IS NULL OR tax_amount_minor >= 0),
    payment_status text NOT NULL DEFAULT 'created' CHECK (payment_status IN ('created','pending','paid','failed','cancelled')),
    fulfillment_status text NOT NULL DEFAULT 'not_started' CHECK (fulfillment_status IN ('not_started','queued','processing','completed','completed_limited','failed')),
    refund_status text NOT NULL DEFAULT 'not_required' CHECK (refund_status IN ('not_required','pending','submitted','refunded','failed')),
    delivery_status text NOT NULL DEFAULT 'not_queued' CHECK (delivery_status IN ('not_queued','queued','sent','delivered','bounced','failed')),
    courtesy_non_billable boolean NOT NULL DEFAULT false,
    paid_at timestamptz,
    delivery_deadline_at timestamptz,
    fulfilled_at timestamptz,
    refunded_at timestamptz,
    legacy_retirement_cutoff_at timestamptz,
    legacy_retired_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS legacy_retirement_cutoff_at timestamptz`,
  `ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS legacy_retired_at timestamptz`,
  `ALTER TABLE credit_ledger DROP COLUMN IF EXISTS legacy_retirement_cutoff_at`,
  `ALTER TABLE credit_ledger DROP COLUMN IF EXISTS legacy_retired_at`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_checkout_uidx
   ON payment_orders (provider, provider_checkout_id) WHERE provider_checkout_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_payment_uidx
   ON payment_orders (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_fulfillment_job_uidx
   ON payment_orders (fulfillment_job_id) WHERE fulfillment_job_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_report_active_product_uidx
   ON payment_orders (report_id, product_code)
   WHERE payment_status IN ('created','pending','paid')`,
  `CREATE INDEX IF NOT EXISTS payment_orders_email_hmac_idx
   ON payment_orders (customer_email_hmac, created_at)`,
  `CREATE INDEX IF NOT EXISTS payment_orders_sla_idx
   ON payment_orders (fulfillment_status, delivery_deadline_at)`,
  `CREATE TABLE IF NOT EXISTS payment_events (
    id text PRIMARY KEY,
    provider text NOT NULL CHECK (provider IN ('airwallex','stripe')),
    provider_event_id text NOT NULL,
    event_type text NOT NULL,
    order_id text REFERENCES payment_orders(id) ON DELETE RESTRICT,
    provider_created_at timestamptz,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received','processed','ignored','failed')),
    payload_hash text NOT NULL,
    selected_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_code text,
    UNIQUE (provider, provider_event_id)
  )`,
  `CREATE INDEX IF NOT EXISTS payment_events_order_idx ON payment_events (order_id, received_at)`,
  `CREATE TABLE IF NOT EXISTS payment_refunds (
    id text PRIMARY KEY,
    order_id text NOT NULL UNIQUE REFERENCES payment_orders(id) ON DELETE RESTRICT,
    provider text NOT NULL CHECK (provider IN ('airwallex','stripe')),
    provider_refund_id text,
    reason text NOT NULL CHECK (reason IN ('completed_limited','report_failed','sla_missed','operator_approved')),
    amount_minor integer NOT NULL CHECK (amount_minor > 0),
    currency text NOT NULL CHECK (currency IN ('CNY','USD','HKD')),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','submitted','succeeded','failed')),
    idempotency_key text NOT NULL UNIQUE,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_retry_at timestamptz,
    lease_owner text,
    lease_expires_at timestamptz,
    failure_code text,
    submitted_at timestamptz,
    succeeded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_provider_refund_uidx
   ON payment_refunds (provider, provider_refund_id) WHERE provider_refund_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS payment_refunds_retry_idx ON payment_refunds (state, next_retry_at)`,
  `CREATE TABLE IF NOT EXISTS job_dispatch_outbox (
    id text PRIMARY KEY,
    job_id text NOT NULL UNIQUE REFERENCES scan_jobs(id) ON DELETE CASCADE,
    tier text NOT NULL CHECK (tier IN ('free','deep')),
    schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','published','abandoned')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    lease_owner text,
    lease_expires_at timestamptz,
    published_at timestamptz,
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS job_dispatch_outbox_pending_idx
   ON job_dispatch_outbox (state, next_attempt_at)`,
  `CREATE TABLE IF NOT EXISTS email_deliveries (
    id text PRIMARY KEY,
    order_id text REFERENCES payment_orders(id) ON DELETE RESTRICT,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
    template_type text NOT NULL CHECK (template_type IN ('payment_confirmed','report_ready','limited_report_refund','report_failed_refund','refund_succeeded','refund_assistance','link_reissue')),
    template_version text NOT NULL,
    locale text NOT NULL CHECK (locale IN ('en','zh')),
    recipient_ref text NOT NULL,
    provider text NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend')),
    provider_email_id text,
    business_idempotency_key text NOT NULL UNIQUE,
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sent','delivered','bounced','failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_retry_at timestamptz NOT NULL DEFAULT now(),
    lease_owner text,
    lease_expires_at timestamptz,
    last_provider_event_at timestamptz,
    failure_code text,
    sent_at timestamptz,
    delivered_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_provider_email_uidx
   ON email_deliveries (provider, provider_email_id) WHERE provider_email_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS email_deliveries_order_idx ON email_deliveries (order_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS email_deliveries_order_template_idx
   ON email_deliveries (order_id, template_type, created_at)`,
  `CREATE INDEX IF NOT EXISTS email_deliveries_retry_idx ON email_deliveries (state, next_retry_at)`,
  `CREATE TABLE IF NOT EXISTS email_delivery_events (
    id text PRIMARY KEY,
    provider text NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend')),
    provider_event_id text NOT NULL,
    provider_email_id text NOT NULL,
    delivery_id text REFERENCES email_deliveries(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    provider_created_at timestamptz,
    received_at timestamptz NOT NULL DEFAULT now(),
    processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received','processed','ignored','failed')),
    payload_hash text NOT NULL,
    error_code text,
    UNIQUE (provider, provider_event_id)
  )`,
  `ALTER TABLE email_delivery_events ADD COLUMN IF NOT EXISTS provider_email_id text`,
  `CREATE INDEX IF NOT EXISTS email_delivery_events_delivery_idx
   ON email_delivery_events (delivery_id, received_at)`,
  `CREATE INDEX IF NOT EXISTS email_delivery_events_provider_email_idx
   ON email_delivery_events (provider_email_id, received_at)`,
  `CREATE TABLE IF NOT EXISTS worker_presence (
    instance_id text PRIMARY KEY,
    tier text NOT NULL CHECK (tier IN ('free','deep')),
    deployment_version text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    last_heartbeat_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS worker_presence_tier_heartbeat_idx
   ON worker_presence (tier, last_heartbeat_at)`,
  `CREATE TABLE IF NOT EXISTS batch_runs (
    id text PRIMARY KEY,
    tier text NOT NULL CHECK (tier IN ('free','deep')),
    status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','partial','failed')),
    replica_count integer NOT NULL DEFAULT 1 CHECK (replica_count > 0),
    claimed_jobs integer NOT NULL DEFAULT 0 CHECK (claimed_jobs >= 0),
    completed_jobs integer NOT NULL DEFAULT 0 CHECK (completed_jobs >= 0),
    failed_jobs integer NOT NULL DEFAULT 0 CHECK (failed_jobs >= 0),
    error_code text,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS batch_runs_tier_started_idx ON batch_runs (tier, started_at)`,
  `CREATE TABLE IF NOT EXISTS free_ai_daily_budgets (
    bucket_date date PRIMARY KEY,
    used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    limit_snapshot integer NOT NULL CHECK (limit_snapshot >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS free_ai_budget_reservations (
    idempotency_hmac text PRIMARY KEY,
    bucket_date date NOT NULL REFERENCES free_ai_daily_budgets(bucket_date) ON DELETE CASCADE,
    granted boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS free_ai_budget_reservations_date_idx
   ON free_ai_budget_reservations (bucket_date)`,
  `ALTER TABLE access_keys ADD COLUMN IF NOT EXISTS payment_order_id text`,
  `ALTER TABLE credit_ledger ADD COLUMN IF NOT EXISTS payment_order_id text`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'access_keys_payment_order_id_fkey'
         AND conrelid = 'access_keys'::regclass
     ) THEN
       ALTER TABLE access_keys ADD CONSTRAINT access_keys_payment_order_id_fkey
       FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'credit_ledger_payment_order_id_fkey'
         AND conrelid = 'credit_ledger'::regclass
     ) THEN
       ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_payment_order_id_fkey
       FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT;
     END IF;
   END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS access_keys_payment_order_uidx
   ON access_keys (payment_order_id) WHERE payment_order_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_payment_order_uidx
   ON credit_ledger (payment_order_id) WHERE payment_order_id IS NOT NULL`,
  `ALTER TABLE scan_reports ALTER COLUMN payload DROP NOT NULL`,
  `ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS technical_status text NOT NULL DEFAULT 'completed'`,
  `ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS technical_error_code text`,
  `ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS technical_public_error text`,
  `ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS admission_idempotency_hmac text`,
  `UPDATE scan_reports SET technical_status = 'completed' WHERE payload IS NOT NULL`,
  `ALTER TABLE scan_reports DROP CONSTRAINT IF EXISTS scan_reports_technical_status_check`,
  `ALTER TABLE scan_reports ADD CONSTRAINT scan_reports_technical_status_check
   CHECK (technical_status IN ('pending','processing','completed','failed'))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scan_reports_admission_idempotency_uidx
   ON scan_reports (admission_idempotency_hmac) WHERE admission_idempotency_hmac IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS report_evidence_assets (
    id text PRIMARY KEY,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE CASCADE,
    job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
    finding_id text NOT NULL,
    citation_index integer NOT NULL CHECK (citation_index >= 0),
    kind text NOT NULL CHECK (kind IN ('issue_crop','context','compact','viewport')),
    status text NOT NULL CHECK (status IN ('ready','unavailable')),
    source_url text NOT NULL,
    quote text NOT NULL,
    page_element text,
    captured_at timestamptz NOT NULL,
    viewport_width integer NOT NULL CHECK (viewport_width > 0),
    viewport_height integer NOT NULL CHECK (viewport_height > 0),
    content_hash text NOT NULL,
    evidence_hash text NOT NULL,
    asset_hash text,
    storage_provider text,
    storage_key text,
    mime_type text,
    byte_size integer CHECK (byte_size IS NULL OR byte_size >= 0),
    failure_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_id, finding_id, citation_index, kind)
  )`,
  `CREATE INDEX IF NOT EXISTS report_evidence_assets_report_idx
   ON report_evidence_assets (report_id, finding_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scan_jobs_id_report_uidx ON scan_jobs (id, report_id)`,
  `CREATE TABLE IF NOT EXISTS answer_snapshot_runs (
    id text PRIMARY KEY,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE CASCADE,
    job_id text NOT NULL,
    locale text NOT NULL CHECK (length(btrim(locale)) > 0),
    region text NOT NULL CHECK (length(btrim(region)) > 0),
    question_set_version text NOT NULL CHECK (length(btrim(question_set_version)) > 0),
    started_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT answer_snapshot_runs_job_report_fkey
      FOREIGN KEY (job_id, report_id) REFERENCES scan_jobs(id, report_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS answer_snapshot_runs_job_idx ON answer_snapshot_runs (job_id, started_at)`,
  `CREATE INDEX IF NOT EXISTS answer_snapshot_runs_report_idx ON answer_snapshot_runs (report_id, started_at)`,
  `CREATE TABLE IF NOT EXISTS answer_snapshot_cells (
    id text PRIMARY KEY,
    run_id text NOT NULL REFERENCES answer_snapshot_runs(id) ON DELETE CASCADE,
    question_id text NOT NULL,
    provider_id text NOT NULL,
    product_id text NOT NULL,
    model_id text NOT NULL,
    collection_surface text NOT NULL CHECK (collection_surface IN ('developer_api','approved_browser_capture')),
    locale text NOT NULL,
    region text NOT NULL,
    certification_state text NOT NULL CHECK (certification_state IN ('candidate_uncertified','certified')),
    consumer_application_label text,
    status text NOT NULL CHECK (status IN ('succeeded','failed')),
    answer_text text,
    executed_at timestamptz NOT NULL,
    execution_duration_ms integer NOT NULL CHECK (execution_duration_ms >= 0),
    response_hash text,
    recommendation_outcome text CHECK (recommendation_outcome IS NULL OR recommendation_outcome IN ('recommendations_present','no_recommendation')),
    provider_request_id text,
    usage jsonb,
    error_class text CHECK (error_class IS NULL OR error_class IN ('timeout','rate-limit','authentication','unsupported','provider-unavailable','invalid-response','policy-blocked')),
    sanitized_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT answer_snapshot_cells_api_label_check CHECK (collection_surface <> 'developer_api' OR consumer_application_label IS NULL),
    CONSTRAINT answer_snapshot_cells_result_check CHECK (
      (status = 'succeeded' AND length(btrim(answer_text)) > 0 AND response_hash IS NOT NULL
        AND recommendation_outcome IS NOT NULL AND error_class IS NULL AND sanitized_error IS NULL)
      OR
      (status = 'failed' AND answer_text IS NULL AND response_hash IS NULL
        AND recommendation_outcome IS NULL AND error_class IS NOT NULL)
    )
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS answer_snapshot_cells_identity_uidx
   ON answer_snapshot_cells (run_id, question_id, provider_id, product_id, model_id, collection_surface, locale, region)`,
  `CREATE INDEX IF NOT EXISTS answer_snapshot_cells_run_order_idx
   ON answer_snapshot_cells (run_id, question_id, provider_id, product_id, model_id)`,
  `ALTER TABLE answer_snapshot_cells DROP CONSTRAINT IF EXISTS answer_snapshot_cells_error_class_check`,
  `ALTER TABLE answer_snapshot_cells ADD CONSTRAINT answer_snapshot_cells_error_class_check
   CHECK (error_class IS NULL OR error_class IN ('timeout','rate-limit','authentication','unsupported','provider-unavailable','invalid-response','policy-blocked'))`,
  `CREATE TABLE IF NOT EXISTS answer_snapshot_sources (
    id text PRIMARY KEY,
    cell_id text NOT NULL REFERENCES answer_snapshot_cells(id) ON DELETE CASCADE,
    url text NOT NULL CHECK (url ~ '^https?://'),
    title text NOT NULL,
    provider_order integer NOT NULL CHECK (provider_order >= 0),
    provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cell_id, provider_order),
    UNIQUE (cell_id, url)
  )`,
  `CREATE TABLE IF NOT EXISTS citation_source_evidence (
    id text PRIMARY KEY,
    source_id text NOT NULL UNIQUE REFERENCES answer_snapshot_sources(id) ON DELETE CASCADE,
    category text NOT NULL CHECK (category IN ('owned_customer','owned_competitor','earned_editorial','directory_or_reference','community_or_ugc','institution','social','unknown')),
    retrieval_state text NOT NULL CHECK (retrieval_state IN ('available','inaccessible','not_retrieved','expired')),
    excerpt text CHECK (excerpt IS NULL OR char_length(excerpt) <= 1200),
    excerpt_hash text,
    content_hash text,
    grade text NOT NULL CHECK (grade IN ('A','B','C','D')),
    retrieved_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT citation_source_evidence_content_check CHECK (
      (retrieval_state = 'available' AND excerpt IS NOT NULL AND excerpt_hash IS NOT NULL AND content_hash IS NOT NULL)
      OR (retrieval_state IN ('inaccessible','not_retrieved') AND excerpt IS NULL AND excerpt_hash IS NULL AND content_hash IS NULL)
      OR (retrieval_state = 'expired' AND excerpt IS NULL AND excerpt_hash IS NOT NULL AND content_hash IS NOT NULL)
    )
  )`,
  `CREATE INDEX IF NOT EXISTS citation_source_evidence_expiry_idx
   ON citation_source_evidence (retrieval_state, expires_at)`,
  `ALTER TABLE citation_source_evidence DROP CONSTRAINT IF EXISTS citation_source_evidence_category_check`,
  `ALTER TABLE citation_source_evidence ADD CONSTRAINT citation_source_evidence_category_check
   CHECK (category IN ('owned_customer','owned_competitor','earned_editorial','directory_or_reference','community_or_ugc','institution','social','unknown'))`,
  `ALTER TABLE citation_source_evidence DROP CONSTRAINT IF EXISTS citation_source_evidence_retrieval_state_check`,
  `ALTER TABLE citation_source_evidence DROP CONSTRAINT IF EXISTS citation_source_evidence_retrieval_check`,
  `ALTER TABLE citation_source_evidence DROP CONSTRAINT IF EXISTS citation_source_evidence_content_check`,
  `UPDATE citation_source_evidence SET retrieval_state = 'inaccessible' WHERE retrieval_state = 'unavailable'`,
  `ALTER TABLE citation_source_evidence ADD CONSTRAINT citation_source_evidence_retrieval_check
   CHECK (retrieval_state IN ('available','inaccessible','not_retrieved','expired'))`,
  `ALTER TABLE citation_source_evidence ADD CONSTRAINT citation_source_evidence_content_check CHECK (
     (retrieval_state = 'available' AND excerpt IS NOT NULL AND excerpt_hash IS NOT NULL AND content_hash IS NOT NULL)
     OR (retrieval_state IN ('inaccessible','not_retrieved') AND excerpt IS NULL AND excerpt_hash IS NULL AND content_hash IS NULL)
     OR (retrieval_state = 'expired' AND excerpt IS NULL)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS answer_snapshot_runs_scope_uidx ON answer_snapshot_runs (id, report_id, job_id)`,
  `ALTER TABLE answer_snapshot_cells ADD COLUMN IF NOT EXISTS attempt_count integer`,
  `ALTER TABLE answer_snapshot_cells ADD COLUMN IF NOT EXISTS failure_disposition text`,
  `ALTER TABLE answer_snapshot_cells DROP CONSTRAINT IF EXISTS answer_snapshot_cells_failure_disposition_check`,
  `ALTER TABLE answer_snapshot_cells ADD CONSTRAINT answer_snapshot_cells_failure_disposition_check CHECK (failure_disposition IS NULL OR failure_disposition IN ('non_retryable','retry_exhausted'))`,
  `ALTER TABLE answer_snapshot_cells DROP CONSTRAINT IF EXISTS answer_snapshot_cells_result_check`,
  `ALTER TABLE answer_snapshot_cells ADD CONSTRAINT answer_snapshot_cells_result_check CHECK (
    (status = 'succeeded' AND length(btrim(answer_text)) > 0 AND response_hash IS NOT NULL
      AND recommendation_outcome IS NOT NULL AND error_class IS NULL AND sanitized_error IS NULL
      AND attempt_count IS NULL AND failure_disposition IS NULL)
    OR
    (status = 'failed' AND answer_text IS NULL AND response_hash IS NULL
      AND recommendation_outcome IS NULL AND error_class IS NOT NULL
      AND ((attempt_count IS NULL AND failure_disposition IS NULL)
        OR (attempt_count > 0 AND failure_disposition IS NOT NULL)))
  )`,
  `CREATE TABLE IF NOT EXISTS recommendation_certification_authorities (
    authority_version text PRIMARY KEY CHECK (length(btrim(authority_version)) > 0),
    captured_at timestamptz NOT NULL,
    snapshot jsonb NOT NULL,
    evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS source_classification_authorities (
    authority_version text PRIMARY KEY CHECK (length(btrim(authority_version)) > 0),
    captured_at timestamptz NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS answer_execution_checkpoints (
    run_id text PRIMARY KEY,
    report_id text NOT NULL,
    job_id text NOT NULL,
    revision integer NOT NULL CHECK (revision >= 0),
    ledger jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT answer_execution_checkpoints_run_scope_fkey
      FOREIGN KEY (run_id, report_id, job_id) REFERENCES answer_snapshot_runs(id, report_id, job_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS answer_execution_checkpoints_job_idx ON answer_execution_checkpoints (job_id)`,
  `CREATE TABLE IF NOT EXISTS recommendation_forensic_reports (
    id text PRIMARY KEY,
    report_id text NOT NULL,
    job_id text NOT NULL,
    report_version integer NOT NULL CHECK (report_version = 1),
    payload jsonb NOT NULL,
    certification_authority_version text NOT NULL REFERENCES recommendation_certification_authorities(authority_version) ON DELETE RESTRICT,
    source_classification_authority_version text NOT NULL REFERENCES source_classification_authorities(authority_version) ON DELETE RESTRICT,
    content_hash text NOT NULL,
    is_private boolean NOT NULL DEFAULT true CHECK (is_private = true),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recommendation_forensic_reports_job_report_fkey
      FOREIGN KEY (job_id, report_id) REFERENCES scan_jobs(id, report_id) ON DELETE CASCADE,
    UNIQUE (report_id),
    UNIQUE (job_id)
  )`,
  `ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS product_contract text NOT NULL DEFAULT 'legacy_website_audit_v1'`,
  `ALTER TABLE ai_reports DROP CONSTRAINT IF EXISTS ai_reports_product_contract_check`,
  `ALTER TABLE ai_reports ADD CONSTRAINT ai_reports_product_contract_check
   CHECK (product_contract IN ('legacy_website_audit_v1','recommendation_forensics_v1'))`,
  `ALTER TABLE ai_reports DROP CONSTRAINT IF EXISTS ai_reports_report_id_tier_key`,
  `DROP INDEX IF EXISTS ai_reports_report_tier_uidx`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ai_reports_report_tier_product_uidx
   ON ai_reports (report_id, tier, product_contract)`
] as const;

export const V10_DATABASE_MIGRATIONS = [
  `CREATE OR REPLACE FUNCTION ogc_public_jsonb_metadata_valid_node(document jsonb, depth integer)
   RETURNS boolean
   LANGUAGE plpgsql
   IMMUTABLE
   STRICT
   AS $$
   DECLARE
     item record;
     normalized_key text;
   BEGIN
     IF depth > 4 OR octet_length(document::text) > 8192 THEN
       RETURN false;
     END IF;
     CASE jsonb_typeof(document)
       WHEN 'object' THEN
         FOR item IN SELECT entry.key, entry.value AS child FROM jsonb_each(document) AS entry LOOP
           normalized_key := regexp_replace(lower(item.key), '[^a-z0-9]', '', 'g');
           IF length(item.key) > 64 OR normalized_key <> ALL (ARRAY[
             'id','name','canonicalname','type','category','kind','status','code','version',
             'claim','claims','text','quote','title','snippet','field','value','values','items',
             'sourceid','observationid','entityid','confidence','reason','details','relationship',
             'from','to','subject','predicate','object','polarity','domain','registrabledomain',
             'language','locale','region','mimetype','publishedat','updatedat','retrievedat','rank',
             'resulttype','sourcekind','inputtokens','outputtokens','totaltokens','searchrequests',
             'currency','costmicros','billedunits','requestunits','cachehits','billing','unit','count'
           ]) THEN
             RETURN false;
           END IF;
           IF NOT ogc_public_jsonb_metadata_valid_node(item.child, depth + 1) THEN
             RETURN false;
           END IF;
         END LOOP;
       WHEN 'array' THEN
         FOR item IN SELECT entry.value AS child FROM jsonb_array_elements(document) AS entry LOOP
           IF NOT ogc_public_jsonb_metadata_valid_node(item.child, depth + 1) THEN
             RETURN false;
           END IF;
         END LOOP;
       WHEN 'string' THEN
         IF length(document #>> '{}') > 2048 THEN RETURN false; END IF;
       WHEN 'number', 'boolean', 'null' THEN NULL;
       ELSE RETURN false;
     END CASE;
     RETURN true;
   END $$`,
  `CREATE OR REPLACE FUNCTION ogc_public_jsonb_metadata_valid(document jsonb)
   RETURNS boolean
   LANGUAGE sql
   IMMUTABLE
   STRICT
   AS $$ SELECT ogc_public_jsonb_metadata_valid_node(document, 0) $$`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS fulfillment_methodology text`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS recommendation_report_version integer`,
  `ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS fulfillment_methodology text`,
  `ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS recommendation_report_version integer`,
  `UPDATE scan_jobs
   SET fulfillment_methodology = 'answer_engine_recommendation_forensics_v1'
   WHERE product_contract = 'recommendation_forensics_v1' AND fulfillment_methodology IS NULL`,
  `UPDATE scan_jobs SET recommendation_report_version = 1
   WHERE product_contract = 'recommendation_forensics_v1' AND recommendation_report_version IS NULL`,
  `UPDATE scan_jobs
   SET fulfillment_methodology = NULL
   WHERE product_contract = 'legacy_website_audit_v1'`,
  `UPDATE scan_jobs SET recommendation_report_version = NULL
   WHERE product_contract = 'legacy_website_audit_v1'`,
  `UPDATE payment_orders
   SET fulfillment_methodology = 'answer_engine_recommendation_forensics_v1'
   WHERE product_code = 'recommendation_forensics_v1' AND fulfillment_methodology IS NULL`,
  `UPDATE payment_orders SET recommendation_report_version = 1
   WHERE product_code = 'recommendation_forensics_v1' AND recommendation_report_version IS NULL`,
  `UPDATE payment_orders
   SET fulfillment_methodology = NULL
   WHERE product_code <> 'recommendation_forensics_v1'`,
  `UPDATE payment_orders SET recommendation_report_version = NULL
   WHERE product_code <> 'recommendation_forensics_v1'`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_methodology_contract_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_methodology_contract_check CHECK (
     (product_contract = 'legacy_website_audit_v1' AND fulfillment_methodology IS NULL AND recommendation_report_version IS NULL)
     OR (product_contract = 'recommendation_forensics_v1'
       AND fulfillment_methodology IS NOT NULL AND recommendation_report_version IS NOT NULL
       AND ((fulfillment_methodology = 'answer_engine_recommendation_forensics_v1' AND recommendation_report_version = 1)
         OR (fulfillment_methodology = 'public_search_source_forensics_v1' AND recommendation_report_version = 2)))
   )`,
  `ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_methodology_product_check`,
  `ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_methodology_product_check CHECK (
     (product_code = 'recommendation_forensics_v1'
       AND fulfillment_methodology IS NOT NULL AND recommendation_report_version IS NOT NULL
       AND ((fulfillment_methodology = 'answer_engine_recommendation_forensics_v1' AND recommendation_report_version = 1)
         OR (fulfillment_methodology = 'public_search_source_forensics_v1' AND recommendation_report_version = 2)))
     OR (product_code <> 'recommendation_forensics_v1' AND fulfillment_methodology IS NULL AND recommendation_report_version IS NULL)
   )`,
  `CREATE INDEX IF NOT EXISTS scan_jobs_methodology_stage_idx
   ON scan_jobs (fulfillment_methodology, stage, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scan_jobs_recommendation_contract_scope_uidx
   ON scan_jobs (id, report_id, product_contract, fulfillment_methodology, recommendation_report_version)`,
  `CREATE INDEX IF NOT EXISTS payment_orders_methodology_status_idx
   ON payment_orders (fulfillment_methodology, fulfillment_status, created_at)`,
  `CREATE TABLE IF NOT EXISTS public_search_surface_authorities (
    authority_version text PRIMARY KEY CHECK (length(btrim(authority_version)) > 0),
    surface_id text NOT NULL CHECK (length(btrim(surface_id)) > 0),
    surface_version text NOT NULL CHECK (length(btrim(surface_version)) > 0),
    environment text NOT NULL CHECK (environment IN ('staging','production')),
    locale_capabilities jsonb NOT NULL CHECK (
      jsonb_typeof(locale_capabilities) = 'array' AND ogc_public_jsonb_metadata_valid(locale_capabilities)
    ),
    region_capabilities jsonb NOT NULL CHECK (
      jsonb_typeof(region_capabilities) = 'array' AND ogc_public_jsonb_metadata_valid(region_capabilities)
    ),
    terms_reviewed_at timestamptz NOT NULL,
    evidence_references jsonb NOT NULL CHECK (
      jsonb_typeof(evidence_references) = 'array' AND ogc_public_jsonb_metadata_valid(evidence_references)
    ),
    active boolean NOT NULL DEFAULT false,
    captured_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (authority_version, surface_id, surface_version),
    UNIQUE (environment, surface_id, surface_version, authority_version)
  )`,
  `CREATE INDEX IF NOT EXISTS public_search_surface_authorities_active_idx
   ON public_search_surface_authorities (environment, active, surface_id)`,
  `CREATE TABLE IF NOT EXISTS market_snapshot_questions (
    id text PRIMARY KEY,
    cache_identity text NOT NULL CHECK (length(btrim(cache_identity)) > 0),
    normalized_question text NOT NULL CHECK (length(btrim(normalized_question)) > 0),
    question_hash text NOT NULL CHECK (length(btrim(question_hash)) > 0),
    locale text NOT NULL CHECK (length(btrim(locale)) > 0),
    region text NOT NULL CHECK (length(btrim(region)) > 0),
    surface_authority_version text NOT NULL,
    surface_id text NOT NULL,
    surface_version text NOT NULL,
    fanout_version text NOT NULL CHECK (length(btrim(fanout_version)) > 0),
    status text NOT NULL DEFAULT 'refreshing' CHECK (status IN ('refreshing','completed','failed')),
    completion_version integer NOT NULL CHECK (completion_version > 0),
    query_fanout_hash text,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT market_snapshot_questions_authority_scope_fkey
      FOREIGN KEY (surface_authority_version, surface_id, surface_version)
      REFERENCES public_search_surface_authorities(authority_version, surface_id, surface_version) ON DELETE RESTRICT,
    CONSTRAINT market_snapshot_questions_terminal_check CHECK (
      (status = 'completed' AND completed_at IS NOT NULL AND query_fanout_hash IS NOT NULL)
      OR (status <> 'completed' AND completed_at IS NULL)
    ),
    UNIQUE (cache_identity, completion_version),
    UNIQUE (id, cache_identity),
    UNIQUE (id, surface_authority_version)
  )`,
  `CREATE INDEX IF NOT EXISTS market_snapshot_questions_freshness_idx
   ON market_snapshot_questions (cache_identity, status, completed_at DESC)`,
  `CREATE TABLE IF NOT EXISTS market_snapshot_queries (
    id text PRIMARY KEY,
    snapshot_id text NOT NULL REFERENCES market_snapshot_questions(id) ON DELETE CASCADE,
    query_order integer NOT NULL CHECK (query_order >= 0),
    query_text text NOT NULL CHECK (length(btrim(query_text)) > 0),
    query_hash text NOT NULL CHECK (length(btrim(query_hash)) > 0),
    derivation_rule text NOT NULL CHECK (length(btrim(derivation_rule)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (snapshot_id, query_order),
    UNIQUE (snapshot_id, query_hash),
    UNIQUE (id, snapshot_id)
  )`,
  `CREATE TABLE IF NOT EXISTS market_search_attempts (
    id text PRIMARY KEY,
    snapshot_id text NOT NULL,
    query_id text NOT NULL,
    authority_version text NOT NULL,
    attempt_number integer NOT NULL CHECK (attempt_number > 0),
    request_status text NOT NULL CHECK (request_status IN ('pending','succeeded','partial','timeout','rate_limited','unavailable','malformed','aborted')),
    idempotency_reference text NOT NULL UNIQUE CHECK (length(btrim(idempotency_reference)) > 0),
    usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (ogc_public_jsonb_metadata_valid(usage)),
    configured_cost_micros integer NOT NULL DEFAULT 0 CHECK (configured_cost_micros >= 0),
    provider_cost_micros integer CHECK (provider_cost_micros IS NULL OR provider_cost_micros >= 0),
    cost_uncertain boolean NOT NULL DEFAULT false,
    sanitized_error text CHECK (sanitized_error IS NULL OR char_length(sanitized_error) <= 500),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT market_search_attempts_query_scope_fkey
      FOREIGN KEY (query_id, snapshot_id) REFERENCES market_snapshot_queries(id, snapshot_id) ON DELETE CASCADE,
    CONSTRAINT market_search_attempts_authority_scope_fkey
      FOREIGN KEY (snapshot_id, authority_version)
      REFERENCES market_snapshot_questions(id, surface_authority_version) ON DELETE CASCADE,
    UNIQUE (snapshot_id, attempt_number),
    UNIQUE (id, snapshot_id, query_id)
  )`,
  `CREATE INDEX IF NOT EXISTS market_search_attempts_snapshot_idx
   ON market_search_attempts (snapshot_id, started_at)`,
  `CREATE TABLE IF NOT EXISTS market_search_observations (
    id text PRIMARY KEY,
    snapshot_id text NOT NULL,
    query_id text NOT NULL,
    attempt_id text NOT NULL,
    surface_result_order integer NOT NULL CHECK (surface_result_order >= 0),
    result_url text NOT NULL CHECK (result_url ~ '^https?://'),
    canonical_url text NOT NULL CHECK (canonical_url ~ '^https?://'),
    title text NOT NULL,
    snippet text CHECK (snippet IS NULL OR char_length(snippet) <= 1200),
    result_status text NOT NULL CHECK (result_status IN ('returned','duplicate','inaccessible','filtered')),
    result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (ogc_public_jsonb_metadata_valid(result_metadata)),
    content_hash text NOT NULL CHECK (length(btrim(content_hash)) > 0),
    observed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT market_search_observations_attempt_scope_fkey
      FOREIGN KEY (attempt_id, snapshot_id, query_id)
      REFERENCES market_search_attempts(id, snapshot_id, query_id) ON DELETE CASCADE,
    UNIQUE (attempt_id, surface_result_order),
    UNIQUE (id, snapshot_id)
  )`,
  `CREATE INDEX IF NOT EXISTS market_search_observations_snapshot_idx
   ON market_search_observations (snapshot_id, query_id, surface_result_order)`,
  `CREATE TABLE IF NOT EXISTS market_source_evidence (
    id text PRIMARY KEY,
    snapshot_id text NOT NULL,
    observation_id text NOT NULL UNIQUE,
    canonical_url text NOT NULL CHECK (canonical_url ~ '^https?://'),
    registrable_domain text NOT NULL CHECK (length(btrim(registrable_domain)) > 0),
    retrieval_state text NOT NULL CHECK (retrieval_state IN ('available','inaccessible','not_retrieved','expired')),
    excerpt text CHECK (excerpt IS NULL OR char_length(excerpt) <= 1200),
    excerpt_hash text,
    content_hash text,
    source_category text NOT NULL CHECK (source_category IN ('company_owned','earned_editorial','directory_or_reference','community_or_ugc','institution','social','unknown')),
    entities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (ogc_public_jsonb_metadata_valid(entities)),
    claims jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (ogc_public_jsonb_metadata_valid(claims)),
    contradictions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (ogc_public_jsonb_metadata_valid(contradictions)),
    evidence_family_identity text NOT NULL CHECK (length(btrim(evidence_family_identity)) > 0),
    retrieved_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT market_source_evidence_observation_scope_fkey
      FOREIGN KEY (observation_id, snapshot_id)
      REFERENCES market_search_observations(id, snapshot_id) ON DELETE CASCADE,
    CONSTRAINT market_source_evidence_content_check CHECK (
      (retrieval_state = 'available' AND excerpt IS NOT NULL AND excerpt_hash IS NOT NULL AND content_hash IS NOT NULL)
      OR (retrieval_state IN ('inaccessible','not_retrieved') AND excerpt IS NULL AND excerpt_hash IS NULL AND content_hash IS NULL)
      OR (retrieval_state = 'expired' AND excerpt IS NULL)
    )
  )`,
  `CREATE INDEX IF NOT EXISTS market_source_evidence_snapshot_family_idx
   ON market_source_evidence (snapshot_id, evidence_family_identity)`,
  `CREATE INDEX IF NOT EXISTS market_source_evidence_expiry_idx
   ON market_source_evidence (retrieval_state, expires_at)`,
  `ALTER TABLE market_source_evidence DROP CONSTRAINT IF EXISTS market_source_evidence_source_category_check`,
  `ALTER TABLE market_source_evidence DROP CONSTRAINT IF EXISTS market_source_evidence_category_check`,
  `ALTER TABLE market_source_evidence ADD CONSTRAINT market_source_evidence_category_check
   CHECK (source_category IN ('company_owned','earned_editorial','directory_or_reference','community_or_ugc','institution','social','unknown'))`,
  `ALTER TABLE market_source_evidence DROP CONSTRAINT IF EXISTS market_source_evidence_content_check`,
  `ALTER TABLE market_source_evidence ADD CONSTRAINT market_source_evidence_content_check CHECK (
     (retrieval_state = 'available' AND excerpt IS NOT NULL AND excerpt_hash IS NOT NULL AND content_hash IS NOT NULL)
     OR (retrieval_state IN ('inaccessible','not_retrieved') AND excerpt IS NULL AND excerpt_hash IS NULL AND content_hash IS NULL)
     OR (retrieval_state = 'expired' AND excerpt IS NULL AND excerpt_hash IS NOT NULL AND content_hash IS NOT NULL)
   )`,
  `CREATE TABLE IF NOT EXISTS market_snapshot_leases (
    cache_identity text PRIMARY KEY,
    lease_owner text NOT NULL CHECK (length(btrim(lease_owner)) > 0),
    state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','completed','failed')),
    acquired_at timestamptz NOT NULL DEFAULT now(),
    heartbeat_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    attempt_number integer NOT NULL CHECK (attempt_number > 0),
    terminal_snapshot_id text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT market_snapshot_leases_terminal_scope_fkey
      FOREIGN KEY (terminal_snapshot_id, cache_identity)
      REFERENCES market_snapshot_questions(id, cache_identity) ON DELETE RESTRICT,
    CONSTRAINT market_snapshot_leases_terminal_check CHECK (
      (state = 'completed' AND terminal_snapshot_id IS NOT NULL)
      OR (state <> 'completed' AND terminal_snapshot_id IS NULL)
    )
  )`,
  `CREATE INDEX IF NOT EXISTS market_snapshot_leases_expiry_idx
   ON market_snapshot_leases (state, expires_at)`,
  `CREATE TABLE IF NOT EXISTS report_market_snapshot_refs (
    id text PRIMARY KEY,
    report_id text NOT NULL,
    job_id text NOT NULL,
    snapshot_id text NOT NULL REFERENCES market_snapshot_questions(id) ON DELETE RESTRICT,
    evidence_cutoff timestamptz NOT NULL,
    freshness_state text NOT NULL CHECK (freshness_state IN ('fresh','historical','insufficient')),
    actual_cost_micros integer NOT NULL DEFAULT 0 CHECK (actual_cost_micros >= 0),
    allocated_cost_micros integer NOT NULL DEFAULT 0 CHECK (allocated_cost_micros >= 0),
    avoided_cost_micros integer NOT NULL DEFAULT 0 CHECK (avoided_cost_micros >= 0),
    binding_hash text NOT NULL CHECK (length(btrim(binding_hash)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT report_market_snapshot_refs_job_report_fkey
      FOREIGN KEY (job_id, report_id) REFERENCES scan_jobs(id, report_id) ON DELETE CASCADE,
    UNIQUE (job_id, snapshot_id)
  )`,
  `CREATE INDEX IF NOT EXISTS report_market_snapshot_refs_report_idx
   ON report_market_snapshot_refs (report_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS report_source_forensics (
    id text PRIMARY KEY,
    report_id text NOT NULL,
    job_id text NOT NULL,
    report_version integer NOT NULL CHECK (report_version = 2),
    fulfillment_methodology text NOT NULL CHECK (fulfillment_methodology = 'public_search_source_forensics_v1'),
    product_contract text NOT NULL CHECK (product_contract = 'recommendation_forensics_v1'),
    payload jsonb NOT NULL,
    authority_hash text NOT NULL CHECK (length(btrim(authority_hash)) > 0),
    provenance_hash text NOT NULL CHECK (length(btrim(provenance_hash)) > 0),
    content_hash text NOT NULL CHECK (length(btrim(content_hash)) > 0),
    is_private boolean NOT NULL DEFAULT true CHECK (is_private = true),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT report_source_forensics_job_report_fkey
      FOREIGN KEY (job_id, report_id) REFERENCES scan_jobs(id, report_id) ON DELETE CASCADE,
    CONSTRAINT report_source_forensics_v2_job_fkey
      FOREIGN KEY (job_id, report_id, product_contract, fulfillment_methodology, report_version)
      REFERENCES scan_jobs(id, report_id, product_contract, fulfillment_methodology, recommendation_report_version)
      ON DELETE CASCADE,
    UNIQUE (report_id),
    UNIQUE (job_id)
  )`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_source_forensics_v2_job_fkey') THEN
      ALTER TABLE report_source_forensics ADD CONSTRAINT report_source_forensics_v2_job_fkey
        FOREIGN KEY (job_id, report_id, product_contract, fulfillment_methodology, report_version)
        REFERENCES scan_jobs(id, report_id, product_contract, fulfillment_methodology, recommendation_report_version)
        ON DELETE CASCADE;
    END IF;
  END $$`,
  `CREATE OR REPLACE FUNCTION ogc_require_completed_market_snapshot_ledger()
   RETURNS trigger
   LANGUAGE plpgsql
   AS $$
   BEGIN
     IF NEW.status = 'completed' AND NOT EXISTS (
       SELECT 1 FROM market_search_attempts attempt
       WHERE attempt.snapshot_id = NEW.id AND attempt.request_status IN ('succeeded','partial')
     ) THEN
       RAISE EXCEPTION 'A completed market snapshot requires a successful or partial attempt ledger.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_snapshot_questions_completion_ledger_trigger ON market_snapshot_questions`,
  `CREATE TRIGGER market_snapshot_questions_completion_ledger_trigger
   BEFORE INSERT OR UPDATE OF status, completed_at ON market_snapshot_questions
   FOR EACH ROW EXECUTE FUNCTION ogc_require_completed_market_snapshot_ledger()`,
  `CREATE OR REPLACE FUNCTION ogc_preserve_completed_market_snapshot()
   RETURNS trigger
   LANGUAGE plpgsql
   AS $$
   BEGIN
     IF OLD.status = 'completed' AND NEW IS DISTINCT FROM OLD THEN
       RAISE EXCEPTION 'A completed market snapshot is immutable; refresh by inserting a new completion version.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_snapshot_questions_immutability_trigger ON market_snapshot_questions`,
  `CREATE TRIGGER market_snapshot_questions_immutability_trigger
   BEFORE UPDATE ON market_snapshot_questions
   FOR EACH ROW EXECUTE FUNCTION ogc_preserve_completed_market_snapshot()`,
  `CREATE OR REPLACE FUNCTION ogc_prevent_market_immutable_row_mutation()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     RAISE EXCEPTION 'Completed public-search evidence rows are immutable and cannot be reassigned or deleted.';
   END $$`,
  `DROP TRIGGER IF EXISTS market_snapshot_queries_immutability_trigger ON market_snapshot_queries`,
  `CREATE TRIGGER market_snapshot_queries_immutability_trigger
   BEFORE UPDATE OR DELETE ON market_snapshot_queries
   FOR EACH ROW EXECUTE FUNCTION ogc_prevent_market_immutable_row_mutation()`,
  `DROP TRIGGER IF EXISTS market_search_observations_immutability_trigger ON market_search_observations`,
  `CREATE TRIGGER market_search_observations_immutability_trigger
   BEFORE UPDATE OR DELETE ON market_search_observations
   FOR EACH ROW EXECUTE FUNCTION ogc_prevent_market_immutable_row_mutation()`,
  `CREATE OR REPLACE FUNCTION ogc_preserve_market_attempt_identity()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN
       RAISE EXCEPTION 'A market search attempt cannot be deleted.';
     END IF;
     IF (NEW.id, NEW.snapshot_id, NEW.query_id, NEW.authority_version, NEW.attempt_number,
         NEW.idempotency_reference, NEW.started_at)
        IS DISTINCT FROM
        (OLD.id, OLD.snapshot_id, OLD.query_id, OLD.authority_version, OLD.attempt_number,
         OLD.idempotency_reference, OLD.started_at) THEN
       RAISE EXCEPTION 'A market search attempt cannot be reassigned.';
     END IF;
     IF NEW IS DISTINCT FROM OLD AND EXISTS (
       SELECT 1 FROM market_snapshot_questions snapshot
       WHERE snapshot.id = OLD.snapshot_id AND snapshot.status = 'completed'
     ) THEN
       RAISE EXCEPTION 'A completed market snapshot attempt ledger is immutable.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_search_attempts_identity_trigger ON market_search_attempts`,
  `CREATE TRIGGER market_search_attempts_identity_trigger
   BEFORE UPDATE OR DELETE ON market_search_attempts
   FOR EACH ROW EXECUTE FUNCTION ogc_preserve_market_attempt_identity()`,
  `CREATE OR REPLACE FUNCTION ogc_preserve_market_source_identity()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN
       RAISE EXCEPTION 'Market source evidence cannot be deleted; expire retained content instead.';
     END IF;
     IF (NEW.id, NEW.snapshot_id, NEW.observation_id, NEW.canonical_url,
         NEW.registrable_domain, NEW.source_category, NEW.evidence_family_identity,
         NEW.retrieved_at, NEW.created_at)
        IS DISTINCT FROM
        (OLD.id, OLD.snapshot_id, OLD.observation_id, OLD.canonical_url,
         OLD.registrable_domain, OLD.source_category, OLD.evidence_family_identity,
         OLD.retrieved_at, OLD.created_at) THEN
       RAISE EXCEPTION 'Market source evidence cannot be reassigned.';
     END IF;
     IF NEW IS DISTINCT FROM OLD AND NOT (
       OLD.retrieval_state = 'available'
       AND NEW.retrieval_state = 'expired'
       AND NEW.excerpt IS NULL
       AND (to_jsonb(NEW) - 'retrieval_state' - 'excerpt') =
           (to_jsonb(OLD) - 'retrieval_state' - 'excerpt')
     ) THEN
       RAISE EXCEPTION 'Market source evidence is append-only; only retained text may expire.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_source_evidence_identity_trigger ON market_source_evidence`,
  `CREATE TRIGGER market_source_evidence_identity_trigger
   BEFORE UPDATE OR DELETE ON market_source_evidence
   FOR EACH ROW EXECUTE FUNCTION ogc_preserve_market_source_identity()`
] as const;

export const V11_DATABASE_MIGRATIONS = [
  `CREATE OR REPLACE FUNCTION ogc_public_jsonb_metadata_valid_node(document jsonb, depth integer)
   RETURNS boolean
   LANGUAGE plpgsql
   IMMUTABLE
   STRICT
   AS $$
   DECLARE
     item record;
     normalized_key text;
   BEGIN
     IF depth > 4 OR octet_length(document::text) > 8192 THEN RETURN false; END IF;
     CASE jsonb_typeof(document)
       WHEN 'object' THEN
         FOR item IN SELECT entry.key, entry.value AS child FROM jsonb_each(document) AS entry LOOP
           normalized_key := regexp_replace(lower(item.key), '[^a-z0-9]', '', 'g');
           IF length(item.key) > 64 OR normalized_key <> ALL (ARRAY[
             'id','name','canonicalname','type','category','kind','status','code','version',
             'claim','claims','text','quote','title','snippet','field','value','values','items',
             'sourceid','observationid','entityid','confidence','reason','details','relationship',
             'from','to','subject','predicate','object','polarity','domain','registrabledomain',
             'language','locale','region','mimetype','publishedat','updatedat','retrievedat','rank',
             'resulttype','sourcekind','inputtokens','outputtokens','totaltokens','searchrequests',
             'currency','costmicros','billedunits','requestunits','cachehits','billing','unit','count',
             'requestcount','resultcount','estimatedcostmicros','providerreportedcostmicros','costuncertain'
           ]) THEN RETURN false; END IF;
           IF NOT ogc_public_jsonb_metadata_valid_node(item.child, depth + 1) THEN RETURN false; END IF;
         END LOOP;
       WHEN 'array' THEN
         FOR item IN SELECT entry.value AS child FROM jsonb_array_elements(document) AS entry LOOP
           IF NOT ogc_public_jsonb_metadata_valid_node(item.child, depth + 1) THEN RETURN false; END IF;
         END LOOP;
       WHEN 'string' THEN
         IF length(document #>> '{}') > 2048 THEN RETURN false; END IF;
       WHEN 'number', 'boolean', 'null' THEN NULL;
       ELSE RETURN false;
     END CASE;
     RETURN true;
   END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS public_search_surface_authorities_one_active_uidx
   ON public_search_surface_authorities (environment, surface_id) WHERE active = true`,
  `CREATE OR REPLACE FUNCTION ogc_preserve_public_search_authority()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Public-search authority evidence is immutable.'; END IF;
     IF (to_jsonb(NEW) - 'active') IS DISTINCT FROM (to_jsonb(OLD) - 'active') THEN
       RAISE EXCEPTION 'Public-search authority evidence is immutable; only atomic activation may change.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS public_search_surface_authorities_immutability_trigger ON public_search_surface_authorities`,
  `CREATE TRIGGER public_search_surface_authorities_immutability_trigger
   BEFORE UPDATE OR DELETE ON public_search_surface_authorities
   FOR EACH ROW EXECUTE FUNCTION ogc_preserve_public_search_authority()`,
  `CREATE OR REPLACE FUNCTION ogc_preserve_market_snapshot_identity()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Market snapshot identities cannot be deleted.'; END IF;
     IF (NEW.id, NEW.cache_identity, NEW.normalized_question, NEW.question_hash, NEW.locale, NEW.region,
         NEW.surface_authority_version, NEW.surface_id, NEW.surface_version, NEW.fanout_version,
         NEW.completion_version, NEW.created_at)
        IS DISTINCT FROM
        (OLD.id, OLD.cache_identity, OLD.normalized_question, OLD.question_hash, OLD.locale, OLD.region,
         OLD.surface_authority_version, OLD.surface_id, OLD.surface_version, OLD.fanout_version,
         OLD.completion_version, OLD.created_at) THEN
       RAISE EXCEPTION 'Market snapshot identity fields are immutable.';
     END IF;
     IF OLD.status <> 'refreshing' AND NEW IS DISTINCT FROM OLD THEN
       RAISE EXCEPTION 'A terminal market snapshot is immutable.';
     END IF;
     IF NEW.status NOT IN ('refreshing','completed','failed') OR
        (NEW.status = 'refreshing' AND (NEW.query_fanout_hash IS DISTINCT FROM OLD.query_fanout_hash OR NEW.completed_at IS DISTINCT FROM OLD.completed_at)) THEN
       RAISE EXCEPTION 'Only terminal snapshot state may change.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_snapshot_questions_immutability_trigger ON market_snapshot_questions`,
  `CREATE TRIGGER market_snapshot_questions_immutability_trigger
   BEFORE UPDATE OR DELETE ON market_snapshot_questions
   FOR EACH ROW EXECUTE FUNCTION ogc_preserve_market_snapshot_identity()`,
  `ALTER TABLE market_search_attempts DROP CONSTRAINT IF EXISTS market_search_attempts_timing_check`,
  `ALTER TABLE market_search_attempts ADD CONSTRAINT market_search_attempts_timing_check CHECK (
     (request_status = 'pending' AND completed_at IS NULL)
     OR (request_status <> 'pending' AND completed_at IS NOT NULL)
   )`,
  `CREATE OR REPLACE FUNCTION ogc_preserve_market_attempt_identity()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A market search attempt cannot be deleted.'; END IF;
     IF (NEW.id, NEW.snapshot_id, NEW.query_id, NEW.authority_version, NEW.attempt_number,
         NEW.idempotency_reference, NEW.started_at, NEW.created_at)
        IS DISTINCT FROM
        (OLD.id, OLD.snapshot_id, OLD.query_id, OLD.authority_version, OLD.attempt_number,
         OLD.idempotency_reference, OLD.started_at, OLD.created_at) THEN
       RAISE EXCEPTION 'A market search attempt cannot be reassigned.';
     END IF;
     IF OLD.request_status <> 'pending' AND NEW IS DISTINCT FROM OLD THEN
       RAISE EXCEPTION 'A terminal market search attempt is immutable.';
     END IF;
     IF OLD.request_status = 'pending' AND NEW.request_status = 'pending' AND NEW IS DISTINCT FROM OLD THEN
       RAISE EXCEPTION 'A pending market search attempt may only transition atomically to terminal.';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE OR REPLACE FUNCTION ogc_require_observation_terminal_attempt()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM market_search_attempts attempt
       WHERE attempt.id = NEW.attempt_id AND attempt.snapshot_id = NEW.snapshot_id
         AND attempt.query_id = NEW.query_id AND attempt.request_status IN ('succeeded','partial')
     ) THEN RAISE EXCEPTION 'A search observation requires a succeeded or partial attempt.'; END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_search_observations_attempt_status_trigger ON market_search_observations`,
  `CREATE TRIGGER market_search_observations_attempt_status_trigger
   BEFORE INSERT ON market_search_observations
   FOR EACH ROW EXECUTE FUNCTION ogc_require_observation_terminal_attempt()`,
  `CREATE OR REPLACE FUNCTION ogc_require_source_observation_url()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM market_search_observations observation
       WHERE observation.id = NEW.observation_id AND observation.snapshot_id = NEW.snapshot_id
         AND observation.canonical_url = NEW.canonical_url
     ) THEN RAISE EXCEPTION 'Source canonical URL must equal its observation canonical URL.'; END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_source_evidence_observation_url_trigger ON market_source_evidence`,
  `CREATE TRIGGER market_source_evidence_observation_url_trigger
   BEFORE INSERT ON market_source_evidence
   FOR EACH ROW EXECUTE FUNCTION ogc_require_source_observation_url()`,
  `ALTER TABLE report_market_snapshot_refs ADD COLUMN IF NOT EXISTS cache_identity text`,
  `UPDATE report_market_snapshot_refs reference
   SET cache_identity = snapshot.cache_identity
   FROM market_snapshot_questions snapshot
   WHERE reference.snapshot_id = snapshot.id AND reference.cache_identity IS NULL`,
  `ALTER TABLE report_market_snapshot_refs ALTER COLUMN cache_identity SET NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_market_snapshot_refs_job_cache_uidx
   ON report_market_snapshot_refs (job_id, cache_identity)`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_market_snapshot_refs_snapshot_cache_fkey') THEN
       ALTER TABLE report_market_snapshot_refs ADD CONSTRAINT report_market_snapshot_refs_snapshot_cache_fkey
         FOREIGN KEY (snapshot_id, cache_identity)
         REFERENCES market_snapshot_questions(id, cache_identity) ON DELETE RESTRICT;
     END IF;
   END $$`,
  `CREATE OR REPLACE FUNCTION ogc_validate_report_market_snapshot_ref()
   RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE snapshot_completed_at timestamptz;
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM scan_jobs job WHERE job.id = NEW.job_id AND job.report_id = NEW.report_id
         AND job.product_contract = 'recommendation_forensics_v1'
         AND job.fulfillment_methodology = 'public_search_source_forensics_v1'
         AND job.recommendation_report_version = 2
     ) THEN RAISE EXCEPTION 'Market snapshot references require a V2 public-search job.'; END IF;
     SELECT completed_at INTO snapshot_completed_at FROM market_snapshot_questions
       WHERE id = NEW.snapshot_id AND cache_identity = NEW.cache_identity AND status = 'completed';
     IF snapshot_completed_at IS NULL THEN RAISE EXCEPTION 'Market snapshot references require a completed snapshot.'; END IF;
     IF snapshot_completed_at > NEW.evidence_cutoff OR NEW.evidence_cutoff > now() THEN
       RAISE EXCEPTION 'Market snapshot reference cutoff cannot precede the snapshot or be in the future.';
     END IF;
     IF NEW.freshness_state IS DISTINCT FROM (CASE
       WHEN NEW.evidence_cutoff <= snapshot_completed_at + interval '7 days' THEN 'fresh'
       WHEN NEW.evidence_cutoff <= snapshot_completed_at + interval '30 days' THEN 'historical'
       ELSE 'insufficient' END) THEN
       RAISE EXCEPTION 'Market snapshot freshness state does not match its evidence cutoff.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_market_snapshot_refs_validation_trigger ON report_market_snapshot_refs`,
  `CREATE TRIGGER report_market_snapshot_refs_validation_trigger
   BEFORE INSERT OR UPDATE ON report_market_snapshot_refs
   FOR EACH ROW EXECUTE FUNCTION ogc_validate_report_market_snapshot_ref()`,
  `CREATE OR REPLACE FUNCTION ogc_preserve_market_source_identity()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Market source evidence cannot be deleted; expire retained content instead.'; END IF;
     IF current_setting('ogc.market_source_expiry', true) IS DISTINCT FROM 'allowed' THEN
       RAISE EXCEPTION 'Market source evidence is append-only; use ogc_expire_market_source_excerpt().';
     END IF;
     IF NOT (OLD.retrieval_state = 'available' AND NEW.retrieval_state = 'expired' AND NEW.excerpt IS NULL
       AND (to_jsonb(NEW) - 'retrieval_state' - 'excerpt') = (to_jsonb(OLD) - 'retrieval_state' - 'excerpt')) THEN
       RAISE EXCEPTION 'Market source evidence expiry may only remove retained excerpt text.';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE OR REPLACE FUNCTION ogc_expire_market_source_excerpt(expiry_now timestamptz)
   RETURNS integer
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, pg_temp
   AS $$
   DECLARE affected integer;
   BEGIN
     PERFORM set_config('ogc.market_source_expiry', 'allowed', true);
     UPDATE market_source_evidence
       SET retrieval_state = 'expired', excerpt = NULL
       WHERE retrieval_state = 'available' AND expires_at <= expiry_now;
     GET DIAGNOSTICS affected = ROW_COUNT;
     RETURN affected;
   END $$`
] as const;

export const V12_DATABASE_MIGRATIONS = [
  `CREATE OR REPLACE FUNCTION ogc_public_jsonb_metadata_valid_node(document jsonb, depth integer)
   RETURNS boolean
   LANGUAGE plpgsql
   IMMUTABLE
   STRICT
   AS $$
   DECLARE
     item record;
     normalized_key text;
     scalar_value text;
   BEGIN
     IF depth > 4 OR octet_length(document::text) > 8192 THEN RETURN false; END IF;
     CASE jsonb_typeof(document)
       WHEN 'object' THEN
         FOR item IN SELECT entry.key, entry.value AS child FROM jsonb_each(document) AS entry LOOP
           normalized_key := regexp_replace(lower(item.key), '[^a-z0-9]', '', 'g');
           IF length(item.key) > 64 OR normalized_key <> ALL (ARRAY[
             'id','name','canonicalname','type','category','kind','status','code','version',
             'claim','claims','text','quote','title','snippet','field','value','values','items',
             'sourceid','observationid','entityid','confidence','reason','details','relationship',
             'from','to','subject','predicate','object','polarity','domain','registrabledomain',
             'language','locale','region','mimetype','publishedat','updatedat','retrievedat','rank',
             'resulttype','sourcekind','inputtokens','outputtokens','totaltokens','searchrequests',
             'currency','costmicros','billedunits','requestunits','cachehits','billing','unit','count',
             'requestcount','resultcount','estimatedcostmicros','providerreportedcostmicros','costuncertain'
           ]) THEN RETURN false; END IF;
           IF NOT ogc_public_jsonb_metadata_valid_node(item.child, depth + 1) THEN RETURN false; END IF;
         END LOOP;
       WHEN 'array' THEN
         FOR item IN SELECT entry.value AS child FROM jsonb_array_elements(document) AS entry LOOP
           IF NOT ogc_public_jsonb_metadata_valid_node(item.child, depth + 1) THEN RETURN false; END IF;
         END LOOP;
       WHEN 'string' THEN
         scalar_value := btrim(document #>> '{}');
         IF length(scalar_value) > 2048 THEN RETURN false; END IF;
         IF scalar_value ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
           OR scalar_value ~* '(^|[^[:alnum:]])(report|job|order|customer)[ _-]*(id|identity|identifier)([^[:alnum:]]|$)'
           OR scalar_value ~* '^(report|job|order|customer)[_-][[:alnum:]-]{4,}$'
           OR scalar_value ~* '(^|[^[:alnum:]])authorization([^[:alnum:]]|$)|(^|[^[:alnum:]])bearer[[:space:]]+|api[ _-]*key|access[ _-]*token|(^|[^[:alnum:]])token[ _-]*(id|identifier)([^[:alnum:]]|$)|^token[_-][[:alnum:]-]{3,}$|(^|[^[:alnum:]])secret([^[:alnum:]]|$)'
           OR scalar_value ~* 'submitted[ _-]*url|client[ _-]*ip'
           OR scalar_value ~ '^[0-9]{1,3}([.][0-9]{1,3}){3}$'
           OR (scalar_value ~* '^[[:xdigit:]:]+$' AND scalar_value ~ ':.*:')
         THEN RETURN false; END IF;
       WHEN 'number', 'boolean', 'null' THEN NULL;
       ELSE RETURN false;
     END CASE;
     RETURN true;
   END $$`,
  `CREATE OR REPLACE FUNCTION ogc_require_completed_market_snapshot_ledger()
   RETURNS trigger
   LANGUAGE plpgsql
   AS $$
   BEGIN
     IF NEW.status = 'completed' THEN
       IF EXISTS (
         SELECT 1 FROM market_search_attempts attempt
         WHERE attempt.snapshot_id = NEW.id AND attempt.request_status = 'pending'
       ) THEN
         RAISE EXCEPTION 'A completed market snapshot cannot retain pending attempts.';
       END IF;
       IF EXISTS (
         SELECT 1 FROM market_snapshot_queries query
         WHERE query.snapshot_id = NEW.id
           AND NOT EXISTS (
             SELECT 1 FROM market_search_attempts attempt
             WHERE attempt.snapshot_id = NEW.id AND attempt.query_id = query.id
               AND attempt.request_status <> 'pending'
           )
       ) THEN
         RAISE EXCEPTION 'Every market snapshot query requires a terminal attempt before completion.';
       END IF;
       IF NOT EXISTS (
         SELECT 1 FROM market_search_attempts attempt
         WHERE attempt.snapshot_id = NEW.id AND attempt.request_status IN ('succeeded','partial')
       ) THEN
         RAISE EXCEPTION 'A completed market snapshot requires at least one successful or partial attempt.';
       END IF;
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE OR REPLACE FUNCTION ogc_preserve_market_source_identity()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN
       RAISE EXCEPTION 'Market source evidence cannot be deleted; expire retained content instead.';
     END IF;
     IF OLD.expires_at > clock_timestamp() THEN
       RAISE EXCEPTION 'Market source evidence cannot expire before its database retention deadline.';
     END IF;
     IF NOT (OLD.retrieval_state = 'available' AND NEW.retrieval_state = 'expired' AND NEW.excerpt IS NULL
       AND (to_jsonb(NEW) - 'retrieval_state' - 'excerpt') = (to_jsonb(OLD) - 'retrieval_state' - 'excerpt')) THEN
       RAISE EXCEPTION 'Market source evidence expiry may only remove retained excerpt text.';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE OR REPLACE FUNCTION ogc_expire_market_source_excerpt(expiry_now timestamptz)
   RETURNS integer
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, pg_temp
   AS $$
   DECLARE
     affected integer;
     database_now timestamptz := clock_timestamp();
   BEGIN
     IF expiry_now > database_now THEN
       RAISE EXCEPTION 'Market source expiry cutoff cannot be in the future.';
     END IF;
     UPDATE market_source_evidence
       SET retrieval_state = 'expired', excerpt = NULL
       WHERE retrieval_state = 'available'
         AND expires_at <= expiry_now
         AND expires_at <= database_now;
     GET DIAGNOSTICS affected = ROW_COUNT;
     RETURN affected;
   END $$`,
  `REVOKE ALL ON FUNCTION ogc_expire_market_source_excerpt(timestamptz) FROM PUBLIC`,
  `GRANT EXECUTE ON FUNCTION ogc_expire_market_source_excerpt(timestamptz) TO CURRENT_USER`
] as const;

export const V13_DATABASE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS ogc_market_source_expiry_context (
     backend_pid integer NOT NULL,
     transaction_id bigint NOT NULL,
     nonce uuid NOT NULL,
     created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
     PRIMARY KEY (backend_pid, transaction_id, nonce)
   )`,
  `REVOKE ALL ON TABLE ogc_market_source_expiry_context FROM PUBLIC`,
  `CREATE OR REPLACE FUNCTION ogc_preserve_market_source_identity()
   RETURNS trigger
   LANGUAGE plpgsql
   SET search_path = public, pg_temp
   AS $$
   DECLARE
     expiry_nonce text := current_setting('ogc.market_source_expiry_nonce', true);
   BEGIN
     IF TG_OP = 'DELETE' THEN
       RAISE EXCEPTION 'Market source evidence cannot be deleted; expire retained content instead.';
     END IF;
     IF expiry_nonce IS NULL OR expiry_nonce = '' OR NOT EXISTS (
       SELECT 1
       FROM public.ogc_market_source_expiry_context context
       WHERE context.backend_pid = pg_backend_pid()
         AND context.transaction_id = txid_current()
         AND context.nonce::text = expiry_nonce
     ) THEN
       RAISE EXCEPTION 'Market source evidence is append-only; use ogc_expire_market_source_excerpt().';
     END IF;
     IF OLD.expires_at > clock_timestamp() THEN
       RAISE EXCEPTION 'Market source evidence cannot expire before its database retention deadline.';
     END IF;
     IF NOT (
       OLD.retrieval_state = 'available'
       AND NEW.retrieval_state = 'expired'
       AND NEW.excerpt IS NULL
       AND (to_jsonb(NEW) - 'retrieval_state' - 'excerpt') =
           (to_jsonb(OLD) - 'retrieval_state' - 'excerpt')
     ) THEN
       RAISE EXCEPTION 'Market source evidence expiry may only remove retained excerpt text.';
     END IF;
     RETURN NEW;
   END $$`,
  `REVOKE ALL ON FUNCTION ogc_preserve_market_source_identity() FROM PUBLIC`,
  `CREATE OR REPLACE FUNCTION ogc_expire_market_source_excerpt(expiry_now timestamptz)
   RETURNS integer
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, pg_temp
   AS $$
   DECLARE
     affected integer;
     database_now timestamptz := clock_timestamp();
     expiry_nonce uuid := gen_random_uuid();
     current_transaction_id bigint := txid_current();
   BEGIN
     IF expiry_now > database_now THEN
       RAISE EXCEPTION 'Market source expiry cutoff cannot be in the future.';
     END IF;

     INSERT INTO public.ogc_market_source_expiry_context (backend_pid, transaction_id, nonce)
     VALUES (pg_backend_pid(), current_transaction_id, expiry_nonce);
     PERFORM set_config('ogc.market_source_expiry_nonce', expiry_nonce::text, true);

     UPDATE public.market_source_evidence
       SET retrieval_state = 'expired', excerpt = NULL
       WHERE retrieval_state = 'available'
         AND expires_at <= expiry_now
         AND expires_at <= database_now;
     GET DIAGNOSTICS affected = ROW_COUNT;

     DELETE FROM public.ogc_market_source_expiry_context
       WHERE backend_pid = pg_backend_pid()
         AND transaction_id = current_transaction_id
         AND nonce = expiry_nonce;
     PERFORM set_config('ogc.market_source_expiry_nonce', '', true);
     RETURN affected;
   EXCEPTION WHEN OTHERS THEN
     DELETE FROM public.ogc_market_source_expiry_context
       WHERE backend_pid = pg_backend_pid()
         AND transaction_id = current_transaction_id
         AND nonce = expiry_nonce;
     PERFORM set_config('ogc.market_source_expiry_nonce', '', true);
     RAISE;
   END $$`,
  `REVOKE ALL ON FUNCTION ogc_expire_market_source_excerpt(timestamptz) FROM PUBLIC`,
  `GRANT EXECUTE ON FUNCTION ogc_expire_market_source_excerpt(timestamptz) TO CURRENT_USER`
] as const;

export const V14_DATABASE_MIGRATIONS = [
  `ALTER TABLE public_search_surface_authorities ADD COLUMN IF NOT EXISTS adapter_id text`,
  `ALTER TABLE public_search_surface_authorities ADD COLUMN IF NOT EXISTS provider_id text`,
  `ALTER TABLE public_search_surface_authorities ADD COLUMN IF NOT EXISTS product_id text`,
  `ALTER TABLE public_search_surface_authorities ADD COLUMN IF NOT EXISTS model_id text`,
  `ALTER TABLE public_search_surface_authorities ADD COLUMN IF NOT EXISTS adapter_version text`,
  `ALTER TABLE public_search_surface_authorities DISABLE TRIGGER public_search_surface_authorities_immutability_trigger`,
  `UPDATE public_search_surface_authorities
   SET adapter_id='historical-unbound-v1', provider_id='historical-unbound-v1',
       product_id='historical-unbound-v1', model_id='historical-unbound-v1',
       adapter_version='historical-unbound-v1'
   WHERE adapter_id IS NULL OR provider_id IS NULL OR product_id IS NULL OR model_id IS NULL OR adapter_version IS NULL`,
  `ALTER TABLE public_search_surface_authorities ENABLE TRIGGER public_search_surface_authorities_immutability_trigger`,
  `ALTER TABLE public_search_surface_authorities ALTER COLUMN adapter_id SET NOT NULL`,
  `ALTER TABLE public_search_surface_authorities ALTER COLUMN provider_id SET NOT NULL`,
  `ALTER TABLE public_search_surface_authorities ALTER COLUMN product_id SET NOT NULL`,
  `ALTER TABLE public_search_surface_authorities ALTER COLUMN model_id SET NOT NULL`,
  `ALTER TABLE public_search_surface_authorities ALTER COLUMN adapter_version SET NOT NULL`,
  `ALTER TABLE public_search_surface_authorities DROP CONSTRAINT IF EXISTS public_search_surface_authorities_adapter_identity_check`,
  `ALTER TABLE public_search_surface_authorities
   ADD CONSTRAINT public_search_surface_authorities_adapter_identity_check
   CHECK (length(btrim(adapter_id)) > 0 AND length(btrim(provider_id)) > 0 AND length(btrim(product_id)) > 0 AND length(btrim(model_id)) > 0 AND length(btrim(adapter_version)) > 0)`,
  `DROP INDEX IF EXISTS public_search_surface_authorities_active_idx`,
  `CREATE INDEX IF NOT EXISTS public_search_surface_authorities_active_idx
   ON public_search_surface_authorities (environment, active, adapter_id, provider_id, product_id, model_id, adapter_version, surface_id)`,
  `DROP INDEX IF EXISTS public_search_surface_authorities_identity_uidx`,
  `CREATE UNIQUE INDEX IF NOT EXISTS public_search_surface_authorities_identity_uidx
   ON public_search_surface_authorities (environment, adapter_id, provider_id, product_id, model_id, adapter_version, surface_id, surface_version, authority_version)`,
  `DROP INDEX IF EXISTS public_search_surface_authorities_scope_uidx`,
  `CREATE UNIQUE INDEX IF NOT EXISTS public_search_surface_authorities_scope_uidx
   ON public_search_surface_authorities (authority_version, adapter_id, provider_id, product_id, model_id, adapter_version, surface_id, surface_version)`,
  `DROP INDEX IF EXISTS public_search_surface_authorities_one_active_uidx`,
  `CREATE UNIQUE INDEX IF NOT EXISTS public_search_surface_authorities_one_active_uidx
   ON public_search_surface_authorities (environment, adapter_id, provider_id, product_id, model_id, adapter_version, surface_id) WHERE active = true`,
  `ALTER TABLE market_search_attempts DROP CONSTRAINT IF EXISTS market_search_attempts_status_check`,
  `ALTER TABLE market_search_attempts DROP CONSTRAINT IF EXISTS market_search_attempts_request_status_check`,
  `ALTER TABLE market_search_attempts ADD CONSTRAINT market_search_attempts_status_check
   CHECK (request_status IN ('pending','succeeded','partial','timeout','rate_limited','unavailable','malformed','aborted','authentication','unsupported'))`
] as const;

export const V15_DATABASE_MIGRATIONS = [
  `DROP INDEX IF EXISTS payment_orders_report_active_product_uidx`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_report_active_product_uidx
   ON payment_orders (report_id, product_code)
   WHERE payment_status IN ('created','pending')
      OR (payment_status = 'paid' AND refund_status <> 'refunded')`
] as const;

export const V16_DATABASE_MIGRATIONS = [
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS execution_state text NOT NULL DEFAULT 'queued'`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS current_phase text NOT NULL DEFAULT 'admission'`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS checkpoint_revision integer NOT NULL DEFAULT 0`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS phase_attempt integer NOT NULL DEFAULT 0`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS resume_generation integer NOT NULL DEFAULT 0`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS retry_not_before timestamptz`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS repair_reason_code text`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS repair_deadline_at timestamptz`,
  `UPDATE scan_jobs SET execution_state = CASE
     WHEN stage IN ('completed','completed_limited') THEN 'completed'
     WHEN stage = 'failed' THEN 'failed'
     ELSE 'queued' END,
     current_phase = CASE
       WHEN stage = 'discovering' THEN 'discovery' WHEN stage = 'planning' THEN 'planning'
       WHEN stage = 'fetching' THEN 'fetching' WHEN stage = 'analyzing' THEN 'page_analysis'
       WHEN stage = 'synthesizing' THEN 'website_synthesis'
       WHEN stage IN ('completed','completed_limited','failed') THEN 'terminalization' ELSE 'admission' END
   WHERE execution_state = 'queued' AND current_phase = 'admission'`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_execution_state_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_execution_state_check CHECK (execution_state IN ('queued','running','retry_wait','repair_wait','completed','failed'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_current_phase_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_current_phase_check CHECK (current_phase IN ('admission','discovery','planning','fetching','technical_audit','page_analysis','website_synthesis','public_source_preflight','question_generation','snapshot_resolution','source_retrieval','evidence_graph','report_build','artifact_verification','terminalization'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_repair_wait_lease_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_repair_wait_lease_check CHECK (execution_state <> 'repair_wait' OR (lease_owner IS NULL AND lease_expires_at IS NULL))`,
  `CREATE INDEX IF NOT EXISTS scan_jobs_execution_claim_idx ON scan_jobs (tier, execution_state, retry_not_before, created_at, id)`,
  `CREATE TABLE IF NOT EXISTS scan_job_error_events (
     id text PRIMARY KEY, job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
     phase text NOT NULL, checkpoint_revision integer NOT NULL, job_attempt integer NOT NULL,
     phase_attempt integer NOT NULL, resume_generation integer NOT NULL, classification text NOT NULL,
     code text NOT NULL, error_type text NOT NULL, message text NOT NULL, stack text,
     causes jsonb NOT NULL DEFAULT '[]'::jsonb, fingerprint text NOT NULL,
     retryable_at timestamptz, recorded_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS scan_job_error_events_job_recorded_idx ON scan_job_error_events (job_id, recorded_at)`,
  `CREATE TABLE IF NOT EXISTS scan_job_transition_events (
     id text PRIMARY KEY, job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
     from_execution_state text, to_execution_state text NOT NULL, phase text NOT NULL,
     checkpoint_revision integer NOT NULL, reason_code text,
     error_event_id text REFERENCES scan_job_error_events(id) ON DELETE RESTRICT,
     recorded_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS scan_job_transition_events_job_recorded_idx ON scan_job_transition_events (job_id, recorded_at)`,
  `CREATE OR REPLACE FUNCTION ogc_reject_job_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Job event history is append-only.'; END $$`,
  `DROP TRIGGER IF EXISTS scan_job_error_events_append_only ON scan_job_error_events`,
  `CREATE TRIGGER scan_job_error_events_append_only BEFORE UPDATE OR DELETE ON scan_job_error_events FOR EACH ROW EXECUTE FUNCTION ogc_reject_job_event_mutation()`,
  `DROP TRIGGER IF EXISTS scan_job_transition_events_append_only ON scan_job_transition_events`,
  `CREATE TRIGGER scan_job_transition_events_append_only BEFORE UPDATE OR DELETE ON scan_job_transition_events FOR EACH ROW EXECUTE FUNCTION ogc_reject_job_event_mutation()`
] as const;

// Event records remain immutable to application writes. PostgreSQL executes
// FK cascade deletes through a nested trigger, so that bounded cleanup must be
// permitted when its owning scan job/report is deleted; rejecting it would
// make the documented ON DELETE CASCADE relationship unusable.
export const V17_DATABASE_MIGRATIONS = [
  `CREATE OR REPLACE FUNCTION ogc_reject_job_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
     RAISE EXCEPTION 'Job event history is append-only.';
   END $$`
] as const;

export const V18_DATABASE_MIGRATIONS = [
  `ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS active_artifact_revision_id text`,
  `ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS business_question_set_id text`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS artifact_contract text`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS correction_id text`,
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS business_question_set_id text`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_reason_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_reason_check CHECK (reason IN ('standard','system_recovery','locale_correction','staging_regeneration','paid_report_correction','staging_artifact_refresh'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_artifact_contract_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_artifact_contract_check CHECK (artifact_contract IS NULL OR artifact_contract IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1'))`,
  `ALTER TABLE report_access_tokens DROP CONSTRAINT IF EXISTS report_access_tokens_artifact_scope_check`,
  `ALTER TABLE report_access_tokens ADD CONSTRAINT report_access_tokens_artifact_scope_check CHECK (artifact_scope IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1'))`,
  `ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_template_type_check`,
  `ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_template_type_check CHECK (template_type IN ('payment_confirmed','report_ready','limited_report_refund','report_failed_refund','refund_succeeded','refund_assistance','link_reissue','corrected_report_ready'))`,
  `CREATE TABLE IF NOT EXISTS report_business_question_sets (
     id text PRIMARY KEY,
     report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE CASCADE,
     order_id text REFERENCES payment_orders(id) ON DELETE RESTRICT,
     revision integer NOT NULL CHECK (revision > 0),
     locale text NOT NULL,
     region text NOT NULL,
     status text NOT NULL CHECK (status IN ('candidate','confirmed','locked','neutralization_failed')),
     confidence text NOT NULL CHECK (confidence IN ('low','high')),
     acknowledged_low_confidence boolean NOT NULL DEFAULT false,
     generation_rule_version text NOT NULL,
     neutralization_version text NOT NULL,
     profile_evidence_identity text NOT NULL,
     content_hash text,
     neutral_content_hash text,
     payload jsonb,
     confirmed_at timestamptz,
     locked_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT report_business_question_sets_confirmation_check CHECK (
       status NOT IN ('confirmed','locked') OR
       (confirmed_at IS NOT NULL AND content_hash IS NOT NULL AND neutral_content_hash IS NOT NULL AND payload IS NOT NULL)
     )
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_business_question_sets_report_revision_uidx ON report_business_question_sets(report_id,revision)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_business_question_sets_order_revision_uidx ON report_business_question_sets(order_id,revision) WHERE order_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS report_business_questions (
     id text PRIMARY KEY,
     question_set_id text NOT NULL REFERENCES report_business_question_sets(id) ON DELETE CASCADE,
     ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
     purpose text NOT NULL CHECK (purpose IN ('core_service_discovery','customer_region_fit','purchase_delivery_risk')),
     generated_text text NOT NULL,
     private_text text,
     neutral_public_text text NOT NULL,
     edited boolean NOT NULL DEFAULT false,
     neutral_content_hash text NOT NULL,
     derivation jsonb NOT NULL DEFAULT '{}'::jsonb,
     UNIQUE(question_set_id,ordinal),
     UNIQUE(question_set_id,purpose)
   )`,
  `CREATE OR REPLACE FUNCTION ogc_reject_locked_business_question_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE parent_status text;
   BEGIN
     IF TG_OP='DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
     SELECT status INTO parent_status FROM report_business_question_sets
       WHERE id=COALESCE(NEW.question_set_id,OLD.question_set_id);
     IF parent_status IN ('confirmed','locked') THEN
       RAISE EXCEPTION 'Confirmed business questions are immutable.';
     END IF;
     RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
   END $$`,
  `DROP TRIGGER IF EXISTS report_business_questions_immutability ON report_business_questions`,
  `CREATE TRIGGER report_business_questions_immutability BEFORE INSERT OR UPDATE OR DELETE ON report_business_questions
     FOR EACH ROW EXECUTE FUNCTION ogc_reject_locked_business_question_mutation()`,
  `CREATE OR REPLACE FUNCTION ogc_validate_locked_business_question_set() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF NEW.status IN ('confirmed','locked') THEN
       IF (SELECT count(*) FROM report_business_questions WHERE question_set_id=NEW.id) <> 3 THEN
         RAISE EXCEPTION 'A confirmed business question set requires exactly three questions.';
       END IF;
       IF (SELECT array_agg(purpose ORDER BY ordinal) FROM report_business_questions WHERE question_set_id=NEW.id)
          <> ARRAY['core_service_discovery','customer_region_fit','purchase_delivery_risk'] THEN
         RAISE EXCEPTION 'Business question purposes and ordinals are invalid.';
       END IF;
       IF NEW.confidence='low' AND NEW.acknowledged_low_confidence IS NOT TRUE THEN
         RAISE EXCEPTION 'Low-confidence business questions require acknowledgement.';
       END IF;
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_business_question_sets_validate ON report_business_question_sets`,
  `CREATE TRIGGER report_business_question_sets_validate BEFORE INSERT OR UPDATE ON report_business_question_sets FOR EACH ROW EXECUTE FUNCTION ogc_validate_locked_business_question_set()`,
  `CREATE TABLE IF NOT EXISTS report_corrections (
     id text PRIMARY KEY,
     order_id text NOT NULL UNIQUE REFERENCES payment_orders(id) ON DELETE RESTRICT,
     report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
     original_paid_job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE RESTRICT,
     correction_job_id text UNIQUE REFERENCES scan_jobs(id) ON DELETE RESTRICT,
     question_set_id text NOT NULL UNIQUE REFERENCES report_business_question_sets(id) ON DELETE RESTRICT,
     active_artifact_revision_id text,
     state text NOT NULL DEFAULT 'review_required' CHECK (state IN ('review_required','queued','running','repair_wait','completed','failed')),
     created_at timestamptz NOT NULL DEFAULT now(),
     completed_at timestamptz
   )`,
  `CREATE TABLE IF NOT EXISTS report_artifact_revisions (
     id text PRIMARY KEY,
     report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
     order_id text NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
     job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE RESTRICT,
     correction_id text REFERENCES report_corrections(id) ON DELETE RESTRICT,
     revision integer NOT NULL CHECK (revision > 0),
     artifact_contract text NOT NULL CHECK (artifact_contract='combined_geo_report_v1'),
     status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','active','failed')),
     payload_identity_hash text NOT NULL,
     html_sha256 text,
     pdf_sha256 text,
     pdf_storage_key text,
     readiness jsonb NOT NULL DEFAULT '{}'::jsonb,
     ready_at timestamptz,
     activated_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT report_artifact_revisions_ready_check CHECK (
       status NOT IN ('ready','active') OR
       (ready_at IS NOT NULL AND html_sha256 IS NOT NULL AND pdf_sha256 IS NOT NULL AND pdf_storage_key IS NOT NULL)
     ),
     UNIQUE(report_id,revision)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_artifact_revisions_one_active_uidx ON report_artifact_revisions(report_id) WHERE status='active'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_artifact_revisions_job_uidx ON report_artifact_revisions(job_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_artifact_revisions_correction_uidx ON report_artifact_revisions(correction_id) WHERE correction_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS combined_geo_reports (
     artifact_revision_id text PRIMARY KEY REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT,
     report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
     order_id text NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
     job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE RESTRICT,
     question_set_id text NOT NULL REFERENCES report_business_question_sets(id) ON DELETE RESTRICT,
     payload jsonb NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE(report_id,job_id)
   )`,
  `ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_business_question_set_id_fkey`,
  `ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_business_question_set_id_fkey FOREIGN KEY(business_question_set_id) REFERENCES report_business_question_sets(id) ON DELETE RESTRICT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_business_question_set_uidx ON payment_orders(business_question_set_id) WHERE business_question_set_id IS NOT NULL`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_correction_id_fkey`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_correction_id_fkey FOREIGN KEY(correction_id) REFERENCES report_corrections(id) ON DELETE RESTRICT`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_business_question_set_id_fkey`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_business_question_set_id_fkey FOREIGN KEY(business_question_set_id) REFERENCES report_business_question_sets(id) ON DELETE RESTRICT`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_correction_credit_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_correction_credit_check CHECK (
     reason <> 'paid_report_correction' OR
     (credit_reservation_id IS NULL AND artifact_contract='combined_geo_report_v1' AND correction_id IS NOT NULL AND business_question_set_id IS NOT NULL)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scan_jobs_correction_uidx ON scan_jobs(correction_id) WHERE correction_id IS NOT NULL`,
  `ALTER TABLE scan_reports DROP CONSTRAINT IF EXISTS scan_reports_active_artifact_revision_id_fkey`,
  `ALTER TABLE scan_reports ADD CONSTRAINT scan_reports_active_artifact_revision_id_fkey FOREIGN KEY(active_artifact_revision_id) REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT`,
  `ALTER TABLE report_corrections DROP CONSTRAINT IF EXISTS report_corrections_active_artifact_revision_id_fkey`,
  `ALTER TABLE report_corrections ADD CONSTRAINT report_corrections_active_artifact_revision_id_fkey FOREIGN KEY(active_artifact_revision_id) REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT`,
  `CREATE OR REPLACE FUNCTION ogc_reject_private_identity_in_shared_market_data() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE shared_payload text := lower(to_jsonb(NEW)::text); identity text;
   BEGIN
     FOR identity IN
       SELECT value FROM (
         SELECT sets.order_id AS value FROM report_business_question_sets sets WHERE sets.order_id IS NOT NULL
         UNION ALL SELECT sets.report_id FROM report_business_question_sets sets
         UNION ALL SELECT questions.private_text FROM report_business_questions questions
           WHERE questions.private_text IS NOT NULL AND questions.private_text <> questions.neutral_public_text
         UNION ALL SELECT jsonb_array_elements_text(sets.payload->'identityExclusions') FROM report_business_question_sets sets
           WHERE jsonb_typeof(sets.payload->'identityExclusions')='array'
       ) forbidden WHERE value IS NOT NULL AND length(btrim(value)) >= 4
     LOOP
       IF position(lower(identity) in shared_payload) > 0 THEN
         RAISE EXCEPTION 'Shared market data contains private customer identity.';
       END IF;
     END LOOP;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_snapshot_questions_private_identity_guard ON market_snapshot_questions`,
  `CREATE TRIGGER market_snapshot_questions_private_identity_guard BEFORE INSERT OR UPDATE ON market_snapshot_questions FOR EACH ROW EXECUTE FUNCTION ogc_reject_private_identity_in_shared_market_data()`,
  `DROP TRIGGER IF EXISTS market_snapshot_queries_private_identity_guard ON market_snapshot_queries`,
  `CREATE TRIGGER market_snapshot_queries_private_identity_guard BEFORE INSERT OR UPDATE ON market_snapshot_queries FOR EACH ROW EXECUTE FUNCTION ogc_reject_private_identity_in_shared_market_data()`,
  `DROP TRIGGER IF EXISTS market_search_attempts_private_identity_guard ON market_search_attempts`,
  `CREATE TRIGGER market_search_attempts_private_identity_guard BEFORE INSERT OR UPDATE ON market_search_attempts FOR EACH ROW EXECUTE FUNCTION ogc_reject_private_identity_in_shared_market_data()`,
  `DROP TRIGGER IF EXISTS market_search_observations_private_identity_guard ON market_search_observations`,
  `CREATE TRIGGER market_search_observations_private_identity_guard BEFORE INSERT OR UPDATE ON market_search_observations FOR EACH ROW EXECUTE FUNCTION ogc_reject_private_identity_in_shared_market_data()`,
  `DROP TRIGGER IF EXISTS market_source_evidence_private_identity_guard ON market_source_evidence`,
  `CREATE TRIGGER market_source_evidence_private_identity_guard BEFORE INSERT OR UPDATE ON market_source_evidence FOR EACH ROW EXECUTE FUNCTION ogc_reject_private_identity_in_shared_market_data()`
] as const;

export const V19_DATABASE_MIGRATIONS = [
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_reason_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_reason_check CHECK (reason IN ('standard','system_recovery','locale_correction','staging_regeneration','paid_report_correction','staging_artifact_refresh'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_refresh_credit_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_refresh_credit_check CHECK (
     reason <> 'staging_artifact_refresh' OR
     (credit_reservation_id IS NULL AND artifact_contract='combined_geo_report_v1' AND correction_id IS NULL AND business_question_set_id IS NOT NULL AND tier='deep')
   )`,
  `ALTER TABLE report_artifact_revisions ADD COLUMN IF NOT EXISTS source_artifact_revision_id text`,
  `ALTER TABLE report_artifact_revisions ADD COLUMN IF NOT EXISTS revision_kind text NOT NULL DEFAULT 'generation'`,
  `UPDATE report_artifact_revisions SET revision_kind='correction' WHERE correction_id IS NOT NULL AND revision_kind='generation'`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_source_fkey`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_source_fkey FOREIGN KEY(source_artifact_revision_id) REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_kind_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_kind_check CHECK (revision_kind IN ('generation','correction','presentation_refresh'))`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_lineage_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_lineage_check CHECK (
     (revision_kind='presentation_refresh' AND source_artifact_revision_id IS NOT NULL AND correction_id IS NULL)
     OR (revision_kind<>'presentation_refresh' AND source_artifact_revision_id IS NULL)
   )`
] as const;

export const V20_DATABASE_MIGRATIONS = [
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_current_phase_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_current_phase_check CHECK (current_phase IN ('admission','discovery','planning','fetching','technical_audit','page_analysis','website_synthesis','public_source_preflight','question_generation','snapshot_resolution','provider_discovery_search','candidate_resolution','candidate_verification','provider_source_retrieval','provider_passage_selection','provider_claim_extraction','provider_qualification','grounded_answer_synthesis','source_retrieval','evidence_graph','report_build','artifact_verification','terminalization'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_artifact_contract_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_artifact_contract_check CHECK (artifact_contract IS NULL OR artifact_contract IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1','combined_geo_report_v2'))`,
  `ALTER TABLE report_access_tokens DROP CONSTRAINT IF EXISTS report_access_tokens_artifact_scope_check`,
  `ALTER TABLE report_access_tokens ADD CONSTRAINT report_access_tokens_artifact_scope_check CHECK (artifact_scope IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1','combined_geo_report_v2'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_correction_credit_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_correction_credit_check CHECK (reason <> 'paid_report_correction' OR (credit_reservation_id IS NULL AND artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2') AND correction_id IS NOT NULL AND business_question_set_id IS NOT NULL))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_refresh_credit_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_refresh_credit_check CHECK (reason <> 'staging_artifact_refresh' OR (credit_reservation_id IS NULL AND artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2') AND correction_id IS NULL AND business_question_set_id IS NOT NULL AND tier='deep'))`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_contract_check`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_artifact_contract_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_contract_check CHECK (artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2'))`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_kind_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_kind_check CHECK (revision_kind IN ('generation','correction','presentation_refresh','evidence_refresh'))`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_lineage_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_lineage_check CHECK ((revision_kind IN ('presentation_refresh','evidence_refresh') AND source_artifact_revision_id IS NOT NULL AND correction_id IS NULL) OR (revision_kind NOT IN ('presentation_refresh','evidence_refresh') AND source_artifact_revision_id IS NULL))`,
  `ALTER TABLE market_snapshot_questions ADD COLUMN IF NOT EXISTS snapshot_kind text NOT NULL DEFAULT 'standard_question'`,
  `ALTER TABLE market_snapshot_questions ADD COLUMN IF NOT EXISTS parent_snapshot_id text`,
  `ALTER TABLE market_snapshot_questions ADD COLUMN IF NOT EXISTS candidate_set_hash text`,
  `ALTER TABLE market_snapshot_questions ADD COLUMN IF NOT EXISTS query_plan_version text NOT NULL DEFAULT 'legacy-standard-v1'`,
  `ALTER TABLE market_snapshot_questions DROP CONSTRAINT IF EXISTS market_snapshot_questions_parent_fkey`,
  `ALTER TABLE market_snapshot_questions ADD CONSTRAINT market_snapshot_questions_parent_fkey FOREIGN KEY(parent_snapshot_id) REFERENCES market_snapshot_questions(id) ON DELETE RESTRICT`,
  `ALTER TABLE market_snapshot_questions DROP CONSTRAINT IF EXISTS market_snapshot_questions_kind_check`,
  `ALTER TABLE market_snapshot_questions ADD CONSTRAINT market_snapshot_questions_kind_check CHECK (snapshot_kind IN ('standard_question','provider_discovery','candidate_verification'))`,
  `ALTER TABLE market_snapshot_questions DROP CONSTRAINT IF EXISTS market_snapshot_questions_query_plan_check`,
  `ALTER TABLE market_snapshot_questions ADD CONSTRAINT market_snapshot_questions_query_plan_check CHECK (length(btrim(query_plan_version)) > 0)`,
  `ALTER TABLE market_snapshot_questions DROP CONSTRAINT IF EXISTS market_snapshot_questions_ancestry_shape_check`,
  `ALTER TABLE market_snapshot_questions ADD CONSTRAINT market_snapshot_questions_ancestry_shape_check CHECK (
     (snapshot_kind IN ('standard_question','provider_discovery') AND parent_snapshot_id IS NULL AND candidate_set_hash IS NULL)
     OR (snapshot_kind='candidate_verification' AND parent_snapshot_id IS NOT NULL AND candidate_set_hash ~ '^[a-f0-9]{64}$')
   )`,
  `CREATE OR REPLACE FUNCTION ogc_validate_provider_snapshot_ancestry() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE parent_kind text; parent_status text;
   BEGIN
     IF NEW.snapshot_kind <> 'candidate_verification' THEN RETURN NEW; END IF;
     SELECT snapshot_kind,status INTO parent_kind,parent_status FROM market_snapshot_questions WHERE id=NEW.parent_snapshot_id;
     IF parent_kind IS DISTINCT FROM 'provider_discovery' OR parent_status IS DISTINCT FROM 'completed' THEN
       RAISE EXCEPTION 'Candidate verification requires a completed provider-discovery parent snapshot.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_snapshot_questions_provider_ancestry_trigger ON market_snapshot_questions`,
  `CREATE TRIGGER market_snapshot_questions_provider_ancestry_trigger BEFORE INSERT OR UPDATE OF snapshot_kind,parent_snapshot_id,candidate_set_hash ON market_snapshot_questions FOR EACH ROW EXECUTE FUNCTION ogc_validate_provider_snapshot_ancestry()`,
  `CREATE TABLE IF NOT EXISTS market_source_passages (
     id text PRIMARY KEY,
     source_evidence_id text NOT NULL REFERENCES market_source_evidence(id) ON DELETE RESTRICT,
     passage_order integer NOT NULL,
     exact_excerpt text NOT NULL,
     excerpt_hash text NOT NULL,
     relevance_score integer NOT NULL,
     matched_entity_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
     matched_service_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
     matched_control_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
     matched_capability_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
     selector_version text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT market_source_passages_source_order_key UNIQUE(source_evidence_id,passage_order),
     CONSTRAINT market_source_passages_source_hash_key UNIQUE(source_evidence_id,excerpt_hash),
     CONSTRAINT market_source_passages_order_check CHECK(passage_order >= 0),
     CONSTRAINT market_source_passages_excerpt_check CHECK(char_length(btrim(exact_excerpt)) BETWEEN 1 AND 1200),
     CONSTRAINT market_source_passages_hash_check CHECK(excerpt_hash ~ '^[a-f0-9]{64}$'),
     CONSTRAINT market_source_passages_score_check CHECK(relevance_score BETWEEN 0 AND 100),
     CONSTRAINT market_source_passages_selector_check CHECK(length(btrim(selector_version)) > 0),
     CONSTRAINT market_source_passages_entity_privacy_check CHECK(ogc_public_jsonb_metadata_valid(matched_entity_terms)),
     CONSTRAINT market_source_passages_service_privacy_check CHECK(ogc_public_jsonb_metadata_valid(matched_service_terms)),
     CONSTRAINT market_source_passages_control_privacy_check CHECK(ogc_public_jsonb_metadata_valid(matched_control_terms)),
     CONSTRAINT market_source_passages_capability_privacy_check CHECK(ogc_public_jsonb_metadata_valid(matched_capability_terms))
   )`,
  `CREATE INDEX IF NOT EXISTS market_source_passages_source_score_idx ON market_source_passages(source_evidence_id,relevance_score DESC)`,
  `CREATE OR REPLACE FUNCTION ogc_limit_market_source_passages() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     PERFORM pg_advisory_xact_lock(hashtextextended(NEW.source_evidence_id,0));
     IF EXISTS (SELECT 1 FROM market_source_passages WHERE id=NEW.id) THEN RETURN NEW; END IF;
     IF (SELECT count(*) FROM market_source_passages WHERE source_evidence_id=NEW.source_evidence_id) >= 3 THEN
       RAISE EXCEPTION 'A market source retains at most three relevant passages.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS market_source_passages_limit_trigger ON market_source_passages`,
  `CREATE TRIGGER market_source_passages_limit_trigger BEFORE INSERT ON market_source_passages FOR EACH ROW EXECUTE FUNCTION ogc_limit_market_source_passages()`,
  `DROP TRIGGER IF EXISTS market_source_passages_immutability_trigger ON market_source_passages`,
  `CREATE TRIGGER market_source_passages_immutability_trigger BEFORE UPDATE OR DELETE ON market_source_passages FOR EACH ROW EXECUTE FUNCTION ogc_prevent_market_immutable_row_mutation()`,
  `DROP TRIGGER IF EXISTS market_source_passages_private_identity_guard ON market_source_passages`,
  `CREATE TRIGGER market_source_passages_private_identity_guard BEFORE INSERT OR UPDATE ON market_source_passages FOR EACH ROW EXECUTE FUNCTION ogc_reject_private_identity_in_shared_market_data()`,
  `CREATE TABLE IF NOT EXISTS market_provider_claims (
     id text PRIMARY KEY,
     passage_id text NOT NULL REFERENCES market_source_passages(id) ON DELETE RESTRICT,
     provider_entity_id text NOT NULL,
     canonical_name text NOT NULL,
     generic_role text NOT NULL,
     policy_role text NOT NULL,
     capability text NOT NULL,
     operating_mode text NOT NULL,
     service_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
     route_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
     exact_excerpt text NOT NULL,
     claim_hash text NOT NULL,
     extraction_model text NOT NULL,
     extraction_contract text NOT NULL,
     validation_status text NOT NULL,
     rejection_reason text,
     created_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT market_provider_claims_passage_hash_key UNIQUE(passage_id,claim_hash),
     CONSTRAINT market_provider_claims_excerpt_check CHECK(char_length(btrim(exact_excerpt)) BETWEEN 1 AND 1200),
     CONSTRAINT market_provider_claims_hash_check CHECK(claim_hash ~ '^[a-f0-9]{64}$'),
     CONSTRAINT market_provider_claims_status_check CHECK(validation_status IN ('accepted','rejected')),
     CONSTRAINT market_provider_claims_rejection_check CHECK(
       (validation_status='accepted' AND rejection_reason IS NULL)
       OR (validation_status='rejected' AND char_length(btrim(rejection_reason)) BETWEEN 1 AND 240)
     ),
     CONSTRAINT market_provider_claims_service_privacy_check CHECK(ogc_public_jsonb_metadata_valid(service_scope)),
     CONSTRAINT market_provider_claims_route_privacy_check CHECK(ogc_public_jsonb_metadata_valid(route_scope))
   )`,
  `CREATE INDEX IF NOT EXISTS market_provider_claims_provider_idx ON market_provider_claims(provider_entity_id,validation_status)`,
  `DROP TRIGGER IF EXISTS market_provider_claims_immutability_trigger ON market_provider_claims`,
  `CREATE TRIGGER market_provider_claims_immutability_trigger BEFORE UPDATE OR DELETE ON market_provider_claims FOR EACH ROW EXECUTE FUNCTION ogc_prevent_market_immutable_row_mutation()`,
  `DROP TRIGGER IF EXISTS market_provider_claims_private_identity_guard ON market_provider_claims`,
  `CREATE TRIGGER market_provider_claims_private_identity_guard BEFORE INSERT OR UPDATE ON market_provider_claims FOR EACH ROW EXECUTE FUNCTION ogc_reject_private_identity_in_shared_market_data()`
] as const;

export const V21_DATABASE_MIGRATIONS = [
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_artifact_contract_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_artifact_contract_check CHECK (artifact_contract IS NULL OR artifact_contract IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3'))`,
  `ALTER TABLE report_access_tokens DROP CONSTRAINT IF EXISTS report_access_tokens_artifact_scope_check`,
  `ALTER TABLE report_access_tokens ADD CONSTRAINT report_access_tokens_artifact_scope_check CHECK (artifact_scope IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_correction_credit_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_correction_credit_check CHECK (reason <> 'paid_report_correction' OR (credit_reservation_id IS NULL AND artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') AND correction_id IS NOT NULL AND business_question_set_id IS NOT NULL))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_refresh_credit_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_refresh_credit_check CHECK (reason <> 'staging_artifact_refresh' OR (credit_reservation_id IS NULL AND artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') AND correction_id IS NULL AND business_question_set_id IS NOT NULL AND tier='deep'))`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_contract_check`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_artifact_contract_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_contract_check CHECK (artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3'))`
] as const;

export const V22_DATABASE_MIGRATIONS = [
  `DROP INDEX IF EXISTS report_market_snapshot_refs_job_cache_uidx`
] as const;

export const V23_DATABASE_MIGRATIONS = [
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS replacement_fulfillment_id text`,
  `ALTER TABLE report_artifact_revisions ADD COLUMN IF NOT EXISTS replacement_fulfillment_id text`,
  `CREATE TABLE IF NOT EXISTS report_replacement_fulfillments (
     id text PRIMARY KEY,
     order_id text NOT NULL UNIQUE REFERENCES payment_orders(id) ON DELETE RESTRICT,
     report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
     original_failed_job_id text NOT NULL UNIQUE REFERENCES scan_jobs(id) ON DELETE RESTRICT,
     failed_artifact_revision_id text NOT NULL UNIQUE REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT,
     question_set_id text NOT NULL REFERENCES report_business_question_sets(id) ON DELETE RESTRICT,
     replacement_job_id text UNIQUE REFERENCES scan_jobs(id) ON DELETE RESTRICT,
     active_artifact_revision_id text UNIQUE REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT,
     reason_code text NOT NULL CHECK (reason_code='paid_report_not_delivered'),
     state text NOT NULL CHECK (state IN ('prepared','queued','running','repair_wait','completed','failed')),
     operator_authorization_ref text NOT NULL CHECK (length(btrim(operator_authorization_ref)) > 0),
     created_at timestamptz NOT NULL DEFAULT now(),
     completed_at timestamptz
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scan_jobs_replacement_fulfillment_uidx ON scan_jobs(replacement_fulfillment_id) WHERE replacement_fulfillment_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_artifact_revisions_replacement_uidx ON report_artifact_revisions(replacement_fulfillment_id) WHERE replacement_fulfillment_id IS NOT NULL`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_replacement_fulfillment_fkey`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_replacement_fulfillment_fkey FOREIGN KEY(replacement_fulfillment_id) REFERENCES report_replacement_fulfillments(id) ON DELETE RESTRICT`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_replacement_fkey`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_replacement_fkey FOREIGN KEY(replacement_fulfillment_id) REFERENCES report_replacement_fulfillments(id) ON DELETE RESTRICT`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_reason_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_reason_check CHECK (reason IN ('standard','system_recovery','locale_correction','staging_regeneration','paid_report_correction','staging_artifact_refresh','replacement_fulfillment'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_replacement_fulfillment_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_replacement_fulfillment_check CHECK (
     (reason='replacement_fulfillment' AND replacement_fulfillment_id IS NOT NULL AND credit_reservation_id IS NULL AND artifact_contract='combined_geo_report_v3' AND correction_id IS NULL AND business_question_set_id IS NOT NULL AND tier='deep')
     OR (reason<>'replacement_fulfillment' AND replacement_fulfillment_id IS NULL)
   )`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_kind_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_kind_check CHECK (revision_kind IN ('generation','correction','presentation_refresh','evidence_refresh','replacement'))`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_lineage_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_lineage_check CHECK (
     (revision_kind IN ('presentation_refresh','evidence_refresh') AND source_artifact_revision_id IS NOT NULL AND correction_id IS NULL AND replacement_fulfillment_id IS NULL)
     OR (revision_kind='replacement' AND source_artifact_revision_id IS NULL AND correction_id IS NULL AND replacement_fulfillment_id IS NOT NULL)
     OR (revision_kind IN ('generation','correction') AND source_artifact_revision_id IS NULL AND replacement_fulfillment_id IS NULL)
   )`
] as const;

export const V24_DATABASE_MIGRATIONS = [
  `ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_template_type_check`,
  `ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_template_type_check CHECK (template_type IN ('payment_confirmed','report_ready','limited_report_refund','report_failed_refund','refund_succeeded','refund_assistance','link_reissue','corrected_report_ready','replacement_report_ready'))`
] as const;

const DATABASE_MIGRATION_STEPS = [
  { version: 9, migrations: V9_DATABASE_MIGRATIONS },
  { version: 10, migrations: V10_DATABASE_MIGRATIONS },
  { version: 11, migrations: V11_DATABASE_MIGRATIONS },
  { version: 12, migrations: V12_DATABASE_MIGRATIONS },
  { version: 13, migrations: V13_DATABASE_MIGRATIONS },
  { version: 14, migrations: V14_DATABASE_MIGRATIONS },
  { version: 15, migrations: V15_DATABASE_MIGRATIONS },
  { version: 16, migrations: V16_DATABASE_MIGRATIONS },
  { version: 17, migrations: V17_DATABASE_MIGRATIONS },
  { version: 18, migrations: V18_DATABASE_MIGRATIONS },
  { version: 19, migrations: V19_DATABASE_MIGRATIONS },
  { version: 20, migrations: V20_DATABASE_MIGRATIONS },
  { version: 21, migrations: V21_DATABASE_MIGRATIONS },
  { version: 22, migrations: V22_DATABASE_MIGRATIONS },
  { version: 23, migrations: V23_DATABASE_MIGRATIONS },
  { version: 24, migrations: V24_DATABASE_MIGRATIONS }
] as const;

export function databaseMigrationsAfter(currentVersion: number | undefined): string[] {
  const version = currentVersion ?? 0;
  return DATABASE_MIGRATION_STEPS
    .filter((step) => step.version > version)
    .flatMap((step) => [...step.migrations]);
}

export const DATABASE_MIGRATIONS = databaseMigrationsAfter(undefined);
