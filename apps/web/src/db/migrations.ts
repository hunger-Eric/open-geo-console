// Idempotent bootstrap for self-hosted deployments. A future migration runner can
// execute the same statements and then take ownership of schema versioning.
export const DATABASE_MIGRATIONS = [
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
    locale text NOT NULL CONSTRAINT scan_jobs_locale_check CHECK (locale IN ('en','zh')),
    reason text NOT NULL DEFAULT 'standard' CONSTRAINT scan_jobs_reason_check CHECK (reason IN ('standard','system_recovery','locale_correction','staging_regeneration')),
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
   CHECK (reason IN ('standard','system_recovery','locale_correction','staging_regeneration'))`,
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
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
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
   ON report_evidence_assets (report_id, finding_id)`
] as const;
