import { createHash } from "node:crypto";
import { normalizeReportV4AccessTokens, normalizeReportV4ArtifactRevisions, type ReportV4AccessTokenAuthority, type ReportV4ArtifactRevisionAuthority } from "../report-v4/report-v4-commerce-artifact-authority";
import { fingerprintReportV4CommerceAuthority } from "../report-v4/report-v4-commerce-authority-fingerprint";
import { normalizeReportV4DiagnosisCheckpointAuthorities, normalizeReportV4QuestionCheckpointAuthorities, type ReportV4DiagnosisCheckpointAuthority, type ReportV4QuestionCheckpointAuthority } from "../report-v4/report-v4-commerce-checkpoint-authority";
import { normalizeReportV4CommerceCreditAuthority, type ReportV4CommerceCreditAuthority } from "../report-v4/report-v4-commerce-credit-authority";
import { normalizeReportV4CommerceEmailAuthority, type ReportV4CommerceEmailAuthority } from "../report-v4/report-v4-commerce-email-authority";
import { normalizeReportV4CommerceDispatches, normalizeReportV4CommerceJobs, type ReportV4CommerceDispatchAuthority, type ReportV4CommerceJobAuthority } from "../report-v4/report-v4-commerce-job-authority";
import { normalizeReportV4CommerceOrders, normalizeReportV4PaymentEvents, type ReportV4CommerceOrderAuthority, type ReportV4PaymentEventAuthority } from "../report-v4/report-v4-commerce-order-authority";
import { computeReportV4DiagnosisTerminalCheckpointFingerprint, computeReportV4QuestionTerminalCheckpointFingerprint } from "../report-v4/report-v4-acceptance-checkpoint-fingerprints";
import type { ReportV4DiagnosisCheckpoint } from "./report-v4-diagnosis-checkpoints";
import type { ReportV4QuestionCheckpoint } from "./report-v4-question-checkpoints";

type Row = Record<string, unknown>;
type Rows = Row[];
type QuerySql = { unsafe<T extends Rows = Rows>(query: string, parameters?: unknown[]): Promise<T> };
export interface ReportV4CommerceAuthoritySnapshotSql {
  begin<T>(options: string, work: (sql: QuerySql) => Promise<T>): Promise<T>;
}
export interface LoadReportV4CommerceAuthoritySnapshotInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
}
export interface ReportV4CommerceAuthorityScope {
  readonly reportIdHash: string;
  readonly orderIdHash: string;
  readonly siteSnapshotIdHash: string | null;
  readonly configSnapshotIdHash: string | null;
  readonly questionSetIdHash: string | null;
  readonly preAdmissionJobIdHash: string | null;
  readonly coreJobIdHash: string | null;
  readonly enhancementJobIdHash: string | null;
  readonly coreArtifactRevisionIdHash: string | null;
  readonly enhancementArtifactRevisionIdHash: string | null;
  readonly activeArtifactRevisionIdHash: string | null;
}
export interface ReportV4CommerceAuthoritySnapshot {
  readonly phase: "baseline" | "final";
  readonly scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  readonly capturedAt: string;
  readonly scope: ReportV4CommerceAuthorityScope;
  readonly orders: readonly ReportV4CommerceOrderAuthority[];
  readonly paymentEvents: readonly ReportV4PaymentEventAuthority[];
  readonly jobs: readonly ReportV4CommerceJobAuthority[];
  readonly dispatches: readonly ReportV4CommerceDispatchAuthority[];
  readonly creditAuthority: ReportV4CommerceCreditAuthority;
  readonly emailAuthority: ReportV4CommerceEmailAuthority;
  readonly accessTokens: readonly ReportV4AccessTokenAuthority[];
  readonly artifacts: readonly ReportV4ArtifactRevisionAuthority[];
  readonly questionCheckpoints: readonly ReportV4QuestionCheckpointAuthority[];
  readonly diagnosisCheckpoints: readonly ReportV4DiagnosisCheckpointAuthority[];
  readonly fingerprint: string;
  readonly transactionProfile: Readonly<{ isolation: "repeatable read"; readOnly: true }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/**
 * Reads local PostgreSQL authority only; this is not provider reconciliation.
 * @requirement GEO-V4-COMMERCE-01
 * @requirement GEO-V4-ACCEPT-01
 * @requirement GEO-V4-PDF-01
 * @requirement GEO-V4-LEGACY-01
 */
export async function loadReportV4CommerceAuthoritySnapshot(
  sql: ReportV4CommerceAuthoritySnapshotSql,
  input: LoadReportV4CommerceAuthoritySnapshotInput,
): Promise<ReportV4CommerceAuthoritySnapshot> {
  const parsed = parseInput(input);
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const isolation = one(await query(tx, "isolation", `SELECT current_setting('transaction_isolation') transaction_isolation,
      current_setting('transaction_read_only') transaction_read_only, clock_timestamp() captured_at`), "transaction isolation");
    if (isolation.transaction_isolation !== "repeatable read" || isolation.transaction_read_only !== "on") fail("repeatable-read read-only transaction is required");
    const capturedAt = iso(isolation.captured_at, "captured_at");
    const scenario = one(await query(tx, "scenario", `SELECT s.session_id,s.id scenario_id,s.kind,s.report_id,s.order_id,s.pre_admission_job_id,
      s.core_job_id,s.enhancement_job_id,s.site_snapshot_id,s.config_snapshot_id,s.question_set_id,
      s.core_artifact_revision_id,s.enhancement_artifact_revision_id FROM report_v4_acceptance_scenarios s
      JOIN report_v4_acceptance_sessions session ON session.id=s.session_id WHERE s.session_id=$1 AND s.id=$2`,
      [parsed.sessionId, parsed.scenarioId]), "acceptance scenario");
    const binding = parseBinding(scenario, parsed);
    const report = one(await query(tx, "report", `SELECT id,site_key,report_locale,active_artifact_revision_id FROM scan_reports WHERE id=$1`, [binding.reportId]), "bound report");
    equal(report.id, binding.reportId, "report anchor");
    binding.activeArtifactRevisionId = nullableRequired(report.active_artifact_revision_id, "active_artifact_revision_id");
    const siteSnapshot = one(await query(tx, "site-snapshot", `SELECT id,report_id,site_key FROM report_v4_site_snapshots WHERE id=$1`, [binding.siteSnapshotId]), "bound site snapshot");
    equal(siteSnapshot.report_id,binding.reportId,"site snapshot report lineage");
    equal(siteSnapshot.site_key,report.site_key,"report/snapshot site lineage");
    const config = one(await query(tx, "config", `SELECT id,report_id,order_id,core_job_id FROM report_v4_config_snapshots WHERE report_id=$1`, [binding.reportId]), "bound config snapshot");
    equal(config.id, binding.configSnapshotId, "config snapshot anchor"); equal(config.report_id, binding.reportId, "config report lineage");
    equal(config.order_id, binding.orderId, "config order lineage"); equal(config.core_job_id, binding.coreJobId, "config core-job lineage");
    const questionSet = one(await query(tx, "question-set", `SELECT id,report_id,order_id FROM report_business_question_sets WHERE id=$1`, [binding.questionSetId]), "bound question set");
    equal(questionSet.report_id, binding.reportId, "question-set report lineage"); equal(questionSet.order_id, binding.orderId, "question-set order lineage");

    const orderRows = await query(tx, "orders", `SELECT id,provider,provider_checkout_id,provider_payment_id,report_id,site_key,site_snapshot_id,
      fulfillment_job_id,product_code,business_question_set_id,fulfillment_methodology,recommendation_report_version,catalog_version,
      terms_version,refund_policy_version,report_locale,currency,amount_minor,tax_amount_minor,payment_status,fulfillment_status,
      refund_status,delivery_status,courtesy_non_billable,paid_at,delivery_deadline_at,fulfilled_at,refunded_at FROM payment_orders
      WHERE report_id=$1 AND (fulfillment_methodology='two_stage_geo_report_v4' OR recommendation_report_version=4)`, [binding.reportId]);
    if (orderRows.length !== 1 || orderRows[0]!.id !== binding.orderId) fail("order scope must contain the exact bound V4 order");
    equal(orderRows[0]!.site_key,report.site_key,"report/order site lineage");
    equal(orderRows[0]!.report_locale,report.report_locale,"immutable report locale lineage");
    const jobRows = await query(tx, "jobs", `SELECT id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,
      recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,
      checkpoint_revision,phase_attempt,resume_generation,progress,planned_pages,successful_pages,failed_pages,attempts,max_attempts,
      error_code,public_error,credit_reservation_id FROM scan_jobs WHERE report_id=$1 AND
      (fulfillment_methodology='two_stage_geo_report_v4' OR recommendation_report_version=4 OR artifact_contract='combined_geo_report_v4')`, [binding.reportId]);
    exactIds(jobRows, [binding.preAdmissionJobId, binding.coreJobId, binding.enhancementJobId], "job");
    const dispatchRows = await query(tx, "dispatches", `SELECT d.id,d.job_id,d.tier,d.schema_version,d.state,d.attempts,d.published_at,d.last_error_code
      FROM job_dispatch_outbox d JOIN scan_jobs j ON j.id=d.job_id WHERE j.report_id=$1 AND
      (j.fulfillment_methodology='two_stage_geo_report_v4' OR j.recommendation_report_version=4 OR j.artifact_contract='combined_geo_report_v4')`, [binding.reportId]);
    exactIds(dispatchRows, jobRows.map((row) => required(row.id, "job id")), "dispatch", "job_id");
    for (const dispatch of dispatchRows) { const job = jobRows.find((row) => row.id === dispatch.job_id); if (!job || job.tier !== dispatch.tier) fail("dispatch tier does not match its scoped job"); }
    const artifactRows = await query(tx, "artifacts", `SELECT id,report_id,order_id,job_id,config_snapshot_id,correction_id,replacement_fulfillment_id,
      source_artifact_revision_id,revision_kind,revision,artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,
      (pdf_storage_key IS NOT NULL) pdf_storage_key_present,
      ready_at,activated_at FROM report_artifact_revisions WHERE report_id=$1 AND
      (artifact_contract='combined_geo_report_v4' OR revision_kind='diagnosis_enhancement')`, [binding.reportId]);
    exactIds(artifactRows, [binding.coreArtifactRevisionId, binding.enhancementArtifactRevisionId], "artifact");

    const paymentEventRows = await query(tx, "payment-events", `SELECT id,provider,provider_event_id,event_type,payload_hash,selected_fields,
      processing_status,order_id,provider_created_at,processed_at,error_code FROM payment_events WHERE order_id=$1`, [binding.orderId]);
    const accessKeyRows = await query(tx, "access-keys", `SELECT id,key_prefix,payment_order_id,status,credits_remaining,expires_at,revoked_at FROM access_keys WHERE payment_order_id=$1`, [binding.orderId]);
    const creditRows = await query(tx, "credits", `SELECT id,access_key_id,report_id,job_id,payment_order_id,idempotency_key,credits,status,reserved_at,settled_at,refunded_at FROM credit_ledger WHERE report_id=$1 OR payment_order_id=$2`, [binding.reportId, binding.orderId]);
    const refundRows = await query(tx, "refunds", `SELECT id,order_id,provider,provider_refund_id,reason,amount_minor,currency,state,idempotency_key,attempts,failure_code,submitted_at,succeeded_at FROM payment_refunds WHERE order_id=$1`, [binding.orderId]);
    const deliveryRows = await query(tx, "deliveries", `SELECT id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,provider_email_id,business_idempotency_key,state,attempts,failure_code,last_provider_event_at,sent_at,delivered_at FROM email_deliveries WHERE report_id=$1`, [binding.reportId]);
    const emailEventRows = await query(tx, "email-events", `SELECT e.id,e.provider_event_id,e.provider_email_id,e.delivery_id,e.provider,e.event_type,e.processing_status,e.payload_hash,e.provider_created_at,e.error_code FROM email_delivery_events e
      WHERE EXISTS (SELECT 1 FROM email_deliveries d WHERE d.report_id=$1 AND (e.delivery_id=d.id OR (e.delivery_id IS NULL AND e.provider_email_id=d.provider_email_id)))`, [binding.reportId]);
    validateEmailEventPairs(deliveryRows,emailEventRows);
    const tokenRows = await query(tx, "tokens", `SELECT id,report_id,token_prefix,artifact_scope,expires_at,last_used_at,revoked_at FROM report_access_tokens WHERE report_id=$1 AND artifact_scope='combined_geo_report_v4'`, [binding.reportId]);
    const questionRows = await query(tx, "question-checkpoints", `SELECT identity_hash,report_id,job_id,question_set_id,question_id,snapshot_id,ordinal,state,question_identity_hash,model_config_identity_hash,input_identity_hash,provider_call_count,answer_payload,source_payload,answer_content_hash FROM report_v4_question_checkpoints WHERE report_id=$1`, [binding.reportId]);
    const diagnosisRows = await query(tx, "diagnosis-checkpoints", `SELECT identity_hash,report_id,enhancement_job_id,core_artifact_revision_id,config_snapshot_id,question_set_id,question_id,snapshot_id,ordinal,state,input_identity_hash,diagnosis_input_payload,provider_call_count,source_audit_payload,diagnosis_payload,diagnosis_content_hash FROM report_v4_diagnosis_checkpoints WHERE report_id=$1`, [binding.reportId]);
    const terminalEventRows = await query(tx, "terminal-events", `SELECT operation,unit_id,attempt,phase,details FROM report_v4_acceptance_events
      WHERE session_id=$1 AND scenario_id=$2 AND kind='checkpoint_terminal'`, [parsed.sessionId, parsed.scenarioId]);
    validateTerminalEvents(questionRows, diagnosisRows, terminalEventRows);
    return project(parsed.phase, capturedAt, binding, { orderRows, paymentEventRows, jobRows, dispatchRows, accessKeyRows, creditRows, refundRows, deliveryRows, emailEventRows, tokenRows, artifactRows, questionRows, diagnosisRows });
  });
}

type Binding = { scenarioKind:"success"|"diagnosis_failure"|"question_failure"; reportId:string; orderId:string; preAdmissionJobId:string; coreJobId:string; enhancementJobId:string|null; siteSnapshotId:string; configSnapshotId:string; questionSetId:string; coreArtifactRevisionId:string; enhancementArtifactRevisionId:string|null; activeArtifactRevisionId:string|null };
type ProjectRows = { orderRows:Rows; paymentEventRows:Rows; jobRows:Rows; dispatchRows:Rows; accessKeyRows:Rows; creditRows:Rows; refundRows:Rows; deliveryRows:Rows; emailEventRows:Rows; tokenRows:Rows; artifactRows:Rows; questionRows:Rows; diagnosisRows:Rows };

function project(phase:"baseline"|"final", capturedAt:string, binding:Binding, rows:ProjectRows): ReportV4CommerceAuthoritySnapshot {
  const scope:ReportV4CommerceAuthorityScope = { reportIdHash:sha(binding.reportId), orderIdHash:sha(binding.orderId), siteSnapshotIdHash:sha(binding.siteSnapshotId), configSnapshotIdHash:sha(binding.configSnapshotId), questionSetIdHash:sha(binding.questionSetId), preAdmissionJobIdHash:sha(binding.preAdmissionJobId), coreJobIdHash:sha(binding.coreJobId), enhancementJobIdHash:nsha(binding.enhancementJobId), coreArtifactRevisionIdHash:sha(binding.coreArtifactRevisionId), enhancementArtifactRevisionIdHash:nsha(binding.enhancementArtifactRevisionId), activeArtifactRevisionIdHash:nsha(binding.activeArtifactRevisionId) };
  const orderInput=rows.orderRows.map(mapOrder), paymentEventInput=rows.paymentEventRows.map(mapPaymentEvent), jobInput=rows.jobRows.map(mapJob), dispatchInput=rows.dispatchRows.map(mapDispatch);
  const creditInput={accessKeys:rows.accessKeyRows.map(mapAccessKey),creditLedger:rows.creditRows.map(mapCredit),refunds:rows.refundRows.map(mapRefund)};
  const emailInput={deliveries:rows.deliveryRows.map(mapDelivery),events:rows.emailEventRows.map(mapEmailEvent)};
  const tokenInput=rows.tokenRows.map(mapToken), artifactInput=rows.artifactRows.map(mapArtifact), questionInput=rows.questionRows.map(mapQuestionCheckpoint), diagnosisInput=rows.diagnosisRows.map(mapDiagnosisCheckpoint);
  const authority={phase,capturedAt,scope,orders:orderInput,paymentEvents:paymentEventInput,jobs:jobInput,dispatches:dispatchInput,creditAuthority:creditInput,emailAuthority:emailInput,accessTokens:tokenInput,artifacts:artifactInput,questionCheckpoints:questionInput,diagnosisCheckpoints:diagnosisInput};
  return { phase,scenarioKind:binding.scenarioKind,capturedAt,scope,orders:normalizeReportV4CommerceOrders(orderInput),paymentEvents:normalizeReportV4PaymentEvents(paymentEventInput),jobs:normalizeReportV4CommerceJobs(jobInput),dispatches:normalizeReportV4CommerceDispatches(dispatchInput),creditAuthority:normalizeReportV4CommerceCreditAuthority(creditInput),emailAuthority:normalizeReportV4CommerceEmailAuthority(emailInput),accessTokens:normalizeReportV4AccessTokens(tokenInput),artifacts:normalizeReportV4ArtifactRevisions(artifactInput),questionCheckpoints:normalizeReportV4QuestionCheckpointAuthorities(questionInput),diagnosisCheckpoints:normalizeReportV4DiagnosisCheckpointAuthorities(diagnosisInput),fingerprint:fingerprintReportV4CommerceAuthority(authority),transactionProfile:{isolation:"repeatable read",readOnly:true} };
}

function validateTerminalEvents(questionRows:Rows,diagnosisRows:Rows,eventRows:Rows):void {
  const expected=[...questionRows.map((row)=>({operation:"question_answer",unitId:required(row.identity_hash,"identity_hash"),state:row.state,hash:computeReportV4QuestionTerminalCheckpointFingerprint({identityHash:row.identity_hash,reportId:row.report_id,jobId:row.job_id,questionSetId:row.question_set_id,questionId:row.question_id,snapshotId:row.snapshot_id,ordinal:row.ordinal,state:row.state,questionIdentityHash:row.question_identity_hash,modelConfigIdentityHash:row.model_config_identity_hash,inputIdentityHash:row.input_identity_hash,providerCallCount:row.provider_call_count,answerPayload:row.answer_payload,sourcePayload:row.source_payload,answerContentHash:row.answer_content_hash} as ReportV4QuestionCheckpoint)})),...diagnosisRows.map((row)=>({operation:"source_diagnosis",unitId:required(row.identity_hash,"identity_hash"),state:row.state,hash:computeReportV4DiagnosisTerminalCheckpointFingerprint({identityHash:row.identity_hash,reportId:row.report_id,enhancementJobId:row.enhancement_job_id,coreArtifactRevisionId:row.core_artifact_revision_id,configSnapshotId:row.config_snapshot_id,questionSetId:row.question_set_id,questionId:row.question_id,snapshotId:row.snapshot_id,ordinal:row.ordinal,state:row.state,inputIdentityHash:row.input_identity_hash,diagnosisInput:row.diagnosis_input_payload,providerCallCount:row.provider_call_count,sourceAudits:row.source_audit_payload,diagnosis:row.diagnosis_payload,diagnosisContentHash:row.diagnosis_content_hash} as ReportV4DiagnosisCheckpoint)}))];
  if(eventRows.length!==expected.length)fail("checkpoint terminal event count mismatch");
  for(const item of expected){const matches=eventRows.filter((row)=>row.operation===item.operation&&row.unit_id===item.unitId&&row.attempt===0&&row.phase==="observed");if(matches.length!==1)fail("checkpoint terminal event lineage mismatch");const details=asRow(matches[0]!.details,"checkpoint terminal details");if(details.checkpointHash!==item.hash||details.state!==item.state)fail("checkpoint terminal event state or fingerprint mismatch");}
}

function validateEmailEventPairs(deliveries:Rows,events:Rows):void {
  for(const event of events){
    const deliveryId=nullableRequired(event.delivery_id,"email event delivery_id");
    const matches=deliveries.filter((delivery)=>deliveryId===null
      ? delivery.provider===event.provider&&delivery.provider_email_id===event.provider_email_id
      : delivery.id===deliveryId);
    if(matches.length!==1)fail("email event must identify exactly one scoped delivery pair");
    const delivery=matches[0]!;
    if(delivery.provider!==event.provider||delivery.provider_email_id!==event.provider_email_id)fail("email event provider pair does not match its scoped delivery");
  }
}

function mapOrder(r:Row):Row { return { idHash:sha(r.id),provider:r.provider,providerCheckoutIdHash:nsha(r.provider_checkout_id),providerPaymentIdHash:nsha(r.provider_payment_id),reportIdHash:sha(r.report_id),siteKeyHash:sha(r.site_key),siteSnapshotIdHash:nsha(r.site_snapshot_id),fulfillmentJobIdHash:nsha(r.fulfillment_job_id),productCode:r.product_code,businessQuestionSetIdHash:nsha(r.business_question_set_id),fulfillmentMethodology:r.fulfillment_methodology,recommendationReportVersion:r.recommendation_report_version,catalogVersion:safeCode(r.catalog_version,"catalog_version"),termsVersion:safeCode(r.terms_version,"terms_version"),refundPolicyVersion:safeCode(r.refund_policy_version,"refund_policy_version"),reportLocale:r.report_locale,currency:r.currency,amountMinor:r.amount_minor,taxAmountMinor:r.tax_amount_minor,paymentStatus:r.payment_status,fulfillmentStatus:r.fulfillment_status,refundStatus:r.refund_status,deliveryStatus:r.delivery_status,courtesyNonBillable:r.courtesy_non_billable,paidAt:niso(r.paid_at),fulfillmentDeadlineAt:niso(r.delivery_deadline_at),fulfilledAt:niso(r.fulfilled_at),refundedAt:niso(r.refunded_at) }; }
function mapPaymentEvent(r:Row):Row { return { idHash:sha(r.id),provider:r.provider,providerEventIdHash:sha(r.provider_event_id),eventType:safeCode(r.event_type,"payment event_type"),payloadHash:r.payload_hash,selectedFieldsHash:sha(stableJson(r.selected_fields)),processingStatus:r.processing_status,orderIdHash:nsha(r.order_id),providerCreatedAt:niso(r.provider_created_at),processedAt:niso(r.processed_at),errorCode:nullableSafeCode(r.error_code,"payment error_code") }; }
function mapJob(r:Row):Row { return { id:r.id,reportId:r.report_id,siteSnapshotId:r.site_snapshot_id,tier:r.tier,productContract:r.product_contract,fulfillmentMethodology:r.fulfillment_methodology,recommendationReportVersion:r.recommendation_report_version,artifactContract:r.artifact_contract,businessQuestionSetId:r.business_question_set_id,locale:r.locale,reason:r.reason,stage:r.stage,executionState:r.execution_state,currentPhase:r.current_phase,checkpointRevision:r.checkpoint_revision,phaseAttempt:r.phase_attempt,resumeGeneration:r.resume_generation,progress:r.progress,plannedPages:r.planned_pages,successfulPages:r.successful_pages,failedPages:r.failed_pages,attempts:r.attempts,maxAttempts:r.max_attempts,errorCode:nullableSafeCode(r.error_code,"job error_code"),publicError:r.public_error===null?null:sha(required(r.public_error,"public_error")),creditReservationId:r.credit_reservation_id }; }
function mapDispatch(r:Row):Row { return { id:r.id,jobId:r.job_id,tier:r.tier,schemaVersion:r.schema_version,state:r.state,attempts:r.attempts,publishedAt:niso(r.published_at),lastErrorCode:nullableSafeCode(r.last_error_code,"dispatch last_error_code") }; }
function mapAccessKey(r:Row):Row { return { idHash:sha(r.id),keyPrefixHash:sha(r.key_prefix),paymentOrderIdHash:nsha(r.payment_order_id),status:r.status,creditsRemaining:r.credits_remaining,expiresAt:niso(r.expires_at),revokedAt:niso(r.revoked_at) }; }
function mapCredit(r:Row):Row { return { idHash:sha(r.id),accessKeyIdHash:sha(r.access_key_id),reportIdHash:sha(r.report_id),jobIdHash:nsha(r.job_id),paymentOrderIdHash:nsha(r.payment_order_id),idempotencyKeyHash:sha(r.idempotency_key),credits:r.credits,status:r.status,reservedAt:iso(r.reserved_at,"reserved_at"),settledAt:niso(r.settled_at),refundedAt:niso(r.refunded_at) }; }
function mapRefund(r:Row):Row { return { idHash:sha(r.id),orderIdHash:sha(r.order_id),provider:r.provider,providerRefundIdHash:nsha(r.provider_refund_id),reason:r.reason,amountMinor:r.amount_minor,currency:r.currency,state:r.state,idempotencyKeyHash:sha(r.idempotency_key),attempts:r.attempts,failureCode:nullableSafeCode(r.failure_code,"refund failure_code"),submittedAt:niso(r.submitted_at),succeededAt:niso(r.succeeded_at) }; }
function mapDelivery(r:Row):Row { return { idHash:sha(r.id),orderIdHash:nsha(r.order_id),reportIdHash:sha(r.report_id),templateType:r.template_type,templateVersion:safeCode(r.template_version,"template_version"),locale:r.locale,recipientRefHash:sha(r.recipient_ref),provider:r.provider,providerEmailIdHash:nsha(r.provider_email_id),businessIdempotencyKeyHash:sha(r.business_idempotency_key),state:r.state,attempts:r.attempts,failureCode:nullableSafeCode(r.failure_code,"delivery failure_code"),lastProviderEventAt:niso(r.last_provider_event_at),sentAt:niso(r.sent_at),deliveredAt:niso(r.delivered_at) }; }
function mapEmailEvent(r:Row):Row { return { idHash:sha(r.id),providerEventIdHash:sha(r.provider_event_id),providerEmailIdHash:sha(r.provider_email_id),deliveryIdHash:nsha(r.delivery_id),provider:r.provider,eventType:safeCode(r.event_type,"email event_type"),processingStatus:r.processing_status,payloadHash:r.payload_hash,providerCreatedAt:niso(r.provider_created_at),errorCode:nullableSafeCode(r.error_code,"email error_code") }; }
function mapToken(r:Row):Row { return { idHash:sha(r.id),reportIdHash:sha(r.report_id),tokenPrefixHash:sha(r.token_prefix),artifactScope:r.artifact_scope,expiresAt:iso(r.expires_at,"expires_at"),lastUsedAt:niso(r.last_used_at),revokedAt:niso(r.revoked_at) }; }
function mapArtifact(r:Row):Row { return { idHash:sha(r.id),reportIdHash:sha(r.report_id),orderIdHash:sha(r.order_id),jobIdHash:sha(r.job_id),configSnapshotIdHash:sha(r.config_snapshot_id),correctionIdHash:nsha(r.correction_id),replacementFulfillmentIdHash:nsha(r.replacement_fulfillment_id),sourceArtifactRevisionIdHash:nsha(r.source_artifact_revision_id),revisionKind:r.revision_kind,revision:r.revision,artifactContract:r.artifact_contract,status:r.status,payloadIdentityHash:r.payload_identity_hash,htmlSha256:r.html_sha256,pdfSha256:r.pdf_sha256,pdfStorageKeyPresent:boolean(r.pdf_storage_key_present,"pdf_storage_key_present"),readyAt:niso(r.ready_at),activatedAt:niso(r.activated_at) }; }

function mapQuestionCheckpoint(r:Row):Row {
  const checkpoint={identityHash:r.identity_hash,reportId:r.report_id,jobId:r.job_id,questionSetId:r.question_set_id,questionId:r.question_id,snapshotId:r.snapshot_id,ordinal:r.ordinal,state:r.state,questionIdentityHash:r.question_identity_hash,modelConfigIdentityHash:r.model_config_identity_hash,inputIdentityHash:r.input_identity_hash,providerCallCount:r.provider_call_count,answerPayload:r.answer_payload,sourcePayload:r.source_payload,answerContentHash:r.answer_content_hash} as ReportV4QuestionCheckpoint;
  return {identityHash:r.identity_hash,reportIdHash:sha(r.report_id),jobIdHash:sha(r.job_id),questionSetIdHash:sha(r.question_set_id),questionIdHash:sha(r.question_id),snapshotIdHash:sha(r.snapshot_id),ordinal:r.ordinal,state:r.state,questionIdentityHash:r.question_identity_hash,modelConfigIdentityHash:r.model_config_identity_hash,inputIdentityHash:r.input_identity_hash,providerCallCount:r.provider_call_count,sourcePayloadHash:sha(stableJson(r.source_payload)),sourceCount:arrayLength(r.source_payload,"source_payload"),answerContentHash:r.answer_content_hash,terminalFingerprint:computeReportV4QuestionTerminalCheckpointFingerprint(checkpoint)};
}
function mapDiagnosisCheckpoint(r:Row):Row {
  const checkpoint={identityHash:r.identity_hash,reportId:r.report_id,enhancementJobId:r.enhancement_job_id,coreArtifactRevisionId:r.core_artifact_revision_id,configSnapshotId:r.config_snapshot_id,questionSetId:r.question_set_id,questionId:r.question_id,snapshotId:r.snapshot_id,ordinal:r.ordinal,state:r.state,inputIdentityHash:r.input_identity_hash,diagnosisInput:r.diagnosis_input_payload,providerCallCount:r.provider_call_count,sourceAudits:r.source_audit_payload,diagnosis:r.diagnosis_payload,diagnosisContentHash:r.diagnosis_content_hash} as ReportV4DiagnosisCheckpoint;
  return {identityHash:r.identity_hash,reportIdHash:sha(r.report_id),enhancementJobIdHash:sha(r.enhancement_job_id),coreArtifactRevisionIdHash:sha(r.core_artifact_revision_id),configSnapshotIdHash:sha(r.config_snapshot_id),questionSetIdHash:sha(r.question_set_id),questionIdHash:sha(r.question_id),snapshotIdHash:sha(r.snapshot_id),ordinal:r.ordinal,state:r.state,inputIdentityHash:r.input_identity_hash,providerCallCount:r.provider_call_count,sourceAuditPayloadHash:sha(stableJson(r.source_audit_payload)),sourceAuditCount:arrayLength(r.source_audit_payload,"source_audit_payload"),diagnosisContentHash:r.diagnosis_content_hash,terminalFingerprint:computeReportV4DiagnosisTerminalCheckpointFingerprint(checkpoint)};
}

async function query(tx:QuerySql,label:string,statement:string,parameters:unknown[]=[]):Promise<Rows>{return tx.unsafe(`/* authority:${label} */ ${statement}`,parameters);}
function parseInput(input:LoadReportV4CommerceAuthoritySnapshotInput):LoadReportV4CommerceAuthoritySnapshotInput { if(!input||typeof input!=="object"||Object.keys(input).sort().join()!=="phase,scenarioId,sessionId")fail("snapshot input fields are invalid"); if(!UUID.test(input.sessionId)||!UUID.test(input.scenarioId))fail("sessionId and scenarioId must be lowercase UUIDs"); if(input.phase!=="baseline"&&input.phase!=="final")fail("phase must be baseline or final"); return input; }
function parseBinding(row:Row,input:LoadReportV4CommerceAuthoritySnapshotInput):Binding { equal(row.session_id,input.sessionId,"scenario session");equal(row.scenario_id,input.scenarioId,"scenario identity");return{scenarioKind:scenarioKind(row.kind),reportId:required(row.report_id,"report_id"),orderId:required(row.order_id,"order_id"),preAdmissionJobId:required(row.pre_admission_job_id,"pre_admission_job_id"),coreJobId:required(row.core_job_id,"core_job_id"),enhancementJobId:nullableRequired(row.enhancement_job_id,"enhancement_job_id"),siteSnapshotId:required(row.site_snapshot_id,"site_snapshot_id"),configSnapshotId:required(row.config_snapshot_id,"config_snapshot_id"),questionSetId:required(row.question_set_id,"question_set_id"),coreArtifactRevisionId:required(row.core_artifact_revision_id,"core_artifact_revision_id"),enhancementArtifactRevisionId:nullableRequired(row.enhancement_artifact_revision_id,"enhancement_artifact_revision_id"),activeArtifactRevisionId:null}; }
function exactIds(rows:Rows,expected:Array<string|null>,label:string,field="id"):void{const wanted=expected.filter((value):value is string=>value!==null).sort(),actual=rows.map((row)=>required(row[field],`${label} ${field}`)).sort();if(new Set(actual).size!==actual.length||stableJson(actual)!==stableJson(wanted))fail(`${label} scope must contain every and only the bound rows`);}
function one(rows:Rows,label:string):Row{if(rows.length!==1)fail(`${label} must contain exactly one row`);return rows[0]!;}
function equal(actual:unknown,expected:unknown,label:string):void{if(actual!==expected)fail(`${label} mismatch`);}
function required(value:unknown,label:string):string{if(typeof value!=="string"||!value||value.trim()!==value)fail(`${label} is invalid`);return value;}
function nullableRequired(value:unknown,label:string):string|null{return value===null?null:required(value,label);}
function safeCode(value:unknown,label:string):string{const text=required(value,label);if(!/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(text))fail(`${label} must be a safe identifier`);return text;}
function nullableSafeCode(value:unknown,label:string):string|null{return value===null?null:safeCode(value,label);}
function scenarioKind(value:unknown):Binding["scenarioKind"]{if(value!=="success"&&value!=="diagnosis_failure"&&value!=="question_failure")fail("scenario kind is invalid");return value;}
function boolean(value:unknown,label:string):boolean{if(typeof value!=="boolean")fail(`${label} must be boolean`);return value;}
function sha(value:unknown):string{return createHash("sha256").update(required(value,"hash source")).digest("hex");}
function nsha(value:unknown):string|null{return value===null?null:sha(value);}
function iso(value:unknown,label:string):string{const date=value instanceof Date?value:new Date(required(value,label));if(!Number.isFinite(date.getTime()))fail(`${label} is invalid`);return date.toISOString();}
function niso(value:unknown):string|null{return value===null?null:iso(value,"timestamp");}
function arrayLength(value:unknown,label:string):number{if(!Array.isArray(value))fail(`${label} must be an array`);return value.length;}
function asRow(value:unknown,label:string):Row{if(!value||typeof value!=="object"||Array.isArray(value))fail(`${label} must be an object`);return value as Row;}
function stableJson(value:unknown):string{if(value===null||typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);if(typeof value==="number"&&Number.isFinite(value))return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stableJson).join(",")}]`;if(value&&typeof value==="object")return`{${Object.entries(value as Row).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>`${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;fail("canonical JSON contains an unsupported value");}
function fail(message:string):never{throw new Error(`Report V4 commerce authority snapshot: ${message}`);}
