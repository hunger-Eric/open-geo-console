import {
  FINDING_MESSAGE_CATALOG,
  renderFindingMessage,
  type FindingMessageKey,
  type FindingMessageParams,
  type FindingSeverity,
  type GeoAuditReport,
  type GeoFinding
} from "@open-geo-console/geo-auditor";

export type ReportSectionId =
  | "executiveSummary"
  | "findings"
  | "machineReadableAssets"
  | "auditedPages"
  | "crawlerAccessNextStep"
  | "technicalAppendix";

export type ReportCompositionBoundaryId =
  | "collectEvidence"
  | "classifyFindings"
  | "composeNarrative"
  | "renderDelivery";

export interface ReportSectionDefinition {
  id: ReportSectionId;
  labelKey: string;
  compositionBoundary: ReportCompositionBoundaryId;
  requiredData: Array<keyof GeoAuditReport>;
}

export interface ReportCompositionBoundary {
  id: ReportCompositionBoundaryId;
  inputKey: string;
  outputKey: string;
  llmReplaceable: boolean;
}

export interface FindingCopy {
  title: string;
  description: string;
  recommendation: string;
  messageKey?: FindingMessageKey;
  params: FindingMessageParams;
  source: "messageKey" | "legacy";
}

export interface ComposedReportFinding {
  finding: GeoFinding;
  copy: FindingCopy;
}

export interface ComposedReportModel {
  report: GeoAuditReport;
  sections: readonly ReportSectionDefinition[];
  compositionBoundaries: readonly ReportCompositionBoundary[];
  severityCounts: Record<FindingSeverity, number>;
  findingsBySeverity: Record<FindingSeverity, ComposedReportFinding[]>;
}

export const REPORT_SECTION_REGISTRY = [
  {
    id: "executiveSummary",
    labelKey: "report.sections.executiveSummary",
    compositionBoundary: "composeNarrative",
    requiredData: ["score", "findings", "recommendations"]
  },
  {
    id: "findings",
    labelKey: "report.sections.findings",
    compositionBoundary: "classifyFindings",
    requiredData: ["findings"]
  },
  {
    id: "machineReadableAssets",
    labelKey: "report.sections.machineReadableAssets",
    compositionBoundary: "collectEvidence",
    requiredData: ["machineReadableAssets"]
  },
  {
    id: "auditedPages",
    labelKey: "report.sections.auditedPages",
    compositionBoundary: "collectEvidence",
    requiredData: ["pages"]
  },
  {
    id: "crawlerAccessNextStep",
    labelKey: "report.sections.crawlerAccessNextStep",
    compositionBoundary: "renderDelivery",
    requiredData: ["url"]
  },
  {
    id: "technicalAppendix",
    labelKey: "report.sections.technicalAppendix",
    compositionBoundary: "renderDelivery",
    requiredData: ["pages", "machineReadableAssets"]
  }
] as const satisfies readonly ReportSectionDefinition[];

export const REPORT_COMPOSITION_BOUNDARIES = [
  {
    id: "collectEvidence",
    inputKey: "agent.inputs.urlAndFetchResults",
    outputKey: "agent.outputs.auditEvidence",
    llmReplaceable: false
  },
  {
    id: "classifyFindings",
    inputKey: "agent.inputs.auditEvidence",
    outputKey: "agent.outputs.keyedFindings",
    llmReplaceable: false
  },
  {
    id: "composeNarrative",
    inputKey: "agent.inputs.keyedFindings",
    outputKey: "agent.outputs.executiveNarrative",
    llmReplaceable: true
  },
  {
    id: "renderDelivery",
    inputKey: "agent.inputs.localizedReportModel",
    outputKey: "agent.outputs.reportDelivery",
    llmReplaceable: false
  }
] as const satisfies readonly ReportCompositionBoundary[];

export function composeReportModel(report: GeoAuditReport): ComposedReportModel {
  const findingsBySeverity = groupFindingsBySeverity(report.findings);

  return {
    report,
    sections: REPORT_SECTION_REGISTRY,
    compositionBoundaries: REPORT_COMPOSITION_BOUNDARIES,
    severityCounts: {
      critical: findingsBySeverity.critical.length,
      warning: findingsBySeverity.warning.length,
      info: findingsBySeverity.info.length
    },
    findingsBySeverity
  };
}

export function resolveFindingCopy(finding: GeoFinding): FindingCopy {
  if (finding.messageKey && hasFindingMessageKey(finding.messageKey)) {
    const params = finding.params ?? {};

    return {
      title: renderFindingMessage(finding.messageKey, "title", params),
      description: renderFindingMessage(finding.messageKey, "description", params),
      recommendation: renderFindingMessage(finding.messageKey, "recommendation", params),
      messageKey: finding.messageKey,
      params,
      source: "messageKey"
    };
  }

  return {
    title: finding.title,
    description: finding.description,
    recommendation: finding.recommendation,
    params: finding.params ?? {},
    source: "legacy"
  };
}

function groupFindingsBySeverity(
  findings: GeoFinding[]
): Record<FindingSeverity, ComposedReportFinding[]> {
  return findings.reduce<Record<FindingSeverity, ComposedReportFinding[]>>(
    (groups, finding) => {
      groups[finding.severity].push({
        finding,
        copy: resolveFindingCopy(finding)
      });
      return groups;
    },
    {
      critical: [],
      warning: [],
      info: []
    }
  );
}

function hasFindingMessageKey(value: string): value is FindingMessageKey {
  return value in FINDING_MESSAGE_CATALOG;
}
