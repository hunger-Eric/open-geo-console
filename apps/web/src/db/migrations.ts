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

export const V25_DATABASE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS public_source_retrieval_attempts (
     id text PRIMARY KEY,
     report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
     job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE RESTRICT,
     question_id text NOT NULL REFERENCES report_business_questions(id) ON DELETE RESTRICT,
     snapshot_id text NOT NULL REFERENCES market_snapshot_questions(id) ON DELETE RESTRICT,
     observation_id text NOT NULL REFERENCES market_search_observations(id) ON DELETE RESTRICT,
     canonical_url text NOT NULL,
     final_url text,
     registrable_domain text NOT NULL,
     method text NOT NULL,
     attempt_order integer NOT NULL,
     stage text NOT NULL,
     outcome text NOT NULL,
     http_status integer,
     robots_outcome text,
     content_type text,
     content_bytes integer,
     duration_ms integer NOT NULL,
     extractor_version text,
     decoder_version text,
     browser_policy_version text,
     retry_eligible boolean NOT NULL,
     browser_eligible boolean NOT NULL,
     safe_detail text,
     started_at timestamptz NOT NULL,
     completed_at timestamptz NOT NULL,
     CONSTRAINT public_source_retrieval_attempts_method_check CHECK(method IN ('http','browser')),
     CONSTRAINT public_source_retrieval_attempts_stage_check CHECK(stage IN ('candidate_selected','dns_validation','robots_evaluation','http_request','http_response_validation','document_decoding','content_extraction','question_relevance','subject_resolution','evidence_classification','terminal')),
     CONSTRAINT public_source_retrieval_attempts_outcome_check CHECK(outcome IN ('available','duplicate','domain_cap','question_budget_exhausted','unsafe_destination','dns_failed','connect_timeout','tls_failed','robots_denied','robots_unavailable','redirect_invalid','redirect_limit','http_403','http_404','http_429','http_5xx','challenge_detected','authentication_required','unsupported_content_type','response_too_large','body_empty','javascript_shell','decoding_failed','extraction_failed','irrelevant_to_question','subject_ambiguous','contradictory','evidence_rejected','caller_aborted','phase_deadline','worker_deadline','internal_failure')),
     CONSTRAINT public_source_retrieval_attempts_url_check CHECK(canonical_url ~ '^https?://' AND (final_url IS NULL OR final_url ~ '^https?://')),
     CONSTRAINT public_source_retrieval_attempts_order_check CHECK(attempt_order >= 0),
     CONSTRAINT public_source_retrieval_attempts_status_check CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
     CONSTRAINT public_source_retrieval_attempts_robots_check CHECK(robots_outcome IS NULL OR robots_outcome IN ('allowed','denied','missing','unavailable')),
     CONSTRAINT public_source_retrieval_attempts_size_check CHECK(content_bytes IS NULL OR content_bytes >= 0),
     CONSTRAINT public_source_retrieval_attempts_duration_check CHECK(duration_ms >= 0),
     CONSTRAINT public_source_retrieval_attempts_detail_check CHECK(safe_detail IS NULL OR char_length(safe_detail) <= 240),
     CONSTRAINT public_source_retrieval_attempts_time_check CHECK(completed_at >= started_at)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS public_source_retrieval_attempts_scope_uidx ON public_source_retrieval_attempts(snapshot_id,question_id,canonical_url,method,attempt_order)`,
  `CREATE INDEX IF NOT EXISTS public_source_retrieval_attempts_question_idx ON public_source_retrieval_attempts(report_id,job_id,question_id,attempt_order)`,
  `DROP TRIGGER IF EXISTS public_source_retrieval_attempts_immutability_trigger ON public_source_retrieval_attempts`,
  `CREATE TRIGGER public_source_retrieval_attempts_immutability_trigger BEFORE UPDATE OR DELETE ON public_source_retrieval_attempts FOR EACH ROW EXECUTE FUNCTION ogc_prevent_market_immutable_row_mutation()`,
  `CREATE TABLE IF NOT EXISTS question_acquisition_checkpoints (
     identity_hash text PRIMARY KEY,
     report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
     job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE RESTRICT,
     question_id text NOT NULL REFERENCES report_business_questions(id) ON DELETE RESTRICT,
     snapshot_id text NOT NULL REFERENCES market_snapshot_questions(id) ON DELETE RESTRICT,
     candidate_pool_hash text NOT NULL,
     state text NOT NULL,
     planned_candidates integer NOT NULL,
     attempted_candidates integer NOT NULL,
     remaining_candidates integer NOT NULL,
     returned_observations integer NOT NULL,
     extracted_documents integer NOT NULL,
     eligible_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
     independent_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
     query_rewrites_used integer NOT NULL,
     http_budget_used integer NOT NULL,
     browser_budget_used integer NOT NULL,
     revision integer NOT NULL,
     updated_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT question_acquisition_checkpoints_hash_check CHECK(identity_hash ~ '^[a-f0-9]{64}$' AND candidate_pool_hash ~ '^[a-f0-9]{64}$'),
     CONSTRAINT question_acquisition_checkpoints_state_check CHECK(state IN ('collecting','evidence_target_met','exhausted','collection_failed')),
     CONSTRAINT question_acquisition_checkpoints_count_check CHECK(planned_candidates >= 0 AND attempted_candidates >= 0 AND remaining_candidates >= 0 AND returned_observations >= 0 AND extracted_documents >= 0 AND query_rewrites_used >= 0 AND http_budget_used >= 0 AND browser_budget_used >= 0 AND revision >= 1),
     CONSTRAINT question_acquisition_checkpoints_candidate_check CHECK(attempted_candidates + remaining_candidates <= planned_candidates),
     CONSTRAINT question_acquisition_checkpoints_evidence_check CHECK(jsonb_typeof(eligible_evidence_ids)='array' AND jsonb_typeof(independent_domains)='array')
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS question_acquisition_checkpoints_job_question_uidx ON question_acquisition_checkpoints(job_id,question_id)`
] as const;

export const V26_DATABASE_MIGRATIONS = [
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_methodology_contract_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_methodology_contract_check CHECK (
     (product_contract = 'legacy_website_audit_v1' AND fulfillment_methodology IS NULL AND recommendation_report_version IS NULL)
     OR (product_contract = 'recommendation_forensics_v1'
       AND fulfillment_methodology IS NOT NULL AND recommendation_report_version IS NOT NULL
       AND ((fulfillment_methodology = 'answer_engine_recommendation_forensics_v1' AND recommendation_report_version = 1)
         OR (fulfillment_methodology = 'public_search_source_forensics_v1' AND recommendation_report_version = 2)
         OR (fulfillment_methodology = 'two_stage_geo_report_v4' AND recommendation_report_version = 4)))
   )`,
  `ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_methodology_product_check`,
  `ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_methodology_product_check CHECK (
     (product_code = 'recommendation_forensics_v1'
       AND fulfillment_methodology IS NOT NULL AND recommendation_report_version IS NOT NULL
       AND ((fulfillment_methodology = 'answer_engine_recommendation_forensics_v1' AND recommendation_report_version = 1)
         OR (fulfillment_methodology = 'public_search_source_forensics_v1' AND recommendation_report_version = 2)
         OR (fulfillment_methodology = 'two_stage_geo_report_v4' AND recommendation_report_version = 4)))
     OR (product_code <> 'recommendation_forensics_v1' AND fulfillment_methodology IS NULL AND recommendation_report_version IS NULL)
   )`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_reason_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_reason_check CHECK (reason IN ('standard','system_recovery','locale_correction','staging_regeneration','paid_report_correction','staging_artifact_refresh','replacement_fulfillment','v4_diagnosis_enhancement'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_artifact_contract_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_artifact_contract_check CHECK (artifact_contract IS NULL OR artifact_contract IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3','combined_geo_report_v4'))`,
  `ALTER TABLE report_access_tokens DROP CONSTRAINT IF EXISTS report_access_tokens_artifact_scope_check`,
  `ALTER TABLE report_access_tokens ADD CONSTRAINT report_access_tokens_artifact_scope_check CHECK (artifact_scope IN ('legacy_website_audit_v1','recommendation_forensics_v1','combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3','combined_geo_report_v4'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_v4_methodology_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_v4_methodology_check CHECK (
     (artifact_contract='combined_geo_report_v4' AND fulfillment_methodology='two_stage_geo_report_v4' AND recommendation_report_version=4)
     OR ((artifact_contract IS NULL OR artifact_contract<>'combined_geo_report_v4') AND (fulfillment_methodology IS NULL OR fulfillment_methodology<>'two_stage_geo_report_v4'))
   )`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_v4_enhancement_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_v4_enhancement_check CHECK (
     reason <> 'v4_diagnosis_enhancement'
     OR (tier='deep' AND product_contract='recommendation_forensics_v1'
       AND fulfillment_methodology='two_stage_geo_report_v4' AND recommendation_report_version=4
       AND artifact_contract='combined_geo_report_v4' AND business_question_set_id IS NOT NULL
       AND credit_reservation_id IS NULL AND correction_id IS NULL AND replacement_fulfillment_id IS NULL)
   )`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_contract_check`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_artifact_contract_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_contract_check CHECK (artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3','combined_geo_report_v4'))`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_kind_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_kind_check CHECK (revision_kind IN ('generation','correction','presentation_refresh','evidence_refresh','replacement','diagnosis_enhancement'))`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_lineage_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_lineage_check CHECK (
     (revision_kind IN ('presentation_refresh','evidence_refresh','diagnosis_enhancement') AND source_artifact_revision_id IS NOT NULL AND correction_id IS NULL AND replacement_fulfillment_id IS NULL)
     OR (revision_kind='replacement' AND source_artifact_revision_id IS NULL AND correction_id IS NULL AND replacement_fulfillment_id IS NOT NULL)
     OR (revision_kind IN ('generation','correction') AND source_artifact_revision_id IS NULL AND replacement_fulfillment_id IS NULL)
   )`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_v4_kind_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_v4_kind_check CHECK (
     (artifact_contract='combined_geo_report_v4' AND revision_kind IN ('generation','diagnosis_enhancement'))
     OR (artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') AND revision_kind<>'diagnosis_enhancement')
   )`,
  `CREATE OR REPLACE FUNCTION ogc_validate_v4_diagnosis_enhancement_source() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE source_contract text; source_kind text; source_status text; source_report_id text; source_order_id text;
   BEGIN
     IF NEW.revision_kind <> 'diagnosis_enhancement' THEN RETURN NEW; END IF;
     SELECT artifact_contract, revision_kind, status, report_id, order_id
       INTO source_contract, source_kind, source_status, source_report_id, source_order_id
       FROM report_artifact_revisions WHERE id=NEW.source_artifact_revision_id;
     IF source_contract IS DISTINCT FROM 'combined_geo_report_v4'
       OR source_kind IS DISTINCT FROM 'generation'
       OR source_status NOT IN ('ready','active')
       OR source_report_id IS DISTINCT FROM NEW.report_id
       OR source_order_id IS DISTINCT FROM NEW.order_id THEN
       RAISE EXCEPTION 'A V4 diagnosis enhancement must extend a ready core V4 revision for the same report and order.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_artifact_revisions_v4_diagnosis_source_trigger ON report_artifact_revisions`,
  `CREATE TRIGGER report_artifact_revisions_v4_diagnosis_source_trigger BEFORE INSERT OR UPDATE ON report_artifact_revisions FOR EACH ROW EXECUTE FUNCTION ogc_validate_v4_diagnosis_enhancement_source()`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_ready_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_ready_check CHECK (
     status NOT IN ('ready','active')
     OR (ready_at IS NOT NULL AND html_sha256 IS NOT NULL AND (
       (artifact_contract='combined_geo_report_v4' AND pdf_sha256 IS NULL AND pdf_storage_key IS NULL)
       OR (artifact_contract IN ('combined_geo_report_v1','combined_geo_report_v2','combined_geo_report_v3') AND pdf_sha256 IS NOT NULL AND pdf_storage_key IS NOT NULL)
     ))
   )`,
  `CREATE TABLE IF NOT EXISTS report_v4_site_snapshots (
     id text PRIMARY KEY,
     report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
     site_key text NOT NULL,
     status text NOT NULL,
     captured_at timestamptz NOT NULL,
     completed_at timestamptz,
     collector_config_identity_hash text NOT NULL,
     content_identity_hash text,
     candidate_url_count integer NOT NULL DEFAULT 0,
     analyzable_page_count integer NOT NULL DEFAULT 0,
     excluded_page_count integer NOT NULL DEFAULT 0,
     created_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT report_v4_site_snapshots_site_check CHECK(length(btrim(site_key)) > 0),
     CONSTRAINT report_v4_site_snapshots_status_check CHECK(status IN ('collecting','completed','completed_limited','unavailable','custom_service')),
     CONSTRAINT report_v4_site_snapshots_hash_check CHECK(
       collector_config_identity_hash ~ '^[a-f0-9]{64}$'
       AND (content_identity_hash IS NULL OR content_identity_hash ~ '^[a-f0-9]{64}$')
     ),
     CONSTRAINT report_v4_site_snapshots_count_check CHECK(
       candidate_url_count >= 0 AND analyzable_page_count >= 0 AND excluded_page_count >= 0
       AND candidate_url_count >= analyzable_page_count + excluded_page_count
     ),
     CONSTRAINT report_v4_site_snapshots_terminal_shape_check CHECK(
       (status='collecting' AND completed_at IS NULL AND content_identity_hash IS NULL)
       OR (status='completed' AND completed_at IS NOT NULL AND completed_at >= captured_at AND content_identity_hash IS NOT NULL AND analyzable_page_count BETWEEN 1 AND 50)
       OR (status='completed_limited' AND completed_at IS NOT NULL AND completed_at >= captured_at AND content_identity_hash IS NOT NULL AND analyzable_page_count BETWEEN 1 AND 50 AND excluded_page_count > 0)
       OR (status='unavailable' AND completed_at IS NOT NULL AND completed_at >= captured_at AND content_identity_hash IS NOT NULL AND analyzable_page_count=0)
       OR (status='custom_service' AND completed_at IS NOT NULL AND completed_at >= captured_at AND content_identity_hash IS NOT NULL AND analyzable_page_count >= 51)
     )
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_site_snapshots_report_identity_uidx ON report_v4_site_snapshots(id,report_id)`,
  `CREATE INDEX IF NOT EXISTS report_v4_site_snapshots_report_status_idx ON report_v4_site_snapshots(report_id,status,captured_at)`,
  `CREATE TABLE IF NOT EXISTS report_v4_site_snapshot_pages (
     id text PRIMARY KEY,
     snapshot_id text NOT NULL REFERENCES report_v4_site_snapshots(id) ON DELETE RESTRICT,
     ordinal integer NOT NULL,
     normalized_url text NOT NULL,
     analyzable boolean NOT NULL,
     read_mode text,
     summary text,
     content_hash text,
     exclusion_reason text,
     created_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT report_v4_site_snapshot_pages_ordinal_check CHECK(ordinal > 0),
     CONSTRAINT report_v4_site_snapshot_pages_url_check CHECK(normalized_url ~ '^https?://'),
     CONSTRAINT report_v4_site_snapshot_pages_read_mode_check CHECK(read_mode IS NULL OR read_mode IN ('direct_readable','js_dependent')),
     CONSTRAINT report_v4_site_snapshot_pages_hash_check CHECK(content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
     CONSTRAINT report_v4_site_snapshot_pages_shape_check CHECK(
       (analyzable=true AND read_mode IS NOT NULL AND summary IS NOT NULL AND length(btrim(summary)) > 0 AND content_hash IS NOT NULL AND exclusion_reason IS NULL)
       OR (analyzable=false AND read_mode IS NULL AND summary IS NULL AND content_hash IS NULL AND exclusion_reason IS NOT NULL AND length(btrim(exclusion_reason)) > 0)
     )
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_site_snapshot_pages_ordinal_uidx ON report_v4_site_snapshot_pages(snapshot_id,ordinal)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_site_snapshot_pages_url_uidx ON report_v4_site_snapshot_pages(snapshot_id,normalized_url)`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_site_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF OLD.status IN ('completed','completed_limited','unavailable','custom_service') THEN
       RAISE EXCEPTION 'A completed V4 site snapshot is immutable.';
     END IF;
     IF TG_OP='DELETE' THEN RETURN OLD; END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_site_snapshots_immutability_trigger ON report_v4_site_snapshots`,
  `CREATE TRIGGER report_v4_site_snapshots_immutability_trigger BEFORE UPDATE OR DELETE ON report_v4_site_snapshots FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_site_snapshot_mutation()`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_site_snapshot_page_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE old_status text; new_status text;
   BEGIN
     IF TG_OP <> 'INSERT' THEN
       SELECT status INTO old_status FROM report_v4_site_snapshots WHERE id=OLD.snapshot_id;
       IF old_status IN ('completed','completed_limited','unavailable','custom_service') THEN
         RAISE EXCEPTION 'Pages of a completed V4 site snapshot are immutable.';
       END IF;
     END IF;
     IF TG_OP <> 'DELETE' THEN
       SELECT status INTO new_status FROM report_v4_site_snapshots WHERE id=NEW.snapshot_id;
       IF new_status IS DISTINCT FROM 'collecting' THEN
         RAISE EXCEPTION 'V4 site snapshot pages may be written only while collecting.';
       END IF;
     END IF;
     IF TG_OP='DELETE' THEN RETURN OLD; END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_site_snapshot_pages_immutability_trigger ON report_v4_site_snapshot_pages`,
  `CREATE TRIGGER report_v4_site_snapshot_pages_immutability_trigger BEFORE INSERT OR UPDATE OR DELETE ON report_v4_site_snapshot_pages FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_site_snapshot_page_mutation()`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_business_question_sets_v4_identity_uidx ON report_business_question_sets(id,report_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_business_questions_v4_identity_uidx ON report_business_questions(id,question_set_id,ordinal)`,
  `CREATE TABLE IF NOT EXISTS report_v4_question_checkpoints (
     identity_hash text PRIMARY KEY,
     report_id text NOT NULL,
     job_id text NOT NULL,
     question_set_id text NOT NULL,
     question_id text NOT NULL,
     snapshot_id text NOT NULL,
     ordinal integer NOT NULL,
     state text NOT NULL,
     question_identity_hash text NOT NULL,
     model_config_identity_hash text NOT NULL,
     input_identity_hash text NOT NULL,
     provider_call_count integer NOT NULL DEFAULT 0,
     answer_payload jsonb,
     source_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
     answer_content_hash text,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT report_v4_question_checkpoints_job_report_fkey FOREIGN KEY(job_id,report_id) REFERENCES scan_jobs(id,report_id) ON DELETE RESTRICT,
     CONSTRAINT report_v4_question_checkpoints_question_fkey FOREIGN KEY(question_id,question_set_id,ordinal) REFERENCES report_business_questions(id,question_set_id,ordinal) ON DELETE RESTRICT,
     CONSTRAINT report_v4_question_checkpoints_question_set_fkey FOREIGN KEY(question_set_id,report_id) REFERENCES report_business_question_sets(id,report_id) ON DELETE RESTRICT,
     CONSTRAINT report_v4_question_checkpoints_snapshot_fkey FOREIGN KEY(snapshot_id,report_id) REFERENCES report_v4_site_snapshots(id,report_id) ON DELETE RESTRICT,
     CONSTRAINT report_v4_question_checkpoints_ordinal_check CHECK(ordinal BETWEEN 1 AND 3),
     CONSTRAINT report_v4_question_checkpoints_state_check CHECK(state IN ('queued','answering','retrying','answered','unavailable')),
     CONSTRAINT report_v4_question_checkpoints_hash_check CHECK(
       identity_hash ~ '^[a-f0-9]{64}$' AND question_identity_hash ~ '^[a-f0-9]{64}$'
       AND model_config_identity_hash ~ '^[a-f0-9]{64}$' AND input_identity_hash ~ '^[a-f0-9]{64}$'
       AND (answer_content_hash IS NULL OR answer_content_hash ~ '^[a-f0-9]{64}$')
     ),
     CONSTRAINT report_v4_question_checkpoints_call_count_check CHECK(provider_call_count BETWEEN 0 AND 2),
     CONSTRAINT report_v4_question_checkpoints_source_check CHECK(jsonb_typeof(source_payload)='array' AND jsonb_array_length(source_payload) <= 5),
     CONSTRAINT report_v4_question_checkpoints_answer_shape_check CHECK(
       (state='answered' AND provider_call_count BETWEEN 1 AND 2 AND answer_payload IS NOT NULL AND answer_content_hash IS NOT NULL)
       OR (state<>'answered' AND answer_payload IS NULL AND answer_content_hash IS NULL)
     )
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_question_checkpoints_job_ordinal_uidx ON report_v4_question_checkpoints(job_id,ordinal)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_question_checkpoints_job_question_uidx ON report_v4_question_checkpoints(job_id,question_id)`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_terminal_checkpoint_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF OLD.state IN ('answered','unavailable') THEN RAISE EXCEPTION 'A terminal V4 question checkpoint is immutable.'; END IF;
     IF TG_OP='DELETE' THEN RETURN OLD; END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_question_checkpoints_answer_immutability_trigger ON report_v4_question_checkpoints`,
  `DROP TRIGGER IF EXISTS report_v4_question_checkpoints_terminal_immutability_trigger ON report_v4_question_checkpoints`,
  `CREATE TRIGGER report_v4_question_checkpoints_terminal_immutability_trigger BEFORE UPDATE OR DELETE ON report_v4_question_checkpoints FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_terminal_checkpoint_mutation()`
] as const;

export const V27_DATABASE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS report_v4_config_snapshots (
     id text PRIMARY KEY,
     report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
     order_id text NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
     core_job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE RESTRICT,
     identity_hash text NOT NULL,
     model_profile_id text NOT NULL,
     model_profile_hash text NOT NULL,
     model_profile_payload jsonb NOT NULL,
     report_profile_id text NOT NULL,
     report_profile_hash text NOT NULL,
     report_profile_payload jsonb NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT report_v4_config_snapshots_hash_check CHECK(
       identity_hash ~ '^[a-f0-9]{64}$'
       AND model_profile_hash ~ '^[a-f0-9]{64}$'
       AND report_profile_hash ~ '^[a-f0-9]{64}$'
     ),
     CONSTRAINT report_v4_config_snapshots_identity_id_check CHECK(id = 'v4-config-' || identity_hash),
     CONSTRAINT report_v4_config_snapshots_profile_id_check CHECK(
       length(btrim(model_profile_id)) > 0 AND length(btrim(report_profile_id)) > 0
     ),
     CONSTRAINT report_v4_config_snapshots_payload_check CHECK(
       jsonb_typeof(model_profile_payload)='object' AND jsonb_typeof(report_profile_payload)='object'
     )
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_config_snapshots_report_uidx ON report_v4_config_snapshots(report_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_config_snapshots_order_uidx ON report_v4_config_snapshots(order_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_config_snapshots_core_job_uidx ON report_v4_config_snapshots(core_job_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_config_snapshots_binding_uidx ON report_v4_config_snapshots(id,report_id,order_id,core_job_id)`,
  `CREATE OR REPLACE FUNCTION ogc_validate_report_v4_config_snapshot_binding() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE order_report_id text; order_fulfillment_job_id text; order_payment_status text; order_question_set_id text;
     order_product_code text; order_methodology text; order_version integer;
     job_report_id text; job_tier text; job_product_contract text; job_methodology text;
     job_version integer; job_artifact_contract text; job_reason text; job_question_set_id text;
   BEGIN
     SELECT report_id,fulfillment_job_id,payment_status,business_question_set_id,product_code,fulfillment_methodology,recommendation_report_version
       INTO order_report_id,order_fulfillment_job_id,order_payment_status,order_question_set_id,order_product_code,order_methodology,order_version
       FROM payment_orders WHERE id=NEW.order_id;
     SELECT report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,reason,business_question_set_id
       INTO job_report_id,job_tier,job_product_contract,job_methodology,job_version,job_artifact_contract,job_reason,job_question_set_id
       FROM scan_jobs WHERE id=NEW.core_job_id;
     IF order_report_id IS DISTINCT FROM NEW.report_id
       OR order_fulfillment_job_id IS DISTINCT FROM NEW.core_job_id
       OR order_payment_status IS DISTINCT FROM 'paid'
       OR order_question_set_id IS NULL
       OR order_question_set_id IS DISTINCT FROM job_question_set_id
       OR order_product_code IS DISTINCT FROM 'recommendation_forensics_v1'
       OR order_methodology IS DISTINCT FROM 'two_stage_geo_report_v4'
       OR order_version IS DISTINCT FROM 4
       OR job_report_id IS DISTINCT FROM NEW.report_id
       OR job_tier IS DISTINCT FROM 'deep'
       OR job_product_contract IS DISTINCT FROM 'recommendation_forensics_v1'
       OR job_methodology IS DISTINCT FROM 'two_stage_geo_report_v4'
       OR job_version IS DISTINCT FROM 4
       OR job_artifact_contract IS DISTINCT FROM 'combined_geo_report_v4'
       OR job_reason IS DISTINCT FROM 'standard'
       OR job_question_set_id IS NULL THEN
       RAISE EXCEPTION 'A V4 configuration snapshot requires one exact paid order and standard core V4 job binding.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_config_snapshots_binding_trigger ON report_v4_config_snapshots`,
  `CREATE TRIGGER report_v4_config_snapshots_binding_trigger BEFORE INSERT ON report_v4_config_snapshots FOR EACH ROW EXECUTE FUNCTION ogc_validate_report_v4_config_snapshot_binding()`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_config_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     RAISE EXCEPTION 'A V4 runtime configuration snapshot is immutable.';
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_config_snapshots_immutability_trigger ON report_v4_config_snapshots`,
  `CREATE TRIGGER report_v4_config_snapshots_immutability_trigger BEFORE UPDATE OR DELETE ON report_v4_config_snapshots FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_config_snapshot_mutation()`,
  `ALTER TABLE report_artifact_revisions ADD COLUMN IF NOT EXISTS config_snapshot_id text`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_config_snapshot_fkey`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_config_snapshot_fkey FOREIGN KEY(config_snapshot_id) REFERENCES report_v4_config_snapshots(id) ON DELETE RESTRICT`,
  `ALTER TABLE report_artifact_revisions DROP CONSTRAINT IF EXISTS report_artifact_revisions_v4_config_shape_check`,
  `ALTER TABLE report_artifact_revisions ADD CONSTRAINT report_artifact_revisions_v4_config_shape_check CHECK (
     artifact_contract='combined_geo_report_v4' OR config_snapshot_id IS NULL
   )`,
  `CREATE OR REPLACE FUNCTION ogc_validate_v4_artifact_config_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE snapshot_report_id text; snapshot_order_id text; snapshot_core_job_id text;
     source_contract text; source_kind text; source_status text; source_report_id text;
     source_order_id text; source_config_snapshot_id text;
     core_job_question_set_id text; enhancement_job_report_id text; enhancement_job_tier text;
     enhancement_job_product_contract text; enhancement_job_methodology text; enhancement_job_version integer;
     enhancement_job_artifact_contract text; enhancement_job_reason text; enhancement_job_question_set_id text;
     report_active_revision_id text;
   BEGIN
     IF TG_OP='UPDATE' AND OLD.config_snapshot_id IS NOT NULL AND (
       NEW.config_snapshot_id IS DISTINCT FROM OLD.config_snapshot_id
       OR NEW.report_id IS DISTINCT FROM OLD.report_id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.revision_kind IS DISTINCT FROM OLD.revision_kind
       OR NEW.source_artifact_revision_id IS DISTINCT FROM OLD.source_artifact_revision_id
       OR NEW.artifact_contract IS DISTINCT FROM OLD.artifact_contract
     ) THEN
       RAISE EXCEPTION 'A bound V4 artifact configuration and lineage identity is immutable.';
     END IF;
     IF NEW.artifact_contract <> 'combined_geo_report_v4' THEN
       IF NEW.config_snapshot_id IS NOT NULL THEN
         RAISE EXCEPTION 'Historical artifact contracts cannot bind a V4 configuration snapshot.';
       END IF;
       RETURN NEW;
     END IF;
     IF NEW.config_snapshot_id IS NULL THEN
       IF NEW.revision_kind='diagnosis_enhancement' THEN
         SELECT artifact_contract,revision_kind,status,report_id,order_id
           INTO source_contract,source_kind,source_status,source_report_id,source_order_id
           FROM report_artifact_revisions WHERE id=NEW.source_artifact_revision_id;
         IF source_contract IS DISTINCT FROM 'combined_geo_report_v4'
           OR source_kind IS DISTINCT FROM 'generation'
           OR source_status NOT IN ('ready','active')
           OR source_report_id IS DISTINCT FROM NEW.report_id
           OR source_order_id IS DISTINCT FROM NEW.order_id THEN
           RAISE EXCEPTION 'A historical V4 diagnosis enhancement must preserve its ready core lineage.';
         END IF;
       END IF;
       RETURN NEW;
     END IF;
     SELECT report_id,order_id,core_job_id
       INTO snapshot_report_id,snapshot_order_id,snapshot_core_job_id
       FROM report_v4_config_snapshots WHERE id=NEW.config_snapshot_id;
     IF snapshot_report_id IS DISTINCT FROM NEW.report_id OR snapshot_order_id IS DISTINCT FROM NEW.order_id THEN
       RAISE EXCEPTION 'A V4 artifact configuration snapshot must match the same report and order.';
     END IF;
     IF NEW.revision_kind='generation' THEN
       IF snapshot_core_job_id IS DISTINCT FROM NEW.job_id THEN
         RAISE EXCEPTION 'A V4 core revision must use the configuration snapshot locked by its core job.';
       END IF;
       RETURN NEW;
     END IF;
     SELECT business_question_set_id INTO core_job_question_set_id
       FROM scan_jobs WHERE id=snapshot_core_job_id;
     SELECT report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
       artifact_contract,reason,business_question_set_id
       INTO enhancement_job_report_id,enhancement_job_tier,enhancement_job_product_contract,
       enhancement_job_methodology,enhancement_job_version,enhancement_job_artifact_contract,
       enhancement_job_reason,enhancement_job_question_set_id
       FROM scan_jobs WHERE id=NEW.job_id;
     IF enhancement_job_report_id IS DISTINCT FROM NEW.report_id
       OR enhancement_job_tier IS DISTINCT FROM 'deep'
       OR enhancement_job_product_contract IS DISTINCT FROM 'recommendation_forensics_v1'
       OR enhancement_job_methodology IS DISTINCT FROM 'two_stage_geo_report_v4'
       OR enhancement_job_version IS DISTINCT FROM 4
       OR enhancement_job_artifact_contract IS DISTINCT FROM 'combined_geo_report_v4'
       OR enhancement_job_reason IS DISTINCT FROM 'v4_diagnosis_enhancement'
       OR enhancement_job_question_set_id IS NULL
       OR enhancement_job_question_set_id IS DISTINCT FROM core_job_question_set_id THEN
       RAISE EXCEPTION 'A V4 diagnosis enhancement requires the exact same-report V4 enhancement job and core question set.';
     END IF;
     SELECT artifact_contract,revision_kind,status,report_id,order_id,config_snapshot_id
       INTO source_contract,source_kind,source_status,source_report_id,source_order_id,source_config_snapshot_id
       FROM report_artifact_revisions WHERE id=NEW.source_artifact_revision_id;
     IF source_contract IS DISTINCT FROM 'combined_geo_report_v4'
       OR source_kind IS DISTINCT FROM 'generation'
       OR source_report_id IS DISTINCT FROM NEW.report_id
       OR source_order_id IS DISTINCT FROM NEW.order_id
       OR source_config_snapshot_id IS DISTINCT FROM NEW.config_snapshot_id THEN
       RAISE EXCEPTION 'A V4 diagnosis enhancement must extend the active same-report/order core using the same configuration snapshot.';
     END IF;
     IF source_status IS DISTINCT FROM 'active' THEN
       SELECT active_artifact_revision_id INTO report_active_revision_id
         FROM scan_reports WHERE id=NEW.report_id;
       IF NOT (TG_OP='UPDATE' AND OLD.status='ready' AND NEW.status='active'
         AND source_status='ready'
         AND report_active_revision_id IS NOT DISTINCT FROM NEW.source_artifact_revision_id) THEN
         RAISE EXCEPTION 'A V4 diagnosis enhancement source must remain active except during its atomic ready-to-active handoff.';
       END IF;
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_artifact_revisions_v4_diagnosis_source_trigger ON report_artifact_revisions`,
  `DROP TRIGGER IF EXISTS report_artifact_revisions_v4_config_snapshot_trigger ON report_artifact_revisions`,
  `CREATE TRIGGER report_artifact_revisions_v4_config_snapshot_trigger BEFORE INSERT OR UPDATE ON report_artifact_revisions FOR EACH ROW EXECUTE FUNCTION ogc_validate_v4_artifact_config_snapshot()`
] as const;

export const V28_DATABASE_MIGRATIONS = [
  `ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS site_snapshot_id text`,
  `ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS site_snapshot_id text`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_site_snapshot_fkey`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_site_snapshot_fkey FOREIGN KEY(site_snapshot_id) REFERENCES report_v4_site_snapshots(id) ON DELETE RESTRICT`,
  `ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_site_snapshot_fkey`,
  `ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_site_snapshot_fkey FOREIGN KEY(site_snapshot_id) REFERENCES report_v4_site_snapshots(id) ON DELETE RESTRICT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scan_jobs_site_snapshot_binding_uidx ON scan_jobs(id,report_id,site_snapshot_id)`,
  `ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_fulfillment_snapshot_fkey`,
  `ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_fulfillment_snapshot_fkey FOREIGN KEY(fulfillment_job_id,report_id,site_snapshot_id) REFERENCES scan_jobs(id,report_id,site_snapshot_id) MATCH SIMPLE ON DELETE RESTRICT`,
  `CREATE INDEX IF NOT EXISTS scan_jobs_site_snapshot_idx ON scan_jobs(site_snapshot_id)`,
  `CREATE INDEX IF NOT EXISTS payment_orders_site_snapshot_idx ON payment_orders(site_snapshot_id)`,
  `CREATE OR REPLACE FUNCTION ogc_validate_scan_job_site_snapshot_binding() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE snapshot_report_id text; snapshot_status text; snapshot_content_identity_hash text;
   BEGIN
     IF TG_OP='UPDATE' AND OLD.site_snapshot_id IS NOT NULL
       AND NEW.site_snapshot_id IS DISTINCT FROM OLD.site_snapshot_id THEN
       RAISE EXCEPTION 'A non-null site snapshot binding is immutable.';
     END IF;
     IF NEW.site_snapshot_id IS NULL THEN
       RETURN NEW;
     END IF;
     IF NEW.tier IS DISTINCT FROM 'deep'
       OR NEW.product_contract IS DISTINCT FROM 'recommendation_forensics_v1'
       OR NEW.fulfillment_methodology IS DISTINCT FROM 'two_stage_geo_report_v4'
       OR NEW.recommendation_report_version IS DISTINCT FROM 4
       OR NEW.artifact_contract IS DISTINCT FROM 'combined_geo_report_v4'
       OR NEW.reason IS DISTINCT FROM 'standard' THEN
       RAISE EXCEPTION 'A non-null site snapshot requires an exact V4 standard core job.';
     END IF;
     SELECT report_id,status,content_identity_hash
       INTO snapshot_report_id,snapshot_status,snapshot_content_identity_hash
       FROM report_v4_site_snapshots WHERE id=NEW.site_snapshot_id;
     IF snapshot_report_id IS DISTINCT FROM NEW.report_id THEN
       RAISE EXCEPTION 'A site snapshot binding must belong to the same report.';
     END IF;
     IF snapshot_status NOT IN ('completed','completed_limited')
       OR snapshot_content_identity_hash IS NULL THEN
       RAISE EXCEPTION 'A site snapshot binding requires a terminal completed snapshot with a content hash.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS scan_jobs_site_snapshot_binding_trigger ON scan_jobs`,
  `CREATE TRIGGER scan_jobs_site_snapshot_binding_trigger BEFORE INSERT OR UPDATE ON scan_jobs FOR EACH ROW EXECUTE FUNCTION ogc_validate_scan_job_site_snapshot_binding()`,
  `CREATE OR REPLACE FUNCTION ogc_validate_payment_order_site_snapshot_binding() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE snapshot_report_id text; snapshot_status text; snapshot_content_identity_hash text;
   BEGIN
     IF TG_OP='UPDATE' AND OLD.site_snapshot_id IS NOT NULL
       AND NEW.site_snapshot_id IS DISTINCT FROM OLD.site_snapshot_id THEN
       RAISE EXCEPTION 'A non-null site snapshot binding is immutable.';
     END IF;
     IF NEW.site_snapshot_id IS NULL THEN
       RETURN NEW;
     END IF;
     IF NEW.product_code IS DISTINCT FROM 'recommendation_forensics_v1'
       OR NEW.fulfillment_methodology IS DISTINCT FROM 'two_stage_geo_report_v4'
       OR NEW.recommendation_report_version IS DISTINCT FROM 4 THEN
       RAISE EXCEPTION 'A non-null site snapshot requires an exact V4 order.';
     END IF;
     SELECT report_id,status,content_identity_hash
       INTO snapshot_report_id,snapshot_status,snapshot_content_identity_hash
       FROM report_v4_site_snapshots WHERE id=NEW.site_snapshot_id;
     IF snapshot_report_id IS DISTINCT FROM NEW.report_id THEN
       RAISE EXCEPTION 'A site snapshot binding must belong to the same report.';
     END IF;
     IF snapshot_status NOT IN ('completed','completed_limited')
       OR snapshot_content_identity_hash IS NULL THEN
       RAISE EXCEPTION 'A site snapshot binding requires a terminal completed snapshot with a content hash.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS payment_orders_site_snapshot_binding_trigger ON payment_orders`,
  `CREATE TRIGGER payment_orders_site_snapshot_binding_trigger BEFORE INSERT OR UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION ogc_validate_payment_order_site_snapshot_binding()`
] as const;

export const V29_DATABASE_MIGRATIONS = [
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_reason_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_reason_check CHECK (reason IN ('standard','system_recovery','locale_correction','staging_regeneration','paid_report_correction','staging_artifact_refresh','replacement_fulfillment','v4_diagnosis_enhancement','v4_pre_admission'))`,
  `ALTER TABLE scan_jobs DROP CONSTRAINT IF EXISTS scan_jobs_v4_pre_admission_check`,
  `ALTER TABLE scan_jobs ADD CONSTRAINT scan_jobs_v4_pre_admission_check CHECK (
     reason<>'v4_pre_admission' OR (
       tier='deep'
       AND product_contract='recommendation_forensics_v1'
       AND fulfillment_methodology='two_stage_geo_report_v4'
       AND recommendation_report_version=4
       AND artifact_contract='combined_geo_report_v4'
       AND site_snapshot_id IS NULL
       AND business_question_set_id IS NULL
       AND credit_reservation_id IS NULL
       AND correction_id IS NULL
       AND replacement_fulfillment_id IS NULL
     )
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scan_jobs_v4_pre_admission_report_uidx
   ON scan_jobs(report_id) WHERE reason='v4_pre_admission'`
] as const;

export const V30_DATABASE_MIGRATIONS = [
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_site_snapshot_pages_content_binding_uidx
   ON report_v4_site_snapshot_pages(id,snapshot_id,content_hash)`,
  `CREATE OR REPLACE FUNCTION ogc_report_v4_page_summary_chunks_valid(candidate jsonb,retained_source_length integer)
   RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
   DECLARE chunk jsonb; location jsonb; expected_order integer := 1;
     location_id text; seen_location_ids text[] := ARRAY[]::text[];
     start_offset integer; end_offset integer;
   BEGIN
     IF retained_source_length <= 0 OR jsonb_typeof(candidate) <> 'array'
       OR jsonb_array_length(candidate) NOT BETWEEN 1 AND 8 THEN
       RETURN false;
     END IF;
     FOR chunk IN SELECT value FROM jsonb_array_elements(candidate) LOOP
       IF jsonb_typeof(chunk) <> 'object'
         OR chunk - 'order' - 'summary' - 'sourceLocations' <> '{}'::jsonb
         OR jsonb_typeof(chunk->'order') <> 'number'
         OR (chunk->>'order') !~ '^[1-9][0-9]*$'
         OR (chunk->>'order')::integer <> expected_order
         OR jsonb_typeof(chunk->'summary') <> 'string'
         OR length(btrim(chunk->>'summary')) NOT BETWEEN 1 AND 2000
         OR jsonb_typeof(chunk->'sourceLocations') <> 'array'
         OR jsonb_array_length(chunk->'sourceLocations') NOT BETWEEN 1 AND 16 THEN
         RETURN false;
       END IF;
       FOR location IN SELECT value FROM jsonb_array_elements(chunk->'sourceLocations') LOOP
         IF jsonb_typeof(location) <> 'object'
           OR location - 'locationId' - 'startOffset' - 'endOffset' <> '{}'::jsonb
           OR jsonb_typeof(location->'locationId') <> 'string'
           OR length(btrim(location->>'locationId')) NOT BETWEEN 1 AND 500
           OR jsonb_typeof(location->'startOffset') <> 'number'
           OR jsonb_typeof(location->'endOffset') <> 'number'
           OR (location->>'startOffset') !~ '^(0|[1-9][0-9]*)$'
           OR (location->>'endOffset') !~ '^[1-9][0-9]*$' THEN
           RETURN false;
         END IF;
         location_id := location->>'locationId';
         start_offset := (location->>'startOffset')::integer;
         end_offset := (location->>'endOffset')::integer;
         IF location_id = ANY(seen_location_ids) OR end_offset <= start_offset OR end_offset > retained_source_length THEN
           RETURN false;
         END IF;
         seen_location_ids := array_append(seen_location_ids,location_id);
       END LOOP;
       expected_order := expected_order + 1;
     END LOOP;
     RETURN true;
   EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
     RETURN false;
   END $$`,
  `CREATE TABLE IF NOT EXISTS report_v4_page_summaries (
     identity_hash text PRIMARY KEY,
     report_id text NOT NULL,
     snapshot_id text NOT NULL,
     page_id text NOT NULL,
     content_hash text NOT NULL,
     source_length integer NOT NULL,
     chunks jsonb NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT report_v4_page_summaries_snapshot_report_fkey
       FOREIGN KEY(snapshot_id,report_id) REFERENCES report_v4_site_snapshots(id,report_id) ON DELETE RESTRICT,
     CONSTRAINT report_v4_page_summaries_page_content_fkey
       FOREIGN KEY(page_id,snapshot_id,content_hash)
       REFERENCES report_v4_site_snapshot_pages(id,snapshot_id,content_hash) ON DELETE RESTRICT,
     CONSTRAINT report_v4_page_summaries_hash_check CHECK(
       identity_hash ~ '^[a-f0-9]{64}$' AND content_hash ~ '^[a-f0-9]{64}$'
     ),
     CONSTRAINT report_v4_page_summaries_source_length_check CHECK(source_length > 0),
     CONSTRAINT report_v4_page_summaries_chunks_check CHECK(
       ogc_report_v4_page_summary_chunks_valid(chunks,source_length)
     )
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_page_summaries_page_uidx ON report_v4_page_summaries(page_id)`,
  `CREATE INDEX IF NOT EXISTS report_v4_page_summaries_snapshot_idx ON report_v4_page_summaries(snapshot_id,page_id)`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_page_summary_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE snapshot_status text;
   BEGIN
     IF TG_OP <> 'INSERT' THEN
       RAISE EXCEPTION 'A V4 hierarchical page summary is immutable.';
     END IF;
     SELECT status INTO snapshot_status FROM report_v4_site_snapshots WHERE id=NEW.snapshot_id;
     IF snapshot_status IS DISTINCT FROM 'collecting' THEN
       RAISE EXCEPTION 'A V4 hierarchical page summary may be persisted only while its snapshot is collecting.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_page_summaries_immutability_trigger ON report_v4_page_summaries`,
  `CREATE TRIGGER report_v4_page_summaries_immutability_trigger
   BEFORE INSERT OR UPDATE OR DELETE ON report_v4_page_summaries
   FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_page_summary_mutation()`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_artifact_revisions_v4_diagnosis_source_uidx
   ON report_artifact_revisions(source_artifact_revision_id)
   WHERE artifact_contract='combined_geo_report_v4' AND revision_kind='diagnosis_enhancement'`,
  `CREATE OR REPLACE FUNCTION ogc_report_v4_source_audit_payload_valid(candidate jsonb,expected_question_id text)
   RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
   DECLARE audit jsonb; source_id text; canonical_url text;
     seen_source_ids text[] := ARRAY[]::text[]; seen_urls text[] := ARRAY[]::text[];
   BEGIN
     IF jsonb_typeof(candidate) <> 'array' OR jsonb_array_length(candidate) > 5 THEN
       RETURN false;
     END IF;
     FOR audit IN SELECT value FROM jsonb_array_elements(candidate) LOOP
       IF jsonb_typeof(audit) <> 'object'
         OR audit - 'questionId' - 'sourceId' - 'canonicalUrl' - 'status' - 'summary' <> '{}'::jsonb
         OR NOT (audit ?& ARRAY['questionId','sourceId','canonicalUrl','status'])
         OR jsonb_typeof(audit->'questionId') <> 'string'
         OR audit->>'questionId' <> expected_question_id
         OR jsonb_typeof(audit->'sourceId') <> 'string'
         OR length(btrim(audit->>'sourceId')) NOT BETWEEN 1 AND 500
         OR jsonb_typeof(audit->'canonicalUrl') <> 'string'
         OR length(audit->>'canonicalUrl') NOT BETWEEN 1 AND 5000
         OR audit->>'canonicalUrl' !~ '^https?://[^[:space:]]+$'
         OR jsonb_typeof(audit->'status') <> 'string'
         OR audit->>'status' NOT IN ('available','inaccessible')
         OR (audit ? 'summary' AND (
           jsonb_typeof(audit->'summary') <> 'string'
           OR length(btrim(audit->>'summary')) NOT BETWEEN 1 AND 5000
           OR audit->>'status' <> 'available'
         )) THEN
         RETURN false;
       END IF;
       source_id := audit->>'sourceId';
       canonical_url := audit->>'canonicalUrl';
       IF source_id = ANY(seen_source_ids) OR canonical_url = ANY(seen_urls) THEN
         RETURN false;
       END IF;
       seen_source_ids := array_append(seen_source_ids,source_id);
       seen_urls := array_append(seen_urls,canonical_url);
     END LOOP;
     RETURN true;
   END $$`,
  `CREATE OR REPLACE FUNCTION ogc_report_v4_diagnosis_payload_valid(candidate jsonb)
   RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
   DECLARE factor jsonb; action jsonb; ref jsonb; expected_priority integer := 1;
     detailed_refs text[] := ARRAY[]::text[]; item_refs text[]; ref_value text;
   BEGIN
     IF jsonb_typeof(candidate) <> 'object'
       OR candidate - 'selectionSummary' - 'observableFactors' - 'targetGap'
         - 'recommendedActions' - 'detailedEvidenceRefs' <> '{}'::jsonb
       OR NOT (candidate ?& ARRAY['selectionSummary','observableFactors','targetGap','recommendedActions','detailedEvidenceRefs'])
       OR jsonb_typeof(candidate->'selectionSummary') <> 'string'
       OR length(btrim(candidate->>'selectionSummary')) NOT BETWEEN 1 AND 5000
       OR jsonb_typeof(candidate->'targetGap') <> 'string'
       OR length(btrim(candidate->>'targetGap')) NOT BETWEEN 1 AND 5000
       OR jsonb_typeof(candidate->'observableFactors') <> 'array'
       OR jsonb_array_length(candidate->'observableFactors') <> 3
       OR jsonb_typeof(candidate->'recommendedActions') <> 'array'
       OR jsonb_array_length(candidate->'recommendedActions') <> 3
       OR jsonb_typeof(candidate->'detailedEvidenceRefs') <> 'array'
       OR jsonb_array_length(candidate->'detailedEvidenceRefs') NOT BETWEEN 1 AND 100 THEN
       RETURN false;
     END IF;
     FOR ref IN SELECT value FROM jsonb_array_elements(candidate->'detailedEvidenceRefs') LOOP
       IF jsonb_typeof(ref) <> 'string' OR length(btrim(ref #>> '{}')) NOT BETWEEN 1 AND 500 THEN
         RETURN false;
       END IF;
       ref_value := ref #>> '{}';
       IF ref_value = ANY(detailed_refs) THEN RETURN false; END IF;
       detailed_refs := array_append(detailed_refs,ref_value);
     END LOOP;
     FOR factor IN SELECT value FROM jsonb_array_elements(candidate->'observableFactors') LOOP
       IF jsonb_typeof(factor) <> 'object'
         OR factor - 'kind' - 'observation' - 'evidenceRefs' <> '{}'::jsonb
         OR NOT (factor ?& ARRAY['kind','observation','evidenceRefs'])
         OR jsonb_typeof(factor->'kind') <> 'string'
         OR factor->>'kind' NOT IN (
           'problem_match','factual_specificity','entity_clarity','source_role',
           'accessibility','freshness','target_clarity'
         )
         OR jsonb_typeof(factor->'observation') <> 'string'
         OR length(btrim(factor->>'observation')) NOT BETWEEN 1 AND 5000
         OR jsonb_typeof(factor->'evidenceRefs') <> 'array'
         OR jsonb_array_length(factor->'evidenceRefs') NOT BETWEEN 1 AND 100 THEN
         RETURN false;
       END IF;
       item_refs := ARRAY[]::text[];
       FOR ref IN SELECT value FROM jsonb_array_elements(factor->'evidenceRefs') LOOP
         IF jsonb_typeof(ref) <> 'string' OR length(btrim(ref #>> '{}')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
         ref_value := ref #>> '{}';
         IF NOT (ref_value = ANY(detailed_refs)) OR ref_value = ANY(item_refs) THEN RETURN false; END IF;
         item_refs := array_append(item_refs,ref_value);
       END LOOP;
     END LOOP;
     FOR action IN SELECT value FROM jsonb_array_elements(candidate->'recommendedActions') LOOP
       IF jsonb_typeof(action) <> 'object'
         OR action - 'priority' - 'action' - 'evidenceRefs' <> '{}'::jsonb
         OR NOT (action ?& ARRAY['priority','action','evidenceRefs'])
         OR jsonb_typeof(action->'priority') <> 'number'
         OR (action->>'priority') !~ '^[1-3]$'
         OR (action->>'priority')::integer <> expected_priority
         OR jsonb_typeof(action->'action') <> 'string'
         OR length(btrim(action->>'action')) NOT BETWEEN 1 AND 5000
         OR jsonb_typeof(action->'evidenceRefs') <> 'array'
         OR jsonb_array_length(action->'evidenceRefs') NOT BETWEEN 1 AND 100 THEN
         RETURN false;
       END IF;
       item_refs := ARRAY[]::text[];
       FOR ref IN SELECT value FROM jsonb_array_elements(action->'evidenceRefs') LOOP
         IF jsonb_typeof(ref) <> 'string' OR length(btrim(ref #>> '{}')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
         ref_value := ref #>> '{}';
         IF NOT (ref_value = ANY(detailed_refs)) OR ref_value = ANY(item_refs) THEN RETURN false; END IF;
         item_refs := array_append(item_refs,ref_value);
       END LOOP;
       expected_priority := expected_priority + 1;
     END LOOP;
     RETURN true;
   EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
     RETURN false;
   END $$`,
  `CREATE TABLE IF NOT EXISTS report_v4_diagnosis_checkpoints (
     identity_hash text PRIMARY KEY,
     report_id text NOT NULL,
     enhancement_job_id text NOT NULL,
     core_artifact_revision_id text NOT NULL REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT,
     config_snapshot_id text REFERENCES report_v4_config_snapshots(id) ON DELETE RESTRICT NOT NULL,
     question_set_id text NOT NULL,
     question_id text NOT NULL,
     snapshot_id text NOT NULL,
     ordinal integer NOT NULL,
     state text NOT NULL,
     input_identity_hash text NOT NULL,
     provider_call_count integer NOT NULL DEFAULT 0,
     source_audit_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
     diagnosis_payload jsonb,
     diagnosis_content_hash text,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT report_v4_diagnosis_checkpoints_job_report_fkey
       FOREIGN KEY(enhancement_job_id,report_id) REFERENCES scan_jobs(id,report_id) ON DELETE RESTRICT,
     CONSTRAINT report_v4_diagnosis_checkpoints_question_fkey
       FOREIGN KEY(question_id,question_set_id,ordinal)
       REFERENCES report_business_questions(id,question_set_id,ordinal) ON DELETE RESTRICT,
     CONSTRAINT report_v4_diagnosis_checkpoints_question_set_fkey
       FOREIGN KEY(question_set_id,report_id) REFERENCES report_business_question_sets(id,report_id) ON DELETE RESTRICT,
     CONSTRAINT report_v4_diagnosis_checkpoints_snapshot_fkey
       FOREIGN KEY(snapshot_id,report_id) REFERENCES report_v4_site_snapshots(id,report_id) ON DELETE RESTRICT,
     CONSTRAINT report_v4_diagnosis_checkpoints_ordinal_check CHECK(ordinal BETWEEN 1 AND 3),
     CONSTRAINT report_v4_diagnosis_checkpoints_state_check CHECK(state IN ('queued','running','completed','failed')),
     CONSTRAINT report_v4_diagnosis_checkpoints_hash_check CHECK(
       identity_hash ~ '^[a-f0-9]{64}$' AND input_identity_hash ~ '^[a-f0-9]{64}$'
       AND (diagnosis_content_hash IS NULL OR diagnosis_content_hash ~ '^[a-f0-9]{64}$')
     ),
     CONSTRAINT report_v4_diagnosis_checkpoints_call_count_check CHECK(provider_call_count BETWEEN 0 AND 2),
     CONSTRAINT report_v4_diagnosis_checkpoints_source_audit_check CHECK(
       ogc_report_v4_source_audit_payload_valid(source_audit_payload,question_id)
     ),
     CONSTRAINT report_v4_diagnosis_checkpoints_payload_check CHECK(
       (diagnosis_payload IS NULL OR ogc_report_v4_diagnosis_payload_valid(diagnosis_payload))
       AND (
         (state='queued' AND provider_call_count=0 AND jsonb_array_length(source_audit_payload)=0
           AND diagnosis_payload IS NULL AND diagnosis_content_hash IS NULL)
         OR (state='running' AND diagnosis_payload IS NULL AND diagnosis_content_hash IS NULL)
         OR (state='completed' AND provider_call_count BETWEEN 1 AND 2
           AND diagnosis_payload IS NOT NULL AND diagnosis_content_hash IS NOT NULL)
         OR (state='failed' AND diagnosis_payload IS NULL AND diagnosis_content_hash IS NULL)
       )
     )
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_diagnosis_checkpoints_job_ordinal_uidx
   ON report_v4_diagnosis_checkpoints(enhancement_job_id,ordinal)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_diagnosis_checkpoints_job_question_uidx
   ON report_v4_diagnosis_checkpoints(enhancement_job_id,question_id)`,
  `CREATE OR REPLACE FUNCTION ogc_validate_report_v4_diagnosis_checkpoint_binding() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE enhancement_report_id text; enhancement_tier text; enhancement_product text;
     enhancement_methodology text; enhancement_version integer; enhancement_contract text;
     enhancement_reason text; enhancement_question_set_id text; enhancement_credit_id text;
     core_report_id text; source_core_job_id text; core_config_id text; core_kind text; core_contract text;
     core_status text; core_source_id text; config_report_id text; config_core_job_id text;
     core_question_set_id text; core_snapshot_id text; report_active_revision_id text;
   BEGIN
     SELECT report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
       artifact_contract,reason,business_question_set_id,credit_reservation_id
       INTO enhancement_report_id,enhancement_tier,enhancement_product,enhancement_methodology,
       enhancement_version,enhancement_contract,enhancement_reason,enhancement_question_set_id,enhancement_credit_id
       FROM scan_jobs WHERE id=NEW.enhancement_job_id;
     SELECT report_id,job_id,config_snapshot_id,revision_kind,artifact_contract,status,source_artifact_revision_id
       INTO core_report_id,source_core_job_id,core_config_id,core_kind,core_contract,core_status,core_source_id
       FROM report_artifact_revisions WHERE id=NEW.core_artifact_revision_id;
     SELECT report_id,core_job_id INTO config_report_id,config_core_job_id
       FROM report_v4_config_snapshots WHERE id=NEW.config_snapshot_id;
     SELECT business_question_set_id,site_snapshot_id INTO core_question_set_id,core_snapshot_id
       FROM scan_jobs WHERE id=source_core_job_id;
     SELECT active_artifact_revision_id INTO report_active_revision_id
       FROM scan_reports WHERE id=NEW.report_id;
     IF enhancement_report_id IS DISTINCT FROM NEW.report_id
       OR enhancement_tier IS DISTINCT FROM 'deep'
       OR enhancement_product IS DISTINCT FROM 'recommendation_forensics_v1'
       OR enhancement_methodology IS DISTINCT FROM 'two_stage_geo_report_v4'
       OR enhancement_version IS DISTINCT FROM 4
       OR enhancement_contract IS DISTINCT FROM 'combined_geo_report_v4'
       OR enhancement_reason IS DISTINCT FROM 'v4_diagnosis_enhancement'
       OR enhancement_credit_id IS NOT NULL
       OR enhancement_question_set_id IS DISTINCT FROM NEW.question_set_id
       OR core_report_id IS DISTINCT FROM NEW.report_id
       OR core_config_id IS DISTINCT FROM NEW.config_snapshot_id
       OR core_kind IS DISTINCT FROM 'generation'
       OR core_contract IS DISTINCT FROM 'combined_geo_report_v4'
       OR core_status IS DISTINCT FROM 'active'
       OR core_source_id IS NOT NULL
       OR config_report_id IS DISTINCT FROM NEW.report_id
       OR config_core_job_id IS DISTINCT FROM source_core_job_id
       OR core_question_set_id IS DISTINCT FROM NEW.question_set_id
       OR core_snapshot_id IS DISTINCT FROM NEW.snapshot_id
       OR report_active_revision_id IS DISTINCT FROM NEW.core_artifact_revision_id THEN
       RAISE EXCEPTION 'A V4 diagnosis checkpoint requires its exact active core, configuration, snapshot, questions and enhancement job.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_diagnosis_checkpoints_binding_trigger ON report_v4_diagnosis_checkpoints`,
  `CREATE TRIGGER report_v4_diagnosis_checkpoints_binding_trigger
   BEFORE INSERT ON report_v4_diagnosis_checkpoints
   FOR EACH ROW EXECUTE FUNCTION ogc_validate_report_v4_diagnosis_checkpoint_binding()`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_diagnosis_checkpoint_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP='DELETE' THEN
       RAISE EXCEPTION 'A V4 diagnosis checkpoint is immutable and cannot be deleted.';
     END IF;
     IF NEW.identity_hash IS DISTINCT FROM OLD.identity_hash
       OR NEW.report_id IS DISTINCT FROM OLD.report_id
       OR NEW.enhancement_job_id IS DISTINCT FROM OLD.enhancement_job_id
       OR NEW.core_artifact_revision_id IS DISTINCT FROM OLD.core_artifact_revision_id
       OR NEW.config_snapshot_id IS DISTINCT FROM OLD.config_snapshot_id
       OR NEW.question_set_id IS DISTINCT FROM OLD.question_set_id
       OR NEW.question_id IS DISTINCT FROM OLD.question_id
       OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
       OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
       OR NEW.input_identity_hash IS DISTINCT FROM OLD.input_identity_hash THEN
       RAISE EXCEPTION 'A V4 diagnosis checkpoint identity is immutable.';
     END IF;
     IF OLD.state IN ('completed','failed') THEN
       RAISE EXCEPTION 'A terminal V4 diagnosis checkpoint is immutable.';
     END IF;
     IF NEW.provider_call_count < OLD.provider_call_count
       OR NEW.provider_call_count > OLD.provider_call_count + 1 THEN
       RAISE EXCEPTION 'A V4 diagnosis provider call count may advance by at most one.';
     END IF;
     IF NEW.state <> OLD.state AND NOT (
       (OLD.state='queued' AND NEW.state IN ('running','failed'))
       OR (OLD.state='running' AND NEW.state IN ('completed','failed'))
     ) THEN
       RAISE EXCEPTION 'The V4 diagnosis checkpoint state transition is invalid.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_diagnosis_checkpoints_terminal_immutability_trigger ON report_v4_diagnosis_checkpoints`,
  `CREATE TRIGGER report_v4_diagnosis_checkpoints_terminal_immutability_trigger
   BEFORE UPDATE OR DELETE ON report_v4_diagnosis_checkpoints
   FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_diagnosis_checkpoint_mutation()`
] as const;

export const V31_DATABASE_MIGRATIONS = [
  `ALTER TABLE report_v4_site_snapshot_pages
   ADD COLUMN IF NOT EXISTS retained_cleaned_text text`,
  `ALTER TABLE report_v4_site_snapshot_pages
   DROP CONSTRAINT IF EXISTS report_v4_site_snapshot_pages_retained_text_check`,
  `ALTER TABLE report_v4_site_snapshot_pages
   ADD CONSTRAINT report_v4_site_snapshot_pages_retained_text_check CHECK (
     (
       analyzable=true
       AND retained_cleaned_text IS NOT NULL
       AND length(btrim(retained_cleaned_text)) > 0
       AND char_length(retained_cleaned_text) <= 100000
       AND read_mode IS NOT NULL
       AND content_hash IS NOT NULL
       AND exclusion_reason IS NULL
     )
     OR (analyzable=false AND retained_cleaned_text IS NULL)
   ) NOT VALID`
] as const;

export const V32_DATABASE_MIGRATIONS = [
  `CREATE OR REPLACE FUNCTION ogc_js_source_location_length(candidate text)
   RETURNS integer LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
     SELECT COALESCE(sum(CASE WHEN ascii(character) > 65535 THEN 2 ELSE 1 END),0)::integer
     FROM regexp_split_to_table(candidate,'') AS characters(character)
   $$`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_page_summary_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE snapshot_status text;
     page_analyzable boolean;
     page_read_mode text;
     retained_text text;
     page_content_hash text;
   BEGIN
     IF TG_OP <> 'INSERT' THEN
       RAISE EXCEPTION 'A V4 hierarchical page summary is immutable.';
     END IF;
     SELECT status INTO snapshot_status
       FROM report_v4_site_snapshots
       WHERE id=NEW.snapshot_id AND report_id=NEW.report_id;
     IF snapshot_status IS NULL OR snapshot_status NOT IN ('completed','completed_limited') THEN
       RAISE EXCEPTION 'A V4 hierarchical page summary requires an exact completed or completed_limited snapshot.';
     END IF;
     SELECT analyzable,read_mode,retained_cleaned_text,content_hash
       INTO page_analyzable,page_read_mode,retained_text,page_content_hash
       FROM report_v4_site_snapshot_pages
       WHERE id=NEW.page_id AND snapshot_id=NEW.snapshot_id;
     IF NOT FOUND OR page_analyzable IS DISTINCT FROM true OR page_read_mode IS NULL
       OR retained_text IS NULL OR length(btrim(retained_text))=0 OR page_content_hash IS NULL THEN
       RAISE EXCEPTION 'A V4 hierarchical page summary requires an exact analyzable retained snapshot page.';
     END IF;
     IF NEW.content_hash IS DISTINCT FROM page_content_hash
       OR page_content_hash IS DISTINCT FROM encode(sha256(convert_to(retained_text,'UTF8')),'hex') THEN
       RAISE EXCEPTION 'A V4 hierarchical page summary content hash must match its exact retained snapshot text.';
     END IF;
     IF NEW.source_length IS DISTINCT FROM ogc_js_source_location_length(retained_text) THEN
       RAISE EXCEPTION 'A V4 hierarchical page summary source length must match its retained snapshot text.';
     END IF;
     RETURN NEW;
   END $$`
] as const;

export const V33_DATABASE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS report_v4_website_synthesis_checkpoints (
    identity_hash text PRIMARY KEY, report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
    order_id text NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
    core_job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE RESTRICT,
    config_snapshot_id text NOT NULL REFERENCES report_v4_config_snapshots(id) ON DELETE RESTRICT,
    site_snapshot_id text NOT NULL REFERENCES report_v4_site_snapshots(id) ON DELETE RESTRICT,
    operation_id text NOT NULL, profile_id text NOT NULL, state text NOT NULL DEFAULT 'queued',
    worker_id text, lease_expires_at timestamptz, provider_call_count integer NOT NULL DEFAULT 0,
    correction_count integer NOT NULL DEFAULT 0, output_payload jsonb, output_hash text, error_code text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT report_v4_website_synthesis_checkpoint_state_check CHECK(state IN ('queued','running','completed','failed')),
    CONSTRAINT report_v4_website_synthesis_checkpoint_identity_check CHECK(identity_hash ~ '^[a-f0-9]{64}$' AND operation_id <> '' AND profile_id <> ''),
    CONSTRAINT report_v4_website_synthesis_checkpoint_calls_check CHECK(provider_call_count BETWEEN 0 AND 1 AND correction_count = 0),
    CONSTRAINT report_v4_website_synthesis_checkpoint_hash_check CHECK(output_hash IS NULL OR output_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT report_v4_website_synthesis_checkpoint_payload_check CHECK((state='completed' AND output_payload IS NOT NULL AND output_hash IS NOT NULL) OR (state<>'completed' AND output_payload IS NULL AND output_hash IS NULL))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_website_synthesis_checkpoint_lineage_uidx ON report_v4_website_synthesis_checkpoints(report_id,order_id,core_job_id,config_snapshot_id,site_snapshot_id,operation_id,profile_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_website_synthesis_checkpoint_core_uidx ON report_v4_website_synthesis_checkpoints(core_job_id)`
] as const;

export const V34_DATABASE_MIGRATIONS = [
  `ALTER TABLE report_v4_diagnosis_checkpoints ADD COLUMN IF NOT EXISTS diagnosis_input_payload jsonb`,
  `DO $$ BEGIN
     IF EXISTS(SELECT 1 FROM report_v4_diagnosis_checkpoints WHERE diagnosis_input_payload IS NULL) THEN
       RAISE EXCEPTION 'Existing V4 diagnosis checkpoints cannot be upgraded without their immutable diagnosis input payload.';
     END IF;
   END $$`,
  `ALTER TABLE report_v4_diagnosis_checkpoints ALTER COLUMN diagnosis_input_payload SET NOT NULL`,
  `ALTER TABLE report_v4_diagnosis_checkpoints DROP CONSTRAINT IF EXISTS report_v4_diagnosis_checkpoints_input_payload_check`,
  `ALTER TABLE report_v4_diagnosis_checkpoints ADD CONSTRAINT report_v4_diagnosis_checkpoints_input_payload_check
     CHECK(jsonb_typeof(diagnosis_input_payload)='object' AND octet_length(diagnosis_input_payload::text)<=262144)`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_diagnosis_checkpoint_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP='DELETE' THEN
       RAISE EXCEPTION 'A V4 diagnosis checkpoint is immutable and cannot be deleted.';
     END IF;
     IF NEW.identity_hash IS DISTINCT FROM OLD.identity_hash
       OR NEW.report_id IS DISTINCT FROM OLD.report_id
       OR NEW.enhancement_job_id IS DISTINCT FROM OLD.enhancement_job_id
       OR NEW.core_artifact_revision_id IS DISTINCT FROM OLD.core_artifact_revision_id
       OR NEW.config_snapshot_id IS DISTINCT FROM OLD.config_snapshot_id
       OR NEW.question_set_id IS DISTINCT FROM OLD.question_set_id
       OR NEW.question_id IS DISTINCT FROM OLD.question_id
       OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
       OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
       OR NEW.input_identity_hash IS DISTINCT FROM OLD.input_identity_hash
       OR NEW.diagnosis_input_payload IS DISTINCT FROM OLD.diagnosis_input_payload THEN
       RAISE EXCEPTION 'A V4 diagnosis checkpoint identity is immutable.';
     END IF;
     IF OLD.state IN ('completed','failed') THEN
       RAISE EXCEPTION 'A terminal V4 diagnosis checkpoint is immutable.';
     END IF;
     IF NEW.provider_call_count < OLD.provider_call_count
       OR NEW.provider_call_count > OLD.provider_call_count + 1 THEN
       RAISE EXCEPTION 'A V4 diagnosis provider call count may advance by at most one.';
     END IF;
     IF NEW.state <> OLD.state AND NOT (
       (OLD.state='queued' AND NEW.state IN ('running','failed'))
       OR (OLD.state='running' AND NEW.state IN ('completed','failed'))
     ) THEN
       RAISE EXCEPTION 'The V4 diagnosis checkpoint state transition is invalid.';
     END IF;
     RETURN NEW;
   END $$`
] as const;

export const V35_DATABASE_MIGRATIONS = [
  `CREATE OR REPLACE FUNCTION ogc_report_v4_acceptance_require_staging() RETURNS void LANGUAGE plpgsql AS $$
   DECLARE marker text;
   BEGIN
     SELECT profile INTO marker FROM deployment_environment WHERE singleton=true;
     IF marker IS DISTINCT FROM 'staging' THEN
       RAISE EXCEPTION 'The Report V4 acceptance ledger only accepts a protected staging database marker.';
     END IF;
   END $$`,
  `CREATE OR REPLACE FUNCTION ogc_report_v4_acceptance_event_valid(event_kind text,event_operation text,event_phase text,event_details jsonb)
   RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
   DECLARE keys text[];
   BEGIN
     IF jsonb_typeof(event_details)<>'object' OR octet_length(event_details::text)>32768 THEN RETURN false; END IF;
     IF event_kind='scenario_bound' THEN
       keys:=ARRAY['bindingHash'];
       RETURN event_phase='observed' AND event_operation='v4_dispatch'
         AND event_details ? 'bindingHash' AND (event_details->>'bindingHash') ~ '^[a-f0-9]{64}$'
         AND (SELECT bool_and(key=ANY(keys)) FROM jsonb_object_keys(event_details) key);
     ELSIF event_kind='crawl_run' THEN
       keys:=ARRAY['candidatePages','analyzablePages','excludedPages','jsDependentPages'];
       RETURN event_operation='crawl' AND event_phase IN ('started','completed','failed')
         AND event_details ?& keys
         AND (SELECT bool_and(key=ANY(keys)) FROM jsonb_object_keys(event_details) key)
         AND (event_details->>'candidatePages') ~ '^\\d+$' AND (event_details->>'analyzablePages') ~ '^\\d+$'
         AND (event_details->>'excludedPages') ~ '^\\d+$' AND (event_details->>'jsDependentPages') ~ '^\\d+$';
     ELSIF event_kind='site_read' THEN
       keys:=ARRAY['urlHash','readMode','networkPerformed'];
       RETURN event_operation IN ('site_raw_read','site_browser_read') AND event_phase IN ('started','completed','failed')
         AND event_details ?& keys AND (SELECT bool_and(key=ANY(keys)) FROM jsonb_object_keys(event_details) key)
         AND (event_details->>'urlHash') ~ '^[a-f0-9]{64}$' AND event_details->>'readMode' IN ('raw','browser')
         AND jsonb_typeof(event_details->'networkPerformed')='boolean';
     ELSIF event_kind='model_operation' THEN
       keys:=ARRAY['providerCall','retry','budgetOutcome','inputTokens','outputTokens'];
       RETURN event_operation IN ('page_analysis','website_synthesis','question_answer','source_diagnosis')
         AND event_phase IN ('started','completed','failed','rejected') AND event_details ?& keys
         AND (SELECT bool_and(key=ANY(keys)) FROM jsonb_object_keys(event_details) key)
         AND jsonb_typeof(event_details->'providerCall')='boolean' AND jsonb_typeof(event_details->'retry')='boolean'
         AND event_details->>'budgetOutcome' IN ('allowed','rejected')
         AND (event_details->>'inputTokens') ~ '^\\d+$' AND (event_details->>'outputTokens') ~ '^\\d+$';
    ELSIF event_kind IN ('html_assembly','artifact_activation') THEN
      keys:=ARRAY['artifactRevisionId','htmlSha256'];
      RETURN ((event_kind='html_assembly' AND event_operation IN ('core_html','enhancement_html') AND event_phase IN ('started','completed','failed'))
          OR (event_kind='artifact_activation' AND event_operation='artifact_activation' AND event_phase='observed'))
        AND event_details ?& keys
         AND (SELECT bool_and(key=ANY(keys)) FROM jsonb_object_keys(event_details) key)
         AND length(btrim(event_details->>'artifactRevisionId')) BETWEEN 1 AND 500
         AND (event_details->>'htmlSha256') ~ '^[a-f0-9]{64}$';
     ELSIF event_kind='fault_injection' THEN
       keys:=ARRAY['fault','occurrence','baselineFingerprint'];
       RETURN event_operation IN ('question_failure','diagnosis_failure','independent_source_read_failure')
         AND event_phase='consumed' AND event_details ?& keys
         AND (SELECT bool_and(key=ANY(keys)) FROM jsonb_object_keys(event_details) key)
         AND event_details->>'fault'=event_operation AND (event_details->>'occurrence') IN ('1','2')
         AND (event_details->>'baselineFingerprint') ~ '^[a-f0-9]{64}$';
     ELSIF event_kind='checkpoint_terminal' THEN
       keys:=ARRAY['checkpointHash','state'];
       RETURN event_operation IN ('question_answer','source_diagnosis') AND event_phase='observed'
         AND event_details ?& keys AND (SELECT bool_and(key=ANY(keys)) FROM jsonb_object_keys(event_details) key)
         AND (event_details->>'checkpointHash') ~ '^[a-f0-9]{64}$'
         AND event_details->>'state' IN ('answered','unavailable','completed','failed');
     ELSIF event_kind IN ('v4_dispatch','prohibited_operation') THEN
       RETURN event_details='{}'::jsonb
         AND ((event_kind='v4_dispatch' AND event_operation='v4_dispatch' AND event_phase='observed') OR
           (event_kind='prohibited_operation' AND event_operation IN ('pdf','provider_claim','qualification','four_snapshot','replacement_fulfillment') AND event_phase='started'));
     ELSIF event_kind='commerce_fingerprint' THEN
       keys:=ARRAY['fingerprint'];
       RETURN event_operation='commerce' AND event_phase='observed' AND event_details ?& keys
         AND (SELECT bool_and(key=ANY(keys)) FROM jsonb_object_keys(event_details) key)
         AND (event_details->>'fingerprint') ~ '^[a-f0-9]{64}$';
     END IF;
     RETURN false;
   END $$`,
  `CREATE TABLE IF NOT EXISTS report_v4_acceptance_sessions (
    id text PRIMARY KEY, environment text NOT NULL DEFAULT 'protected_staging', preview_deployment_id text NOT NULL,
    protected_alias_url text NOT NULL, web_git_sha text NOT NULL, worker_git_sha text NOT NULL,
    state text NOT NULL DEFAULT 'collecting', head_sequence integer NOT NULL DEFAULT 0,
    head_hash text NOT NULL DEFAULT repeat('0',64), event_count integer NOT NULL DEFAULT 0,
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(), terminal_at timestamptz,
    CONSTRAINT report_v4_acceptance_sessions_id_check CHECK(id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
    CONSTRAINT report_v4_acceptance_sessions_environment_check CHECK(environment='protected_staging'),
    CONSTRAINT report_v4_acceptance_sessions_deployment_check CHECK(preview_deployment_id=btrim(preview_deployment_id) AND length(preview_deployment_id) BETWEEN 1 AND 200 AND protected_alias_url ~ '^https://[^/?#@[:space:]]+$'),
    CONSTRAINT report_v4_acceptance_sessions_sha_check CHECK(web_git_sha ~ '^[a-f0-9]{40}$' AND worker_git_sha ~ '^[a-f0-9]{40}$' AND web_git_sha=worker_git_sha),
    CONSTRAINT report_v4_acceptance_sessions_state_check CHECK(state IN ('collecting','sealed','failed')),
    CONSTRAINT report_v4_acceptance_sessions_head_check CHECK(head_sequence>=0 AND event_count=head_sequence AND head_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT report_v4_acceptance_sessions_terminal_check CHECK((state='collecting' AND terminal_at IS NULL) OR (state IN ('sealed','failed') AND terminal_at IS NOT NULL))
  )`,
  `CREATE TABLE IF NOT EXISTS report_v4_acceptance_scenarios (
    id text PRIMARY KEY, session_id text NOT NULL REFERENCES report_v4_acceptance_sessions(id) ON DELETE RESTRICT,
    kind text NOT NULL, fault_kind text, fault_question_id text, fault_source_id text,
    expected_fault_occurrences integer NOT NULL DEFAULT 0,
    report_id text REFERENCES scan_reports(id) ON DELETE RESTRICT,
    order_id text REFERENCES payment_orders(id) ON DELETE RESTRICT,
    pre_admission_job_id text REFERENCES scan_jobs(id) ON DELETE RESTRICT,
    core_job_id text REFERENCES scan_jobs(id) ON DELETE RESTRICT,
    enhancement_job_id text REFERENCES scan_jobs(id) ON DELETE RESTRICT,
    site_snapshot_id text REFERENCES report_v4_site_snapshots(id) ON DELETE RESTRICT,
    config_snapshot_id text REFERENCES report_v4_config_snapshots(id) ON DELETE RESTRICT,
    question_set_id text REFERENCES report_business_question_sets(id) ON DELETE RESTRICT,
    core_artifact_revision_id text REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT,
    enhancement_artifact_revision_id text REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT,
    baseline_fingerprint text, final_fingerprint text, state text NOT NULL DEFAULT 'collecting',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), terminal_at timestamptz,
    CONSTRAINT report_v4_acceptance_scenarios_id_check CHECK(id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
    CONSTRAINT report_v4_acceptance_scenarios_kind_check CHECK(kind IN ('success','diagnosis_failure','question_failure')),
    CONSTRAINT report_v4_acceptance_scenarios_state_check CHECK(state IN ('collecting','sealed','failed')),
    CONSTRAINT report_v4_acceptance_scenarios_hash_check CHECK((baseline_fingerprint IS NULL OR baseline_fingerprint ~ '^[a-f0-9]{64}$') AND (final_fingerprint IS NULL OR final_fingerprint ~ '^[a-f0-9]{64}$')),
    CONSTRAINT report_v4_acceptance_scenarios_fault_identity_check CHECK(length(btrim(fault_question_id)) BETWEEN 1 AND 500 AND (fault_source_id IS NULL OR length(btrim(fault_source_id)) BETWEEN 1 AND 500)),
    CONSTRAINT report_v4_acceptance_scenarios_fault_check CHECK(
      (kind='success' AND fault_kind='independent_source_read_failure' AND fault_question_id IS NOT NULL AND expected_fault_occurrences=1)
      OR (kind='diagnosis_failure' AND fault_kind='diagnosis_failure' AND fault_question_id IS NOT NULL AND fault_source_id IS NULL AND expected_fault_occurrences=2)
      OR (kind='question_failure' AND fault_kind='question_failure' AND fault_question_id IS NOT NULL AND fault_source_id IS NULL AND expected_fault_occurrences=2)),
    CONSTRAINT report_v4_acceptance_scenarios_terminal_check CHECK((state='collecting' AND terminal_at IS NULL) OR (state IN ('sealed','failed') AND terminal_at IS NOT NULL)),
    CONSTRAINT report_v4_acceptance_scenarios_id_session_uidx UNIQUE(id,session_id),
    CONSTRAINT report_v4_acceptance_scenarios_session_kind_uidx UNIQUE(session_id,kind)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_acceptance_scenarios_report_uidx ON report_v4_acceptance_scenarios(report_id) WHERE report_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_acceptance_scenarios_order_uidx ON report_v4_acceptance_scenarios(order_id) WHERE order_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_acceptance_scenarios_pre_job_uidx ON report_v4_acceptance_scenarios(pre_admission_job_id) WHERE pre_admission_job_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_acceptance_scenarios_core_job_uidx ON report_v4_acceptance_scenarios(core_job_id) WHERE core_job_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_acceptance_scenarios_enhancement_job_uidx ON report_v4_acceptance_scenarios(enhancement_job_id) WHERE enhancement_job_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_acceptance_scenarios_core_artifact_uidx ON report_v4_acceptance_scenarios(core_artifact_revision_id) WHERE core_artifact_revision_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_acceptance_scenarios_enhancement_artifact_uidx ON report_v4_acceptance_scenarios(enhancement_artifact_revision_id) WHERE enhancement_artifact_revision_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS report_v4_acceptance_events (
    idempotency_key text PRIMARY KEY, session_id text NOT NULL REFERENCES report_v4_acceptance_sessions(id) ON DELETE RESTRICT,
    scenario_id text NOT NULL, sequence integer NOT NULL, kind text NOT NULL, operation text NOT NULL,
    unit_id text NOT NULL, attempt integer NOT NULL, phase text NOT NULL, details jsonb NOT NULL, details_canonical text NOT NULL,
    prev_hash text NOT NULL, event_hash text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), occurred_at_canonical text NOT NULL,
    CONSTRAINT report_v4_acceptance_events_scenario_session_fkey FOREIGN KEY(scenario_id,session_id)
      REFERENCES report_v4_acceptance_scenarios(id,session_id) ON DELETE RESTRICT,
    CONSTRAINT report_v4_acceptance_events_session_sequence_uidx UNIQUE(session_id,sequence),
    CONSTRAINT report_v4_acceptance_events_identity_check CHECK(idempotency_key ~ '^[a-f0-9]{64}$' AND sequence>0 AND length(btrim(unit_id)) BETWEEN 1 AND 500 AND attempt BETWEEN 0 AND 2),
    CONSTRAINT report_v4_acceptance_events_hash_check CHECK(prev_hash ~ '^[a-f0-9]{64}$' AND event_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT report_v4_acceptance_events_canonical_check CHECK(details_canonical=details::text AND octet_length(details_canonical)<=32768
      AND occurred_at_canonical ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z$'),
    CONSTRAINT report_v4_acceptance_events_kind_check CHECK(kind IN ('scenario_bound','crawl_run','site_read','model_operation','html_assembly','fault_injection','checkpoint_terminal','v4_dispatch','prohibited_operation','artifact_activation','commerce_fingerprint')),
    CONSTRAINT report_v4_acceptance_events_phase_check CHECK(phase IN ('started','completed','failed','rejected','consumed','observed')),
    CONSTRAINT report_v4_acceptance_events_details_check CHECK(ogc_report_v4_acceptance_event_valid(kind,operation,phase,details))
  )`,
  `CREATE INDEX IF NOT EXISTS report_v4_acceptance_events_scenario_idx ON report_v4_acceptance_events(scenario_id,sequence)`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_acceptance_session() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE matching_event integer; sealed_scenarios integer;
   BEGIN
     PERFORM ogc_report_v4_acceptance_require_staging();
     IF TG_OP='DELETE' THEN RAISE EXCEPTION 'A Report V4 acceptance session is immutable and cannot be deleted.'; END IF;
     IF TG_OP='INSERT' THEN RETURN NEW; END IF;
     IF OLD.state IN ('sealed','failed') THEN RAISE EXCEPTION 'A terminal Report V4 acceptance session is immutable.'; END IF;
     IF NEW.id IS DISTINCT FROM OLD.id OR NEW.environment IS DISTINCT FROM OLD.environment
       OR NEW.preview_deployment_id IS DISTINCT FROM OLD.preview_deployment_id
       OR NEW.protected_alias_url IS DISTINCT FROM OLD.protected_alias_url
       OR NEW.web_git_sha IS DISTINCT FROM OLD.web_git_sha OR NEW.worker_git_sha IS DISTINCT FROM OLD.worker_git_sha
       OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
       RAISE EXCEPTION 'A Report V4 acceptance session identity is immutable.';
     END IF;
     IF NEW.state='collecting' THEN
       IF NEW.head_sequence<>OLD.head_sequence+1 OR NEW.event_count<>OLD.event_count+1 OR NEW.terminal_at IS NOT NULL THEN
         RAISE EXCEPTION 'A Report V4 acceptance session head must advance by one exact event.';
       END IF;
       SELECT count(*) INTO matching_event FROM report_v4_acceptance_events
         WHERE session_id=NEW.id AND sequence=NEW.head_sequence AND event_hash=NEW.head_hash;
       IF matching_event<>1 THEN RAISE EXCEPTION 'A Report V4 acceptance session head requires its exact append-only event.'; END IF;
     ELSIF NEW.state IN ('sealed','failed') THEN
       IF NEW.head_sequence<>OLD.head_sequence OR NEW.head_hash<>OLD.head_hash OR NEW.event_count<>OLD.event_count OR NEW.terminal_at IS NULL THEN
         RAISE EXCEPTION 'A terminal Report V4 acceptance session cannot rewrite its event head.';
       END IF;
       IF NEW.state='sealed' THEN
         SELECT count(*) INTO sealed_scenarios FROM report_v4_acceptance_scenarios WHERE session_id=NEW.id AND state='sealed';
         IF sealed_scenarios<>3 THEN RAISE EXCEPTION 'A sealed Report V4 acceptance session requires three sealed scenarios.'; END IF;
       END IF;
     ELSE RAISE EXCEPTION 'The Report V4 acceptance session state transition is invalid.';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE TRIGGER report_v4_acceptance_sessions_guard BEFORE INSERT OR UPDATE OR DELETE ON report_v4_acceptance_sessions FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_acceptance_session()`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_acceptance_scenario() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE session_state text; order_ok boolean; pre_ok boolean; core_ok boolean; enhancement_ok boolean;
     snapshot_ok boolean; config_ok boolean; questions_ok boolean; core_artifact_ok boolean; enhancement_artifact_ok boolean;
   BEGIN
     PERFORM ogc_report_v4_acceptance_require_staging();
     IF TG_OP='DELETE' THEN RAISE EXCEPTION 'A Report V4 acceptance scenario is immutable and cannot be deleted.'; END IF;
     SELECT state INTO session_state FROM report_v4_acceptance_sessions WHERE id=NEW.session_id;
     IF session_state IS DISTINCT FROM 'collecting' THEN RAISE EXCEPTION 'A Report V4 acceptance scenario requires a collecting session.'; END IF;
     IF TG_OP='INSERT' THEN RETURN NEW; END IF;
     IF OLD.state IN ('sealed','failed') THEN RAISE EXCEPTION 'A terminal Report V4 acceptance scenario is immutable.'; END IF;
     IF NEW.id IS DISTINCT FROM OLD.id OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.fault_kind IS DISTINCT FROM OLD.fault_kind OR NEW.fault_question_id IS DISTINCT FROM OLD.fault_question_id
       OR NEW.expected_fault_occurrences IS DISTINCT FROM OLD.expected_fault_occurrences
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'A Report V4 acceptance scenario identity is immutable.'; END IF;
     IF NEW.fault_source_id IS DISTINCT FROM OLD.fault_source_id AND NOT (
       OLD.kind='success' AND OLD.fault_kind='independent_source_read_failure' AND OLD.state='collecting' AND NEW.state='collecting'
       AND OLD.fault_source_id IS NULL AND NEW.fault_source_id IS NOT NULL) THEN
       RAISE EXCEPTION 'A Report V4 acceptance scenario cannot rebind its fault source.';
     END IF;
     IF (OLD.report_id IS NOT NULL AND NEW.report_id IS DISTINCT FROM OLD.report_id)
       OR (OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id)
       OR (OLD.pre_admission_job_id IS NOT NULL AND NEW.pre_admission_job_id IS DISTINCT FROM OLD.pre_admission_job_id)
       OR (OLD.core_job_id IS NOT NULL AND NEW.core_job_id IS DISTINCT FROM OLD.core_job_id)
       OR (OLD.enhancement_job_id IS NOT NULL AND NEW.enhancement_job_id IS DISTINCT FROM OLD.enhancement_job_id)
       OR (OLD.site_snapshot_id IS NOT NULL AND NEW.site_snapshot_id IS DISTINCT FROM OLD.site_snapshot_id)
       OR (OLD.config_snapshot_id IS NOT NULL AND NEW.config_snapshot_id IS DISTINCT FROM OLD.config_snapshot_id)
       OR (OLD.question_set_id IS NOT NULL AND NEW.question_set_id IS DISTINCT FROM OLD.question_set_id)
       OR (OLD.core_artifact_revision_id IS NOT NULL AND NEW.core_artifact_revision_id IS DISTINCT FROM OLD.core_artifact_revision_id)
       OR (OLD.enhancement_artifact_revision_id IS NOT NULL AND NEW.enhancement_artifact_revision_id IS DISTINCT FROM OLD.enhancement_artifact_revision_id)
       OR (OLD.baseline_fingerprint IS NOT NULL AND NEW.baseline_fingerprint IS DISTINCT FROM OLD.baseline_fingerprint)
       OR (OLD.final_fingerprint IS NOT NULL AND NEW.final_fingerprint IS DISTINCT FROM OLD.final_fingerprint) THEN
       RAISE EXCEPTION 'A Report V4 acceptance scenario cannot rebind an entity or fingerprint.';
     END IF;
     IF NEW.state<>OLD.state AND NOT (OLD.state='collecting' AND NEW.state IN ('sealed','failed')) THEN
       RAISE EXCEPTION 'The Report V4 acceptance scenario state transition is invalid.';
     END IF;
     IF NEW.state='collecting' THEN RETURN NEW; END IF;
     IF NEW.terminal_at IS NULL OR NEW.report_id IS NULL OR NEW.order_id IS NULL OR NEW.pre_admission_job_id IS NULL
       OR NEW.core_job_id IS NULL OR NEW.site_snapshot_id IS NULL OR NEW.config_snapshot_id IS NULL
       OR NEW.question_set_id IS NULL OR NEW.core_artifact_revision_id IS NULL
       OR NEW.baseline_fingerprint IS NULL OR NEW.final_fingerprint IS NULL THEN
       RAISE EXCEPTION 'A terminal Report V4 acceptance scenario requires exact lineage and before/after fingerprints.';
     END IF;
     IF NEW.kind IN ('success','diagnosis_failure') AND NEW.enhancement_job_id IS NULL THEN
       RAISE EXCEPTION 'This Report V4 acceptance scenario requires its exact enhancement job.';
     END IF;
     IF NEW.kind='success' AND NEW.enhancement_artifact_revision_id IS NULL THEN
       RAISE EXCEPTION 'The successful Report V4 acceptance scenario requires its exact enhancement artifact.';
     END IF;
     IF NEW.kind='diagnosis_failure' AND NEW.enhancement_artifact_revision_id IS NULL THEN
       RAISE EXCEPTION 'The diagnosis-failure Report V4 acceptance scenario requires its exact enhancement artifact.';
     END IF;
     IF NEW.kind='success' AND NEW.fault_source_id IS NULL THEN
       RAISE EXCEPTION 'The successful Report V4 acceptance scenario requires its bound independent fault source before terminalization.';
     END IF;
     SELECT EXISTS(SELECT 1 FROM payment_orders WHERE id=NEW.order_id AND report_id=NEW.report_id AND fulfillment_job_id=NEW.core_job_id AND site_snapshot_id=NEW.site_snapshot_id) INTO order_ok;
     SELECT EXISTS(SELECT 1 FROM scan_jobs WHERE id=NEW.pre_admission_job_id AND report_id=NEW.report_id AND reason='v4_pre_admission' AND artifact_contract='combined_geo_report_v4') INTO pre_ok;
     SELECT EXISTS(SELECT 1 FROM scan_jobs WHERE id=NEW.core_job_id AND report_id=NEW.report_id AND site_snapshot_id=NEW.site_snapshot_id AND business_question_set_id=NEW.question_set_id AND artifact_contract='combined_geo_report_v4' AND reason='standard') INTO core_ok;
     SELECT NEW.enhancement_job_id IS NULL OR EXISTS(SELECT 1 FROM scan_jobs WHERE id=NEW.enhancement_job_id AND report_id=NEW.report_id AND business_question_set_id=NEW.question_set_id AND artifact_contract='combined_geo_report_v4' AND reason='v4_diagnosis_enhancement') INTO enhancement_ok;
     SELECT EXISTS(SELECT 1 FROM report_v4_site_snapshots WHERE id=NEW.site_snapshot_id AND report_id=NEW.report_id) INTO snapshot_ok;
     SELECT EXISTS(SELECT 1 FROM report_v4_config_snapshots WHERE id=NEW.config_snapshot_id AND report_id=NEW.report_id AND order_id=NEW.order_id AND core_job_id=NEW.core_job_id) INTO config_ok;
     SELECT EXISTS(SELECT 1 FROM report_business_question_sets WHERE id=NEW.question_set_id AND report_id=NEW.report_id AND order_id=NEW.order_id) INTO questions_ok;
     SELECT EXISTS(SELECT 1 FROM report_artifact_revisions WHERE id=NEW.core_artifact_revision_id AND report_id=NEW.report_id AND order_id=NEW.order_id AND job_id=NEW.core_job_id AND config_snapshot_id=NEW.config_snapshot_id AND artifact_contract='combined_geo_report_v4' AND revision_kind='generation') INTO core_artifact_ok;
     SELECT NEW.enhancement_artifact_revision_id IS NULL OR EXISTS(SELECT 1 FROM report_artifact_revisions WHERE id=NEW.enhancement_artifact_revision_id AND report_id=NEW.report_id AND order_id=NEW.order_id AND job_id=NEW.enhancement_job_id AND config_snapshot_id=NEW.config_snapshot_id AND source_artifact_revision_id=NEW.core_artifact_revision_id AND artifact_contract='combined_geo_report_v4' AND revision_kind='diagnosis_enhancement') INTO enhancement_artifact_ok;
     IF NOT (order_ok AND pre_ok AND core_ok AND enhancement_ok AND snapshot_ok AND config_ok AND questions_ok AND core_artifact_ok AND enhancement_artifact_ok) THEN
       RAISE EXCEPTION 'A terminal Report V4 acceptance scenario lineage is not exact.';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE TRIGGER report_v4_acceptance_scenarios_guard BEFORE INSERT OR UPDATE OR DELETE ON report_v4_acceptance_scenarios FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_acceptance_scenario()`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_acceptance_event() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE session_state text; scenario_state text; expected_sequence integer; expected_prev text; expected_key text;
     started_exists boolean; terminal_exists boolean;
   BEGIN
     PERFORM ogc_report_v4_acceptance_require_staging();
     IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'A Report V4 acceptance event is append-only and immutable.'; END IF;
     SELECT state,head_sequence+1,head_hash INTO session_state,expected_sequence,expected_prev
       FROM report_v4_acceptance_sessions WHERE id=NEW.session_id FOR UPDATE;
     SELECT state INTO scenario_state FROM report_v4_acceptance_scenarios WHERE id=NEW.scenario_id AND session_id=NEW.session_id;
     IF session_state IS DISTINCT FROM 'collecting' OR scenario_state IS DISTINCT FROM 'collecting' THEN
       RAISE EXCEPTION 'A Report V4 acceptance event requires collecting session and scenario state.';
     END IF;
     IF NEW.sequence IS DISTINCT FROM expected_sequence OR NEW.prev_hash IS DISTINCT FROM expected_prev THEN
       RAISE EXCEPTION 'A Report V4 acceptance event does not extend the exact hash-chain head.';
     END IF;
     IF NEW.phase IN ('completed','failed','rejected') THEN
       SELECT EXISTS(SELECT 1 FROM report_v4_acceptance_events
         WHERE session_id=NEW.session_id AND scenario_id=NEW.scenario_id AND kind=NEW.kind AND operation=NEW.operation
           AND unit_id=NEW.unit_id AND attempt=NEW.attempt AND phase='started') INTO started_exists;
       SELECT EXISTS(SELECT 1 FROM report_v4_acceptance_events
         WHERE session_id=NEW.session_id AND scenario_id=NEW.scenario_id AND kind=NEW.kind AND operation=NEW.operation
           AND unit_id=NEW.unit_id AND attempt=NEW.attempt AND phase IN ('completed','failed','rejected')) INTO terminal_exists;
       IF NOT started_exists OR terminal_exists THEN
         RAISE EXCEPTION 'A terminal Report V4 acceptance event requires exactly one started claim for the same unit and attempt.';
       END IF;
     END IF;
     expected_key:=encode(sha256(convert_to(concat_ws(chr(31),NEW.session_id,NEW.scenario_id,NEW.kind,NEW.operation,NEW.unit_id,NEW.attempt::text,NEW.phase),'UTF8')),'hex');
     IF NEW.idempotency_key IS DISTINCT FROM expected_key THEN RAISE EXCEPTION 'A Report V4 acceptance event idempotency key is not deterministic.'; END IF;
     NEW.details_canonical:=NEW.details::text;
     NEW.occurred_at_canonical:=to_char(NEW.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
     NEW.event_hash:=encode(sha256(convert_to(concat_ws(chr(31),NEW.prev_hash,NEW.idempotency_key,NEW.sequence::text,NEW.kind,NEW.operation,NEW.unit_id,NEW.attempt::text,NEW.phase,NEW.details_canonical,NEW.occurred_at_canonical),'UTF8')),'hex');
     RETURN NEW;
   END $$`,
  `CREATE TRIGGER report_v4_acceptance_events_guard BEFORE INSERT OR UPDATE OR DELETE ON report_v4_acceptance_events FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_acceptance_event()`,
  `CREATE OR REPLACE FUNCTION ogc_advance_report_v4_acceptance_session_head() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     UPDATE report_v4_acceptance_sessions
       SET head_sequence=NEW.sequence,head_hash=NEW.event_hash,event_count=event_count+1
       WHERE id=NEW.session_id AND state='collecting';
     IF NOT FOUND THEN RAISE EXCEPTION 'A Report V4 acceptance event could not advance its collecting session head.'; END IF;
     RETURN NEW;
   END $$`,
  `CREATE TRIGGER report_v4_acceptance_events_advance_head AFTER INSERT ON report_v4_acceptance_events FOR EACH ROW EXECUTE FUNCTION ogc_advance_report_v4_acceptance_session_head()`
] as const;

export const V36_DATABASE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS report_v4_acceptance_site_read_manifest (
    identity_hash text PRIMARY KEY,
    session_id text NOT NULL REFERENCES report_v4_acceptance_sessions(id) ON DELETE RESTRICT,
    scenario_id text NOT NULL,
    report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
    job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE RESTRICT,
    scope text NOT NULL,
    purpose text NOT NULL,
    url_hash text NOT NULL,
    mode text NOT NULL,
    attempt integer NOT NULL,
    pair_binding_hash text NOT NULL,
    owner_question_id text,
    owner_source_id text,
    network_performed boolean NOT NULL DEFAULT true,
    terminal_phase text,
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    terminal_at timestamptz,
    CONSTRAINT report_v4_acceptance_site_read_manifest_scenario_session_fkey
      FOREIGN KEY(scenario_id,session_id) REFERENCES report_v4_acceptance_scenarios(id,session_id) ON DELETE RESTRICT,
    CONSTRAINT report_v4_acceptance_site_read_manifest_hash_check
      CHECK(identity_hash ~ '^[a-f0-9]{64}$' AND url_hash ~ '^[a-f0-9]{64}$' AND pair_binding_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT report_v4_acceptance_site_read_manifest_mode_check CHECK(mode IN ('raw','browser')),
    CONSTRAINT report_v4_acceptance_site_read_manifest_network_check CHECK(network_performed=true),
    CONSTRAINT report_v4_acceptance_site_read_manifest_owner_check
      CHECK((owner_question_id IS NULL OR (owner_question_id=btrim(owner_question_id) AND length(owner_question_id) BETWEEN 1 AND 500))
        AND (owner_source_id IS NULL OR (owner_source_id=btrim(owner_source_id) AND length(owner_source_id) BETWEEN 1 AND 500))),
    CONSTRAINT report_v4_acceptance_site_read_manifest_scope_check CHECK(
      (scope='admission_discovery' AND purpose IN ('homepage','robots','sitemap') AND attempt=0
        AND owner_question_id IS NULL AND owner_source_id IS NULL)
      OR (scope='admission_page' AND purpose='page' AND attempt=0
        AND owner_question_id IS NULL AND owner_source_id IS NULL)
      OR (scope='enhancement_source' AND purpose='source' AND attempt=1
        AND owner_question_id IS NOT NULL AND owner_source_id IS NOT NULL)),
    CONSTRAINT report_v4_acceptance_site_read_manifest_terminal_check CHECK(
      (terminal_phase IS NULL AND terminal_at IS NULL)
      OR (terminal_phase IN ('completed','failed') AND terminal_at IS NOT NULL AND terminal_at>=started_at))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_acceptance_site_read_manifest_natural_uidx
    ON report_v4_acceptance_site_read_manifest
      (session_id,scenario_id,report_id,job_id,scope,purpose,url_hash,mode,attempt,owner_question_id,owner_source_id)
    NULLS NOT DISTINCT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS report_v4_acceptance_site_read_manifest_enh_physical_uidx
    ON report_v4_acceptance_site_read_manifest(session_id,scenario_id,job_id,url_hash,mode,attempt)
    WHERE scope='enhancement_source'`,
  `CREATE INDEX IF NOT EXISTS report_v4_acceptance_site_read_manifest_scenario_idx
    ON report_v4_acceptance_site_read_manifest(session_id,scenario_id,started_at,identity_hash)`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_acceptance_site_read_manifest() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE session_state text; scenario_state text; scenario_report text; expected_job text;
     lineage_ok boolean; expected_identity text; expected_pair text;
   BEGIN
     PERFORM ogc_report_v4_acceptance_require_staging();
     IF TG_OP='DELETE' THEN
       RAISE EXCEPTION 'A Report V4 acceptance site-read manifest row is immutable and cannot be deleted.';
     END IF;
     IF TG_OP='INSERT' THEN
       SELECT sessions.state,scenarios.state,scenarios.report_id,
         CASE WHEN NEW.scope IN ('admission_discovery','admission_page') THEN scenarios.pre_admission_job_id
              ELSE scenarios.enhancement_job_id END
         INTO session_state,scenario_state,scenario_report,expected_job
       FROM report_v4_acceptance_sessions sessions
       JOIN report_v4_acceptance_scenarios scenarios
         ON scenarios.session_id=sessions.id AND scenarios.id=NEW.scenario_id
       WHERE sessions.id=NEW.session_id;
       IF session_state IS DISTINCT FROM 'collecting' OR scenario_state IS DISTINCT FROM 'collecting' THEN
         RAISE EXCEPTION 'A Report V4 acceptance site-read begin requires a collecting session and scenario.';
       END IF;
       IF expected_job IS DISTINCT FROM NEW.job_id OR (scenario_report IS NOT NULL AND scenario_report IS DISTINCT FROM NEW.report_id) THEN
         RAISE EXCEPTION 'A Report V4 acceptance site-read begin requires exact scenario lineage.';
       END IF;
       IF NEW.scope IN ('admission_discovery','admission_page') THEN
         SELECT EXISTS(SELECT 1 FROM scan_jobs WHERE id=NEW.job_id AND report_id=NEW.report_id
           AND reason='v4_pre_admission' AND artifact_contract='combined_geo_report_v4') INTO lineage_ok;
       ELSE
         SELECT scenario_report=NEW.report_id AND EXISTS(SELECT 1 FROM scan_jobs WHERE id=NEW.job_id AND report_id=NEW.report_id
           AND reason='v4_diagnosis_enhancement' AND artifact_contract='combined_geo_report_v4') INTO lineage_ok;
       END IF;
       IF lineage_ok IS DISTINCT FROM true THEN
         RAISE EXCEPTION 'A Report V4 acceptance site-read begin requires exact job and report lineage.';
       END IF;
       expected_identity:=encode(sha256(convert_to(concat_ws(chr(31),
         'ogc:report-v4:acceptance-site-read-manifest:identity:v1',NEW.session_id,NEW.scenario_id,NEW.report_id,
         NEW.job_id,NEW.scope,NEW.purpose,NEW.url_hash,NEW.mode,NEW.attempt::text,
         coalesce(NEW.owner_question_id,''),coalesce(NEW.owner_source_id,'')),'UTF8')),'hex');
       expected_pair:=encode(sha256(convert_to(concat_ws(chr(31),
         'ogc:report-v4:acceptance-site-read-manifest:pair:v1',NEW.session_id,NEW.scenario_id,NEW.report_id,
         NEW.job_id,NEW.scope,NEW.purpose,NEW.url_hash,NEW.attempt::text),'UTF8')),'hex');
       IF NEW.identity_hash IS DISTINCT FROM expected_identity OR NEW.pair_binding_hash IS DISTINCT FROM expected_pair THEN
         RAISE EXCEPTION 'A Report V4 acceptance site-read manifest hash is not deterministic.';
       END IF;
       RETURN NEW;
     END IF;
     SELECT sessions.state,scenarios.state INTO session_state,scenario_state
       FROM report_v4_acceptance_sessions sessions
       JOIN report_v4_acceptance_scenarios scenarios
         ON scenarios.session_id=sessions.id AND scenarios.id=NEW.scenario_id
       WHERE sessions.id=NEW.session_id;
     IF session_state IS DISTINCT FROM 'collecting' OR scenario_state IS DISTINCT FROM 'collecting' THEN
       RAISE EXCEPTION 'A Report V4 acceptance site-read terminal requires a collecting session and scenario.';
     END IF;
     IF NEW.identity_hash IS DISTINCT FROM OLD.identity_hash OR NEW.session_id IS DISTINCT FROM OLD.session_id
       OR NEW.scenario_id IS DISTINCT FROM OLD.scenario_id OR NEW.report_id IS DISTINCT FROM OLD.report_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.scope IS DISTINCT FROM OLD.scope
       OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.url_hash IS DISTINCT FROM OLD.url_hash
       OR NEW.mode IS DISTINCT FROM OLD.mode OR NEW.attempt IS DISTINCT FROM OLD.attempt
       OR NEW.pair_binding_hash IS DISTINCT FROM OLD.pair_binding_hash
       OR NEW.owner_question_id IS DISTINCT FROM OLD.owner_question_id
       OR NEW.owner_source_id IS DISTINCT FROM OLD.owner_source_id
       OR NEW.network_performed IS DISTINCT FROM OLD.network_performed
       OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
       RAISE EXCEPTION 'A Report V4 acceptance site-read manifest identity and owner are immutable.';
     END IF;
     IF OLD.terminal_phase IS NOT NULL OR OLD.terminal_at IS NOT NULL THEN
       RAISE EXCEPTION 'A terminal Report V4 acceptance site-read manifest row is immutable.';
     END IF;
     IF NEW.terminal_phase NOT IN ('completed','failed') OR NEW.terminal_at IS NULL THEN
       RAISE EXCEPTION 'A Report V4 acceptance site-read manifest row may only transition once to completed or failed.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_acceptance_site_read_manifest_guard
    ON report_v4_acceptance_site_read_manifest`,
  `CREATE TRIGGER report_v4_acceptance_site_read_manifest_guard
    BEFORE INSERT OR UPDATE OR DELETE ON report_v4_acceptance_site_read_manifest
    FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_acceptance_site_read_manifest()`
] as const;

const V37_ACCEPTANCE_EVENT_VALID_MIGRATION = V35_DATABASE_MIGRATIONS.find((statement) =>
  statement.includes("CREATE OR REPLACE FUNCTION ogc_report_v4_acceptance_event_valid"))!
  .replace(
    "'pdf','provider_claim','qualification','four_snapshot','replacement_fulfillment'",
    "'pdf','provider_claim','qualification','four_snapshot','replacement_fulfillment','correction','full_report_rerun','legacy_mutation'"
  );

export const V37_DATABASE_MIGRATIONS = [
  V37_ACCEPTANCE_EVENT_VALID_MIGRATION,
  `CREATE TABLE IF NOT EXISTS report_v4_prohibited_operation_guard_runs (
    id text PRIMARY KEY,
    domain text NOT NULL,
    session_id text NOT NULL REFERENCES report_v4_acceptance_sessions(id) ON DELETE RESTRICT,
    scenario_id text NOT NULL,
    job_id text NOT NULL REFERENCES scan_jobs(id) ON DELETE RESTRICT,
    worker_git_sha text NOT NULL,
    manifest_hash text NOT NULL,
    state text NOT NULL DEFAULT 'armed',
    armed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    completed_at timestamptz,
    CONSTRAINT report_v4_prohibited_operation_guard_runs_scenario_session_fkey
      FOREIGN KEY(scenario_id,session_id) REFERENCES report_v4_acceptance_scenarios(id,session_id) ON DELETE RESTRICT,
    CONSTRAINT report_v4_prohibited_operation_guard_runs_identity_uidx UNIQUE(session_id,scenario_id,job_id),
    CONSTRAINT report_v4_prohibited_operation_guard_runs_id_check CHECK(id ~ '^[a-f0-9]{64}$'),
    CONSTRAINT report_v4_prohibited_operation_guard_runs_domain_check
      CHECK(domain='open-geo-console/report-v4/prohibited-operation-manifest'),
    CONSTRAINT report_v4_prohibited_operation_guard_runs_sha_check
      CHECK(worker_git_sha ~ '^[a-f0-9]{40}$' AND manifest_hash='e7f33b34d76384bbb9366f4f7cc109e6bd63dc84ea962fc9ad410ddb1b6c197b'),
    CONSTRAINT report_v4_prohibited_operation_guard_runs_state_check CHECK(state IN ('armed','completed')),
    CONSTRAINT report_v4_prohibited_operation_guard_runs_terminal_check CHECK(
      (state='armed' AND completed_at IS NULL)
      OR (state='completed' AND completed_at IS NOT NULL AND completed_at>=armed_at))
  )`,
  `CREATE TABLE IF NOT EXISTS report_v4_prohibited_operation_guard_counters (
    run_id text NOT NULL REFERENCES report_v4_prohibited_operation_guard_runs(id) ON DELETE RESTRICT,
    operation text NOT NULL,
    guard_site text NOT NULL,
    attempt_count integer NOT NULL DEFAULT 0,
    seeded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    attempted_at timestamptz,
    CONSTRAINT report_v4_prohibited_operation_guard_counters_pkey PRIMARY KEY(run_id,guard_site),
    CONSTRAINT report_v4_prohibited_operation_guard_counters_attempt_check CHECK(attempt_count IN (0,1)),
    CONSTRAINT report_v4_prohibited_operation_guard_counters_timestamp_check CHECK(
      (attempt_count=0 AND attempted_at IS NULL)
      OR (attempt_count=1 AND attempted_at IS NOT NULL AND attempted_at>=seeded_at))
  )`,
  `CREATE OR REPLACE FUNCTION ogc_report_v4_prohibited_operation_pair_valid(candidate_operation text,candidate_site text)
   RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT CASE candidate_site
     WHEN 'pdf_export_url' THEN candidate_operation='pdf'
     WHEN 'pdf_export_html' THEN candidate_operation='pdf'
     WHEN 'pdf_readiness_chromium' THEN candidate_operation='pdf'
     WHEN 'pdf_readiness_storage' THEN candidate_operation='pdf'
     WHEN 'full_report_rerun' THEN candidate_operation='full_report_rerun'
     WHEN 'provider_claim' THEN candidate_operation='provider_claim'
     WHEN 'qualification' THEN candidate_operation='qualification'
     WHEN 'four_snapshot' THEN candidate_operation='four_snapshot'
     WHEN 'replacement_prepare' THEN candidate_operation='replacement_fulfillment'
     WHEN 'replacement_resume' THEN candidate_operation='replacement_fulfillment'
     WHEN 'replacement_terminalize' THEN candidate_operation='replacement_fulfillment'
     WHEN 'correction_prepare' THEN candidate_operation='correction'
     WHEN 'correction_confirm' THEN candidate_operation='correction'
     WHEN 'correction_terminalize' THEN candidate_operation='correction'
     WHEN 'legacy_mutation' THEN candidate_operation='legacy_mutation'
     ELSE false END $$`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_prohibited_operation_run() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE session_state text; scenario_state text; expected_sha text; job_owned boolean; expected_id text;
     counter_count integer; attempted_count integer;
   BEGIN
     PERFORM ogc_report_v4_acceptance_require_staging();
     IF TG_OP='DELETE' THEN RAISE EXCEPTION 'A Report V4 prohibited-operation guard run is immutable and cannot be deleted.'; END IF;
     IF TG_OP='INSERT' THEN
       SELECT sessions.state,scenarios.state,sessions.worker_git_sha,
         NEW.job_id IN (scenarios.pre_admission_job_id,scenarios.core_job_id,scenarios.enhancement_job_id)
       INTO session_state,scenario_state,expected_sha,job_owned
       FROM report_v4_acceptance_sessions sessions
       JOIN report_v4_acceptance_scenarios scenarios ON scenarios.session_id=sessions.id AND scenarios.id=NEW.scenario_id
       WHERE sessions.id=NEW.session_id;
       IF session_state IS DISTINCT FROM 'collecting' OR scenario_state IS DISTINCT FROM 'collecting' OR job_owned IS DISTINCT FROM true THEN
         RAISE EXCEPTION 'A Report V4 prohibited-operation guard run requires a collecting protected scenario that owns the exact job.';
       END IF;
       IF NEW.worker_git_sha IS DISTINCT FROM expected_sha OR NEW.manifest_hash IS DISTINCT FROM 'e7f33b34d76384bbb9366f4f7cc109e6bd63dc84ea962fc9ad410ddb1b6c197b' THEN
         RAISE EXCEPTION 'A Report V4 prohibited-operation guard run requires the exact worker SHA and manifest hash.';
       END IF;
       expected_id:=encode(sha256(convert_to(concat_ws(chr(31),'ogc:report-v4:prohibited-operation-guard-run:v1',
         NEW.domain,NEW.session_id,NEW.scenario_id,NEW.job_id,NEW.worker_git_sha,NEW.manifest_hash),'UTF8')),'hex');
       IF NEW.id IS DISTINCT FROM expected_id OR NEW.state<>'armed' OR NEW.completed_at IS NOT NULL THEN
         RAISE EXCEPTION 'A Report V4 prohibited-operation guard run identity is not deterministic and armed.';
       END IF;
       RETURN NEW;
     END IF;
     IF NEW.id IS DISTINCT FROM OLD.id OR NEW.domain IS DISTINCT FROM OLD.domain
       OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.scenario_id IS DISTINCT FROM OLD.scenario_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.worker_git_sha IS DISTINCT FROM OLD.worker_git_sha
       OR NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash OR NEW.armed_at IS DISTINCT FROM OLD.armed_at THEN
       RAISE EXCEPTION 'A Report V4 prohibited-operation guard run identity is immutable.';
     END IF;
     IF OLD.state<>'armed' OR NEW.state<>'completed' OR OLD.completed_at IS NOT NULL OR NEW.completed_at IS NULL THEN
       RAISE EXCEPTION 'A Report V4 prohibited-operation guard run may complete exactly once.';
     END IF;
     SELECT sessions.state,scenarios.state INTO session_state,scenario_state
       FROM report_v4_acceptance_sessions sessions
       JOIN report_v4_acceptance_scenarios scenarios ON scenarios.session_id=sessions.id AND scenarios.id=OLD.scenario_id
       WHERE sessions.id=OLD.session_id;
     IF session_state IS DISTINCT FROM 'collecting' OR scenario_state IS DISTINCT FROM 'collecting' THEN
       RAISE EXCEPTION 'A Report V4 prohibited-operation guard run may complete only while its session and scenario are collecting.';
     END IF;
     SELECT count(*),count(*) FILTER(WHERE attempt_count<>0) INTO counter_count,attempted_count
       FROM report_v4_prohibited_operation_guard_counters WHERE run_id=OLD.id;
     IF counter_count<>15 OR attempted_count<>0 THEN
       RAISE EXCEPTION 'A completed Report V4 prohibited-operation guard run requires exactly fifteen zero counters.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_prohibited_operation_guard_runs_guard
    ON report_v4_prohibited_operation_guard_runs`,
  `CREATE TRIGGER report_v4_prohibited_operation_guard_runs_guard
    BEFORE INSERT OR UPDATE OR DELETE ON report_v4_prohibited_operation_guard_runs
    FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_prohibited_operation_run()`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_prohibited_operation_counter() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE run_state text; session_state text; scenario_state text;
   BEGIN
     PERFORM ogc_report_v4_acceptance_require_staging();
     IF TG_OP='DELETE' THEN RAISE EXCEPTION 'A Report V4 prohibited-operation guard counter is immutable and cannot be deleted.'; END IF;
     SELECT runs.state,sessions.state,scenarios.state INTO run_state,session_state,scenario_state
       FROM report_v4_prohibited_operation_guard_runs runs
       JOIN report_v4_acceptance_sessions sessions ON sessions.id=runs.session_id
       JOIN report_v4_acceptance_scenarios scenarios ON scenarios.id=runs.scenario_id AND scenarios.session_id=runs.session_id
       WHERE runs.id=NEW.run_id;
     IF run_state IS DISTINCT FROM 'armed' OR session_state IS DISTINCT FROM 'collecting' OR scenario_state IS DISTINCT FROM 'collecting' THEN
       RAISE EXCEPTION 'A Report V4 prohibited-operation guard counter requires an armed collecting run.';
     END IF;
     IF NOT ogc_report_v4_prohibited_operation_pair_valid(NEW.operation,NEW.guard_site) THEN
       RAISE EXCEPTION 'A Report V4 prohibited-operation guard counter operation and site are not canonical.';
     END IF;
     IF TG_OP='INSERT' THEN
       IF NEW.attempt_count<>0 OR NEW.attempted_at IS NOT NULL THEN
         RAISE EXCEPTION 'A Report V4 prohibited-operation guard counter must be seeded at zero.';
       END IF;
       RETURN NEW;
     END IF;
     IF NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.operation IS DISTINCT FROM OLD.operation
       OR NEW.guard_site IS DISTINCT FROM OLD.guard_site OR NEW.seeded_at IS DISTINCT FROM OLD.seeded_at THEN
       RAISE EXCEPTION 'A Report V4 prohibited-operation guard counter identity is immutable.';
     END IF;
     IF OLD.attempt_count<>0 OR OLD.attempted_at IS NOT NULL OR NEW.attempt_count<>1 OR NEW.attempted_at IS NULL THEN
       RAISE EXCEPTION 'A Report V4 prohibited-operation guard counter may increment only once from zero to one.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_prohibited_operation_guard_counters_guard
    ON report_v4_prohibited_operation_guard_counters`,
  `CREATE TRIGGER report_v4_prohibited_operation_guard_counters_guard
    BEFORE INSERT OR UPDATE OR DELETE ON report_v4_prohibited_operation_guard_counters
    FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_prohibited_operation_counter()`
] as const;

export const V38_DATABASE_MIGRATIONS = [
  `ALTER TABLE report_v4_website_synthesis_checkpoints ADD COLUMN IF NOT EXISTS input_identity_hash text`,
  `ALTER TABLE report_v4_website_synthesis_checkpoints ADD COLUMN IF NOT EXISTS page_summary_identity_set_hash text`,
  `ALTER TABLE report_v4_website_synthesis_checkpoints ADD COLUMN IF NOT EXISTS page_summary_count integer`,
  `DO $$ BEGIN
     IF EXISTS(SELECT 1 FROM report_v4_website_synthesis_checkpoints
       WHERE input_identity_hash IS NULL OR page_summary_identity_set_hash IS NULL OR page_summary_count IS NULL) THEN
       RAISE EXCEPTION 'Existing V4 website synthesis checkpoints cannot be upgraded without provable input identity; operator disposition is required.';
     END IF;
   END $$`,
  `ALTER TABLE report_v4_website_synthesis_checkpoints ALTER COLUMN input_identity_hash SET NOT NULL`,
  `ALTER TABLE report_v4_website_synthesis_checkpoints ALTER COLUMN page_summary_identity_set_hash SET NOT NULL`,
  `ALTER TABLE report_v4_website_synthesis_checkpoints ALTER COLUMN page_summary_count SET NOT NULL`,
  `ALTER TABLE report_v4_website_synthesis_checkpoints DROP CONSTRAINT IF EXISTS report_v4_website_synthesis_checkpoint_input_authority_check`,
  `ALTER TABLE report_v4_website_synthesis_checkpoints ADD CONSTRAINT report_v4_website_synthesis_checkpoint_input_authority_check
     CHECK(input_identity_hash ~ '^[a-f0-9]{64}$' AND page_summary_identity_set_hash ~ '^[a-f0-9]{64}$'
       AND page_summary_count BETWEEN 1 AND 50)`,
  `ALTER TABLE report_v4_website_synthesis_checkpoints DROP CONSTRAINT IF EXISTS report_v4_website_synthesis_checkpoint_state_authority_check`,
  `ALTER TABLE report_v4_website_synthesis_checkpoints ADD CONSTRAINT report_v4_website_synthesis_checkpoint_state_authority_check CHECK(
     (state='queued' AND provider_call_count=0 AND worker_id IS NULL AND lease_expires_at IS NULL AND error_code IS NULL)
     OR (state='running' AND worker_id IS NOT NULL AND length(btrim(worker_id)) BETWEEN 1 AND 500
       AND lease_expires_at IS NOT NULL AND error_code IS NULL)
     OR (state='completed' AND provider_call_count=1 AND worker_id IS NULL AND lease_expires_at IS NULL AND error_code IS NULL)
     OR (state='failed' AND provider_call_count=1 AND worker_id IS NULL AND lease_expires_at IS NULL
       AND length(btrim(error_code)) BETWEEN 1 AND 200))`,
  `CREATE OR REPLACE FUNCTION ogc_guard_report_v4_website_synthesis_checkpoint_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP='DELETE' THEN
       RAISE EXCEPTION 'A V4 website synthesis checkpoint is immutable and cannot be deleted.';
     END IF;
     IF TG_OP='INSERT' THEN
       IF NEW.state<>'queued' OR NEW.provider_call_count<>0 OR NEW.worker_id IS NOT NULL
         OR NEW.lease_expires_at IS NOT NULL OR NEW.output_payload IS NOT NULL OR NEW.output_hash IS NOT NULL
         OR NEW.error_code IS NOT NULL THEN
         RAISE EXCEPTION 'A V4 website synthesis checkpoint must be inserted as fresh queued authority.';
       END IF;
       RETURN NEW;
     END IF;
     IF NEW.identity_hash IS DISTINCT FROM OLD.identity_hash
       OR NEW.report_id IS DISTINCT FROM OLD.report_id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.core_job_id IS DISTINCT FROM OLD.core_job_id
       OR NEW.config_snapshot_id IS DISTINCT FROM OLD.config_snapshot_id
       OR NEW.site_snapshot_id IS DISTINCT FROM OLD.site_snapshot_id
       OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
       OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
       OR NEW.input_identity_hash IS DISTINCT FROM OLD.input_identity_hash
       OR NEW.page_summary_identity_set_hash IS DISTINCT FROM OLD.page_summary_identity_set_hash
       OR NEW.page_summary_count IS DISTINCT FROM OLD.page_summary_count
       OR NEW.correction_count IS DISTINCT FROM OLD.correction_count
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
       RAISE EXCEPTION 'A V4 website synthesis checkpoint input authority is immutable.';
     END IF;
     IF OLD.state IN ('completed','failed') THEN
       RAISE EXCEPTION 'A terminal V4 website synthesis checkpoint is immutable.';
     END IF;
     IF OLD.state='queued' THEN
       IF NEW.state<>'running' OR NEW.provider_call_count<>0 OR NEW.worker_id IS NULL
         OR NEW.lease_expires_at IS NULL THEN
         RAISE EXCEPTION 'A queued V4 website synthesis checkpoint may only be claimed before provider authorization.';
       END IF;
     ELSIF OLD.state='running' THEN
       IF NEW.state='running' THEN
         IF OLD.provider_call_count=0 AND NEW.provider_call_count=0 THEN
           IF OLD.lease_expires_at>clock_timestamp() OR NEW.worker_id IS NULL
             OR NEW.lease_expires_at IS NULL THEN
             RAISE EXCEPTION 'A running V4 website synthesis checkpoint may only be reclaimed after its unused lease expires.';
           END IF;
         ELSIF OLD.provider_call_count=0 AND NEW.provider_call_count=1 THEN
           IF NEW.worker_id IS DISTINCT FROM OLD.worker_id OR NEW.lease_expires_at IS DISTINCT FROM OLD.lease_expires_at
             OR OLD.lease_expires_at IS NULL OR OLD.lease_expires_at<=clock_timestamp() THEN
             RAISE EXCEPTION 'A V4 website synthesis provider call requires the exact live checkpoint lease.';
           END IF;
         ELSE
           RAISE EXCEPTION 'A V4 website synthesis provider call may be authorized exactly once.';
         END IF;
       ELSIF NEW.state IN ('completed','failed') THEN
         IF OLD.provider_call_count<>1 OR NEW.provider_call_count<>1 OR OLD.lease_expires_at IS NULL
           OR OLD.lease_expires_at<=clock_timestamp() THEN
           RAISE EXCEPTION 'A terminal V4 website synthesis checkpoint requires one authorized provider call on a live lease.';
         END IF;
       ELSE
         RAISE EXCEPTION 'The V4 website synthesis checkpoint state transition is invalid.';
       END IF;
     ELSE
       RAISE EXCEPTION 'The V4 website synthesis checkpoint state transition is invalid.';
     END IF;
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS report_v4_website_synthesis_checkpoints_guard
     ON report_v4_website_synthesis_checkpoints`,
  `CREATE TRIGGER report_v4_website_synthesis_checkpoints_guard
     BEFORE INSERT OR UPDATE OR DELETE ON report_v4_website_synthesis_checkpoints
     FOR EACH ROW EXECUTE FUNCTION ogc_guard_report_v4_website_synthesis_checkpoint_mutation()`
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
  { version: 24, migrations: V24_DATABASE_MIGRATIONS },
  { version: 25, migrations: V25_DATABASE_MIGRATIONS },
  { version: 26, migrations: V26_DATABASE_MIGRATIONS },
  { version: 27, migrations: V27_DATABASE_MIGRATIONS },
  { version: 28, migrations: V28_DATABASE_MIGRATIONS },
  { version: 29, migrations: V29_DATABASE_MIGRATIONS },
  { version: 30, migrations: V30_DATABASE_MIGRATIONS },
  { version: 31, migrations: V31_DATABASE_MIGRATIONS },
  { version: 32, migrations: V32_DATABASE_MIGRATIONS },
  { version: 33, migrations: V33_DATABASE_MIGRATIONS },
  { version: 34, migrations: V34_DATABASE_MIGRATIONS },
  { version: 35, migrations: V35_DATABASE_MIGRATIONS },
  { version: 36, migrations: V36_DATABASE_MIGRATIONS },
  { version: 37, migrations: V37_DATABASE_MIGRATIONS },
  { version: 38, migrations: V38_DATABASE_MIGRATIONS }
] as const;

export function databaseMigrationsAfter(currentVersion: number | undefined): string[] {
  const version = currentVersion ?? 0;
  return DATABASE_MIGRATION_STEPS
    .filter((step) => step.version > version)
    .flatMap((step) => [...step.migrations]);
}

export const DATABASE_MIGRATIONS = databaseMigrationsAfter(undefined);
