export const AI_WEBSITE_REPORT_VERSION = 1 as const;
export const AI_REPORT_PROMPT_VERSION = "ai-website-report-v1" as const;

export type ReportTier = "free" | "deep";

export const REPORT_TIER_LIMITS: Readonly<Record<ReportTier, number>> = {
  free: 1,
  deep: 50
};

export type Confidence = "low" | "medium" | "high";
export type FindingSeverity = "critical" | "warning" | "opportunity";
export type PageType =
  | "home"
  | "product"
  | "service"
  | "about"
  | "pricing"
  | "case-study"
  | "contact"
  | "blog"
  | "news"
  | "documentation"
  | "legal"
  | "other";

export type DimensionKey =
  | "organizationClarity"
  | "informationArchitecture"
  | "contentCitability"
  | "trustEvidence"
  | "entityConsistency"
  | "geoUnderstandability";

export interface EvidenceCitation {
  url: string;
  quote: string;
  pageElement?: string;
}

export interface OrganizationProfile {
  organizationName: string | null;
  brandNames: string[];
  summary: string;
  businessModel: string | null;
  productsAndServices: string[];
  targetAudiences: string[];
  marketsAndRegions: string[];
  legalEntity: string | null;
  identityConsistency: string;
  ownershipVerification: "not-performed";
  confidence: Confidence;
  evidence: EvidenceCitation[];
}

export interface ExecutiveSummary {
  overview: string;
  strengths: string[];
  keyRisks: string[];
  topPriorities: string[];
}

export interface DimensionScore {
  dimension: DimensionKey;
  score: number;
  explanation: string;
  confidence: Confidence;
  evidence: EvidenceCitation[];
}

export interface PageTypeAnalysis {
  pageType: PageType;
  sampledUrls: string[];
  strengths: string[];
  commonIssues: string[];
  recommendations: string[];
  evidence: EvidenceCitation[];
}

export interface AiFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  impact: string;
  evidence: EvidenceCitation[];
  pageElement?: string;
  recommendation: string;
  rewriteExample?: string;
  confidence: Confidence;
}

export interface RoadmapItem {
  title: string;
  rationale: string;
  actions: string[];
  relatedFindingIds: string[];
}

export interface ReportRoadmap {
  immediate: RoadmapItem[];
  nextPhase: RoadmapItem[];
  ongoing: RoadmapItem[];
}

export interface ReportCoverage {
  discoveredPages: number;
  plannedPages: number;
  analyzedPages: number;
  failedPages: number;
  samplingMethod: string;
  pageTypesCovered: PageType[];
  limitations: string[];
}

export interface ReportProvenance {
  reportVersion: typeof AI_WEBSITE_REPORT_VERSION;
  modelId: string;
  promptVersion: string;
  locale: string;
  generatedAt: string;
  contentHash: string;
}

export interface AiWebsiteReportV1 {
  version: typeof AI_WEBSITE_REPORT_VERSION;
  tier: ReportTier;
  targetUrl: string;
  organizationProfile: OrganizationProfile;
  executiveSummary: ExecutiveSummary;
  dimensionScores: DimensionScore[];
  pageTypeAnalyses: PageTypeAnalysis[];
  findings: AiFinding[];
  roadmap: ReportRoadmap;
  coverage: ReportCoverage;
  provenance: ReportProvenance;
}

export interface PageCandidate {
  url: string;
  title?: string;
  description?: string;
  lastModified?: string;
  pageType?: PageType;
  textPreview?: string;
}

export interface PlannedPage {
  url: string;
  pageType: PageType;
  priority: number;
  reason: string;
}

export interface PagePlan {
  tier: ReportTier;
  selected: PlannedPage[];
  modelId: string;
  fallbackUsed: boolean;
}

export interface ExtractedPage {
  url: string;
  pageType: PageType;
  title?: string;
  description?: string;
  text: string;
  metadata?: Record<string, string | string[]>;
}

export interface PageAnalysisFinding {
  title: string;
  severity: FindingSeverity;
  impact: string;
  evidence: EvidenceCitation[];
  recommendation: string;
  rewriteExample?: string;
  confidence: Confidence;
}

export interface PageAnalysis {
  url: string;
  pageType: PageType;
  summary: string;
  organizationSignals: string[];
  strengths: string[];
  findings: PageAnalysisFinding[];
}

export interface PageAnalysisBatch {
  analyses: PageAnalysis[];
  modelId: string;
}

export interface ReportSynthesisInput {
  targetUrl: string;
  tier: ReportTier;
  locale: string;
  organizationHints?: string[];
  pages: ExtractedPage[];
  pageAnalyses: PageAnalysis[];
  coverage: ReportCoverage;
  generatedAt?: string;
}
