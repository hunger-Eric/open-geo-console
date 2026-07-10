import type {
  AiWebsiteReportV1,
  EvidenceCitation,
  ExtractedPage
} from "./types";

export interface EvidenceValidationResult {
  valid: boolean;
  reason?: "unknown-url" | "quote-not-found" | "invalid-url";
}

export interface RejectedEvidence {
  citation: EvidenceCitation;
  location: string;
  reason: NonNullable<EvidenceValidationResult["reason"]>;
}

export interface VerifiedReportEvidence {
  report: AiWebsiteReportV1;
  rejectedFindingIds: string[];
  rejectedEvidence: RejectedEvidence[];
}

function normalizedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function validateEvidenceCitation(
  citation: EvidenceCitation,
  pages: readonly ExtractedPage[]
): EvidenceValidationResult {
  const citationUrl = normalizedUrl(citation.url);
  if (!citationUrl) return { valid: false, reason: "invalid-url" };
  const page = pages.find((candidate) => normalizedUrl(candidate.url) === citationUrl);
  if (!page) return { valid: false, reason: "unknown-url" };

  const quote = normalizeComparableText(citation.quote);
  if (!quote || !normalizeComparableText(page.text).includes(quote)) {
    return { valid: false, reason: "quote-not-found" };
  }
  return { valid: true };
}

export function verifyReportEvidence(
  report: AiWebsiteReportV1,
  pages: readonly ExtractedPage[]
): VerifiedReportEvidence {
  const rejectedEvidence: RejectedEvidence[] = [];

  const filter = (evidence: EvidenceCitation[], location: string): EvidenceCitation[] =>
    evidence.filter((citation, index) => {
      const result = validateEvidenceCitation(citation, pages);
      if (!result.valid && result.reason) {
        rejectedEvidence.push({ citation, location: `${location}[${index}]`, reason: result.reason });
      }
      return result.valid;
    });

  const rejectedFindingIds: string[] = [];
  const findings = report.findings.filter((finding, index) => {
    const verified = filter(finding.evidence, `findings[${index}].evidence`);
    const allEvidenceVerified = verified.length > 0 && verified.length === finding.evidence.length;
    if (!allEvidenceVerified) rejectedFindingIds.push(finding.id);
    return allEvidenceVerified;
  });

  return {
    report: {
      ...report,
      organizationProfile: {
        ...report.organizationProfile,
        evidence: filter(report.organizationProfile.evidence, "organizationProfile.evidence")
      },
      dimensionScores: report.dimensionScores.map((dimension, index) => ({
        ...dimension,
        evidence: filter(dimension.evidence, `dimensionScores[${index}].evidence`)
      })),
      pageTypeAnalyses: report.pageTypeAnalyses.map((analysis, index) => ({
        ...analysis,
        evidence: filter(analysis.evidence, `pageTypeAnalyses[${index}].evidence`)
      })),
      findings
    },
    rejectedFindingIds,
    rejectedEvidence
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
