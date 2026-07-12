import { pathToFileURL } from "node:url";
import { closeDatabase, ensureDatabase, getSqlClient } from "../db";
import type { RecommendationFulfillmentMethodology, RecommendationReportVersion } from "../db/schema";

export interface RecommendationMethodologyAuditRow {
  kind: "order" | "job";
  id: string;
  state: string;
  methodology: RecommendationFulfillmentMethodology | null;
  reportVersion: RecommendationReportVersion | null;
  pairedMethodology?: RecommendationFulfillmentMethodology | null;
  pairedReportVersion?: RecommendationReportVersion | null;
}

export function summarizeRecommendationMethodologyAudit(rows: RecommendationMethodologyAuditRow[]): {
  exitCode: 0 | 1;
  output: string;
} {
  const invalid = rows.filter((row) =>
    !((row.methodology === "answer_engine_recommendation_forensics_v1" && row.reportVersion === 1) ||
      (row.methodology === "public_search_source_forensics_v1" && row.reportVersion === 2)) ||
    (row.pairedMethodology !== undefined &&
      (row.pairedMethodology !== row.methodology || row.pairedReportVersion !== row.reportVersion)));
  const v1Count = rows.filter((row) => row.methodology === "answer_engine_recommendation_forensics_v1").length;
  const lines = rows.map((row) =>
    `${row.kind}=${row.id} state=${row.state} methodology=${row.methodology ?? "missing"} report_version=${row.reportVersion ?? "missing"}` +
    (row.pairedMethodology === undefined ? "" : ` paired_methodology=${row.pairedMethodology ?? "missing"} paired_report_version=${row.pairedReportVersion ?? "missing"}`) +
    ` drain_decision=${row.methodology === "answer_engine_recommendation_forensics_v1"
      ? "continue_with_retained_v1_credentials"
      : row.methodology === "public_search_source_forensics_v1" ? "v2_not_part_of_v1_drain" : "terminalize_refund_invalid_row"}`
  );
  if (invalid.length > 0) {
    return { exitCode: 1, output: [`Recommendation methodology audit failed: ${invalid.length} invalid non-terminal row(s).`, ...lines].join("\n") + "\n" };
  }
  return { exitCode: 0, output: [`Recommendation methodology audit passed: ${rows.length} non-terminal recommendation row(s); ${v1Count} V1 row(s) require retained OpenAI/Perplexity adapters and credentials until zero-nonterminal drain.`, ...lines].join("\n") + "\n" };
}

export async function runRecommendationMethodologyAudit(): Promise<number> {
  try {
    await ensureDatabase();
    const sql = getSqlClient();
    const orders = await sql<Array<{ id: string; state: string; methodology: RecommendationFulfillmentMethodology | null; report_version: RecommendationReportVersion | null; job_id: string | null; paired_methodology: RecommendationFulfillmentMethodology | null; paired_report_version: RecommendationReportVersion | null }>>`
      SELECT orders.id, orders.fulfillment_status AS state, orders.fulfillment_job_id AS job_id,
             orders.fulfillment_methodology AS methodology,
             orders.recommendation_report_version AS report_version,
             jobs.fulfillment_methodology AS paired_methodology,
             jobs.recommendation_report_version AS paired_report_version
      FROM payment_orders orders
      LEFT JOIN scan_jobs jobs ON jobs.id = orders.fulfillment_job_id
      WHERE orders.product_code = 'recommendation_forensics_v1'
        AND orders.fulfillment_status NOT IN ('completed','completed_limited','failed')
      ORDER BY orders.created_at, orders.id
    `;
    const jobs = await sql<Array<{ id: string; state: string; methodology: RecommendationFulfillmentMethodology | null; report_version: RecommendationReportVersion | null; paired_order_id: string | null; paired_methodology: RecommendationFulfillmentMethodology | null; paired_report_version: RecommendationReportVersion | null }>>`
      SELECT jobs.id, jobs.stage AS state, jobs.fulfillment_methodology AS methodology,
             jobs.recommendation_report_version AS report_version,
             orders.id AS paired_order_id,
             orders.fulfillment_methodology AS paired_methodology,
             orders.recommendation_report_version AS paired_report_version
      FROM scan_jobs jobs
      LEFT JOIN payment_orders orders ON orders.fulfillment_job_id = jobs.id
      WHERE jobs.product_contract = 'recommendation_forensics_v1'
        AND jobs.stage NOT IN ('completed','completed_limited','failed')
        AND NOT EXISTS (
          SELECT 1 FROM payment_orders active_orders
          WHERE active_orders.fulfillment_job_id = jobs.id
            AND active_orders.fulfillment_status NOT IN ('completed','completed_limited','failed')
        )
      ORDER BY jobs.created_at, jobs.id
    `;
    const result = summarizeRecommendationMethodologyAudit([
      ...orders.map((row) => ({ kind: "order" as const, id: row.id, state: row.state, methodology: row.methodology, reportVersion: row.report_version,
        ...(row.job_id ? { pairedMethodology: row.paired_methodology, pairedReportVersion: row.paired_report_version } : {}) })),
      ...jobs.map((row) => ({ kind: "job" as const, id: row.id, state: row.state, methodology: row.methodology, reportVersion: row.report_version,
        ...(row.paired_order_id ? { pairedMethodology: row.paired_methodology, pairedReportVersion: row.paired_report_version } : {}) }))
    ]);
    (result.exitCode === 0 ? process.stdout : process.stderr).write(result.output);
    return result.exitCode;
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runRecommendationMethodologyAudit();
}
