export const REPORT_V4_MAX_SITE_PAGES = 50 as const;
export const REPORT_V4_MAX_PAGE_SUMMARY_CHARS = 2_000 as const;
export const REPORT_V4_MAX_PAGE_SUMMARY_CHUNKS = 8 as const;
export const REPORT_V4_MAX_SOURCE_LOCATIONS_PER_CHUNK = 16 as const;
export const REPORT_V4_MAX_TOTAL_SITE_SUMMARY_CHARS = 100_000 as const;

export interface ReportV4SourceLocation {
  readonly locationId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ReportV4PageSummaryChunk {
  readonly order: number;
  readonly summary: string;
  readonly sourceLocations: readonly ReportV4SourceLocation[];
}

export interface ReportV4PageSummary {
  readonly pageId: string;
  readonly url: string;
  readonly contentHash: string;
  readonly readability: "direct_readable" | "js_dependent";
  readonly chunks: readonly ReportV4PageSummaryChunk[];
}

export interface ReportV4SiteSynthesisInput {
  readonly targetUrl: string;
  readonly locale: string;
  readonly pages: readonly ReportV4PageSummary[];
}

export interface ReportV4QuestionAnswerInput {
  readonly questionId: string;
  readonly question: string;
  readonly locale: string;
  readonly region: string;
}

const SITE_FIELDS = new Set(["targetUrl", "locale", "pages"]);
const PAGE_FIELDS = new Set(["pageId", "url", "contentHash", "readability", "chunks"]);
const CHUNK_FIELDS = new Set(["order", "summary", "sourceLocations"]);
const LOCATION_FIELDS = new Set(["locationId", "startOffset", "endOffset"]);
const QUESTION_FIELDS = new Set(["questionId", "question", "locale", "region"]);

export function parseReportV4SiteSynthesisInput(value: unknown): ReportV4SiteSynthesisInput {
  const root = strictObject(value, "$siteSynthesis", SITE_FIELDS);
  const pageRows = array(root.pages, "$siteSynthesis.pages");
  if (pageRows.length < 1 || pageRows.length > REPORT_V4_MAX_SITE_PAGES) {
    throw new TypeError(`$siteSynthesis.pages must contain between 1 and ${REPORT_V4_MAX_SITE_PAGES} page summaries.`);
  }

  const pageIds = new Set<string>();
  const pageUrls = new Set<string>();
  const locationIds = new Set<string>();
  let totalSummaryCharacters = 0;
  const pages = pageRows.map((page, pageIndex) => {
    const path = `$siteSynthesis.pages[${pageIndex}]`;
    const row = strictObject(page, path, PAGE_FIELDS);
    const pageId = boundedText(row.pageId, `${path}.pageId`, 500);
    if (pageIds.has(pageId)) throw new TypeError("V4 page summary pageId values must be unique.");
    pageIds.add(pageId);
    const url = httpUrl(row.url, `${path}.url`);
    if (pageUrls.has(url)) throw new TypeError("V4 page summary URLs must be unique.");
    pageUrls.add(url);
    const chunkRows = array(row.chunks, `${path}.chunks`);
    if (chunkRows.length < 1 || chunkRows.length > REPORT_V4_MAX_PAGE_SUMMARY_CHUNKS) {
      throw new TypeError(`${path}.chunks must contain between 1 and ${REPORT_V4_MAX_PAGE_SUMMARY_CHUNKS} ordered summary chunks.`);
    }
    const chunks = chunkRows.map((chunk, chunkIndex) => {
      const chunkPath = `${path}.chunks[${chunkIndex}]`;
      const chunkRow = strictObject(chunk, chunkPath, CHUNK_FIELDS);
      exact(chunkRow.order, chunkIndex + 1, `${chunkPath}.order`);
      const summary = boundedText(chunkRow.summary, `${chunkPath}.summary`, REPORT_V4_MAX_PAGE_SUMMARY_CHARS);
      totalSummaryCharacters += summary.length;
      const locationRows = array(chunkRow.sourceLocations, `${chunkPath}.sourceLocations`);
      if (locationRows.length < 1 || locationRows.length > REPORT_V4_MAX_SOURCE_LOCATIONS_PER_CHUNK) {
        throw new TypeError(`${chunkPath}.sourceLocations must contain between 1 and ${REPORT_V4_MAX_SOURCE_LOCATIONS_PER_CHUNK} source positions.`);
      }
      const sourceLocations = locationRows.map((location, locationIndex) => {
        const locationPath = `${chunkPath}.sourceLocations[${locationIndex}]`;
        const locationRow = strictObject(location, locationPath, LOCATION_FIELDS);
        const locationId = boundedText(locationRow.locationId, `${locationPath}.locationId`, 500);
        if (locationIds.has(locationId)) throw new TypeError("V4 page summary locationId values must be unique across the synthesis request.");
        locationIds.add(locationId);
        const startOffset = nonnegativeInteger(locationRow.startOffset, `${locationPath}.startOffset`);
        const endOffset = nonnegativeInteger(locationRow.endOffset, `${locationPath}.endOffset`);
        if (endOffset <= startOffset) throw new TypeError(`${locationPath}.endOffset must be greater than startOffset.`);
        return Object.freeze({ locationId, startOffset, endOffset });
      });
      return Object.freeze({ order: chunkIndex + 1, summary, sourceLocations: Object.freeze(sourceLocations) });
    });
    return Object.freeze({
      pageId,
      url,
      contentHash: sha256(row.contentHash, `${path}.contentHash`),
      readability: oneOf(row.readability, ["direct_readable", "js_dependent"] as const, `${path}.readability`),
      chunks: Object.freeze(chunks)
    });
  });
  if (totalSummaryCharacters > REPORT_V4_MAX_TOTAL_SITE_SUMMARY_CHARS) {
    throw new TypeError(`$siteSynthesis.pages summary text exceeds ${REPORT_V4_MAX_TOTAL_SITE_SUMMARY_CHARS} characters.`);
  }

  return Object.freeze({
    targetUrl: httpUrl(root.targetUrl, "$siteSynthesis.targetUrl"),
    locale: boundedText(root.locale, "$siteSynthesis.locale", 100),
    pages: Object.freeze(pages)
  });
}

export function parseReportV4QuestionAnswerInput(value: unknown): ReportV4QuestionAnswerInput {
  const root = strictObject(value, "$questionAnswer", QUESTION_FIELDS);
  return Object.freeze({
    questionId: boundedText(root.questionId, "$questionAnswer.questionId", 500),
    question: boundedText(root.question, "$questionAnswer.question", 10_000),
    locale: boundedText(root.locale, "$questionAnswer.locale", 100),
    region: boundedText(root.region, "$questionAnswer.region", 100)
  });
}

function strictObject(value: unknown, path: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${path} contains unknown field ${unknown}.`);
  return row;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
  return value;
}

function boundedText(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new TypeError(`${path} must be non-empty text no longer than ${max} characters.`);
  }
  return value.trim();
}

function sha256(value: unknown, path: string): string {
  const result = boundedText(value, path, 64);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${path} must be a lowercase SHA-256 hash.`);
  return result;
}

function httpUrl(value: unknown, path: string): string {
  const result = boundedText(value, path, 2_000);
  try {
    const url = new URL(result);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) throw new Error("unsupported URL");
    url.hash = "";
    return url.href;
  } catch {
    throw new TypeError(`${path} must be an HTTP(S) URL without credentials.`);
  }
}

function nonnegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${path} must be a nonnegative integer.`);
  return value;
}

function exact(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) throw new TypeError(`${path} must preserve ordered value ${String(expected)}.`);
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw new TypeError(`${path} must be one of ${allowed.join(", ")}.`);
  return value as T[number];
}
