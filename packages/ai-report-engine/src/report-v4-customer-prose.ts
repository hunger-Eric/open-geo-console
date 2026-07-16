export interface ReportV4TextBounds {
  readonly minChars: number;
  readonly maxChars: number;
}

export interface ReportV4ListBounds extends ReportV4TextBounds {
  readonly minItems: number;
  readonly maxItems: number;
}

export interface ReportV4ExactListBounds extends ReportV4TextBounds {
  readonly exactItems: number;
}

export type ReportV4CustomerProseLocale = "zh-CN" | "en";

export interface ReportV4CustomerProseProfile {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly locale: ReportV4CustomerProseLocale;
  readonly audiences: {
    readonly primary: readonly string[];
    readonly secondary: readonly string[];
  };
  readonly readingOrder: readonly ["conclusion", "reason", "action"];
  readonly tone: readonly string[];
  readonly terminology: {
    readonly requiredGeoTerms: readonly string[];
    readonly prohibitedSeoFraming: readonly string[];
    readonly prohibitedInternalLanguage: readonly string[];
    readonly prohibitedPromptLeakage: readonly string[];
  };
  readonly presentation: {
    readonly conciseByDefault: true;
    readonly detailedEvidenceCollapsed: true;
  };
  readonly fieldBounds: {
    readonly websiteSummary: ReportV4TextBounds;
    readonly websiteListItem: ReportV4ListBounds;
    readonly questionAnswer: ReportV4TextBounds;
    readonly selectionSummary: ReportV4TextBounds;
    readonly observableFactors: ReportV4ExactListBounds;
    readonly targetGap: ReportV4TextBounds;
    readonly recommendedActions: ReportV4ExactListBounds;
  };
}

export interface ReportV4CustomerSourceOriginal {
  readonly title: string;
  readonly citedText: string | null;
}

export interface ReportV4CustomerProse {
  readonly websiteSummary: string;
  readonly websiteStrengths: readonly string[];
  readonly websiteGaps: readonly string[];
  readonly websiteActions: readonly string[];
  readonly questionAnswer: string;
  readonly selectionSummary: string;
  readonly observableFactors: readonly string[];
  readonly targetGap: string;
  readonly recommendedActions: readonly string[];
  readonly sourceOriginals: readonly ReportV4CustomerSourceOriginal[];
}

const PROFILE_KEYS = new Set(["schemaVersion", "profileId", "locale", "audiences", "readingOrder", "tone", "terminology", "presentation", "fieldBounds"]);
const AUDIENCE_KEYS = new Set(["primary", "secondary"]);
const TERMINOLOGY_KEYS = new Set(["requiredGeoTerms", "prohibitedSeoFraming", "prohibitedInternalLanguage", "prohibitedPromptLeakage"]);
const PRESENTATION_KEYS = new Set(["conciseByDefault", "detailedEvidenceCollapsed"]);
const FIELD_BOUNDS_KEYS = new Set(["websiteSummary", "websiteListItem", "questionAnswer", "selectionSummary", "observableFactors", "targetGap", "recommendedActions"]);
const TEXT_BOUNDS_KEYS = new Set(["minChars", "maxChars"]);
const LIST_BOUNDS_KEYS = new Set(["minChars", "maxChars", "minItems", "maxItems"]);
const EXACT_LIST_BOUNDS_KEYS = new Set(["minChars", "maxChars", "exactItems"]);
const CUSTOMER_PROSE_KEYS = new Set(["websiteSummary", "websiteStrengths", "websiteGaps", "websiteActions", "questionAnswer", "selectionSummary", "observableFactors", "targetGap", "recommendedActions", "sourceOriginals"]);
const SOURCE_ORIGINAL_KEYS = new Set(["title", "citedText"]);
const CJK_PATTERN = /[\u3400-\u9fff]/u;
const LATIN_PATTERN = /\p{Script=Latin}/u;

const BASELINE_PROHIBITED_PHRASES = [
  "system prompt", "developer message", "user instructions", "ignore previous instructions",
  "raw JSON", "raw provider JSON", "provider response", "tool call arguments", "validator error",
  "checkpoint", "snapshot", "claim extraction", "provider adapter", "token budget", "retry count", "state machine", "workflow node", "evidence hash",
  "SEO", "search engine optimization", "search ranking", "keyword ranking", "SERP",
  "系统提示词", "开发者消息", "用户指令", "忽略此前指令", "原始JSON", "原始供应商JSON", "供应商响应", "工具调用参数", "验证器错误",
  "检查点", "快照", "声明提取", "供应商适配器", "令牌预算", "重试次数", "状态机", "工作流节点", "证据哈希",
  "搜索引擎优化", "搜索排名", "关键词排名"
] as const;

const PROHIBITED_CAUSAL_FRAMING = [
  /(?:model|provider).{0,50}(?:selected|ranked|chose|recommended|cited|omitted).{0,50}because/iu,
  /because.{0,50}(?:model|provider).{0,50}(?:selected|ranked|chose|recommended|cited|omitted)/iu,
  /(?:guarantee|ensure|certainly|always).{0,50}(?:citation|cited|recommendation|recommended|ranking|ranked)/iu,
  /(?:模型|供应商).{0,30}(?:选择|选中|排名|推荐|引用|遗漏).{0,30}(?:因为|由于)/u,
  /(?:因为|由于).{0,30}(?:模型|供应商).{0,30}(?:选择|选中|排名|推荐|引用|遗漏)/u,
  /(?:保证|确保|必然|一定会).{0,30}(?:引用|被引用|推荐|被推荐|排名)/u
] as const;

export function parseReportV4CustomerProseProfile(value: unknown): ReportV4CustomerProseProfile {
  const root = strictObject(value, "$profile", PROFILE_KEYS);
  exact(root.schemaVersion, 1, "$profile.schemaVersion");
  const locale = profileLocale(root.locale);

  const audiences = strictObject(root.audiences, "$profile.audiences", AUDIENCE_KEYS);
  const terminology = strictObject(root.terminology, "$profile.terminology", TERMINOLOGY_KEYS);
  const presentation = strictObject(root.presentation, "$profile.presentation", PRESENTATION_KEYS);
  const fieldBounds = strictObject(root.fieldBounds, "$profile.fieldBounds", FIELD_BOUNDS_KEYS);
  const readingOrder = textArray(root.readingOrder, "$profile.readingOrder", 3, 3, 40);
  if (readingOrder.join("|") !== "conclusion|reason|action") {
    throw new TypeError("$profile.readingOrder must be conclusion, reason, action.");
  }
  exact(presentation.conciseByDefault, true, "$profile.presentation.conciseByDefault");
  exact(presentation.detailedEvidenceCollapsed, true, "$profile.presentation.detailedEvidenceCollapsed");

  const requiredGeoTerms = textArray(terminology.requiredGeoTerms, "$profile.terminology.requiredGeoTerms", 3, 20, 100);
  if (!requiredGeoTerms.some((term) => canonical(term) === "geo")) throw new TypeError("$profile.terminology.requiredGeoTerms must include GEO.");

  return deepFreeze({
    schemaVersion: 1,
    profileId: text(root.profileId, "$profile.profileId", 100),
    locale,
    audiences: {
      primary: textArray(audiences.primary, "$profile.audiences.primary", 1, 8, 100),
      secondary: textArray(audiences.secondary, "$profile.audiences.secondary", 1, 8, 100)
    },
    readingOrder: ["conclusion", "reason", "action"],
    tone: textArray(root.tone, "$profile.tone", 1, 12, 100),
    terminology: {
      requiredGeoTerms,
      prohibitedSeoFraming: textArray(terminology.prohibitedSeoFraming, "$profile.terminology.prohibitedSeoFraming", 1, 50, 200),
      prohibitedInternalLanguage: textArray(terminology.prohibitedInternalLanguage, "$profile.terminology.prohibitedInternalLanguage", 1, 100, 200),
      prohibitedPromptLeakage: textArray(terminology.prohibitedPromptLeakage, "$profile.terminology.prohibitedPromptLeakage", 1, 100, 200)
    },
    presentation: { conciseByDefault: true, detailedEvidenceCollapsed: true },
    fieldBounds: {
      websiteSummary: parseTextBounds(fieldBounds.websiteSummary, "$profile.fieldBounds.websiteSummary"),
      websiteListItem: parseListBounds(fieldBounds.websiteListItem, "$profile.fieldBounds.websiteListItem"),
      questionAnswer: parseTextBounds(fieldBounds.questionAnswer, "$profile.fieldBounds.questionAnswer"),
      selectionSummary: parseTextBounds(fieldBounds.selectionSummary, "$profile.fieldBounds.selectionSummary"),
      observableFactors: parseExactListBounds(fieldBounds.observableFactors, "$profile.fieldBounds.observableFactors"),
      targetGap: parseTextBounds(fieldBounds.targetGap, "$profile.fieldBounds.targetGap"),
      recommendedActions: parseExactListBounds(fieldBounds.recommendedActions, "$profile.fieldBounds.recommendedActions")
    }
  });
}

export function validateReportV4CustomerProse(
  value: unknown,
  profile: ReportV4CustomerProseProfile
): ReportV4CustomerProse {
  const root = strictObject(value, "$customerProse", CUSTOMER_PROSE_KEYS);
  const forbidden = [
    ...BASELINE_PROHIBITED_PHRASES,
    ...profile.terminology.prohibitedSeoFraming,
    ...profile.terminology.prohibitedInternalLanguage,
    ...profile.terminology.prohibitedPromptLeakage
  ];
  const customerText = (field: unknown, path: string, bounds: ReportV4TextBounds) => {
    const parsed = boundedText(field, path, bounds);
    if (profile.locale === "zh-CN" && !CJK_PATTERN.test(parsed)) throw new TypeError(`${path} must contain customer-readable Chinese for the configured locale.`);
    if (profile.locale === "en" && !LATIN_PATTERN.test(parsed)) throw new TypeError(`${path} must contain customer-readable English for the configured locale.`);
    assertSafeCustomerProse(parsed, path, forbidden);
    return parsed;
  };
  const customerList = (field: unknown, path: string, bounds: ReportV4ListBounds | ReportV4ExactListBounds) => {
    const rows = array(field, path);
    const expected = "exactItems" in bounds ? bounds.exactItems : undefined;
    if (expected !== undefined && rows.length !== expected) throw new TypeError(`${path} must contain exactly ${expected} items.`);
    if ("minItems" in bounds && (rows.length < bounds.minItems || rows.length > bounds.maxItems)) {
      throw new TypeError(`${path} must contain ${bounds.minItems} to ${bounds.maxItems} items.`);
    }
    return rows.map((item, index) => customerText(item, `${path}[${index}]`, bounds));
  };

  const parsed: ReportV4CustomerProse = {
    websiteSummary: customerText(root.websiteSummary, "$customerProse.websiteSummary", profile.fieldBounds.websiteSummary),
    websiteStrengths: customerList(root.websiteStrengths, "$customerProse.websiteStrengths", profile.fieldBounds.websiteListItem),
    websiteGaps: customerList(root.websiteGaps, "$customerProse.websiteGaps", profile.fieldBounds.websiteListItem),
    websiteActions: customerList(root.websiteActions, "$customerProse.websiteActions", profile.fieldBounds.websiteListItem),
    questionAnswer: customerText(root.questionAnswer, "$customerProse.questionAnswer", profile.fieldBounds.questionAnswer),
    selectionSummary: customerText(root.selectionSummary, "$customerProse.selectionSummary", profile.fieldBounds.selectionSummary),
    observableFactors: customerList(root.observableFactors, "$customerProse.observableFactors", profile.fieldBounds.observableFactors),
    targetGap: customerText(root.targetGap, "$customerProse.targetGap", profile.fieldBounds.targetGap),
    recommendedActions: customerList(root.recommendedActions, "$customerProse.recommendedActions", profile.fieldBounds.recommendedActions),
    sourceOriginals: parseSourceOriginals(root.sourceOriginals)
  };

  const combined = [
    parsed.websiteSummary,
    ...parsed.websiteStrengths,
    ...parsed.websiteGaps,
    ...parsed.websiteActions,
    parsed.questionAnswer,
    parsed.selectionSummary,
    ...parsed.observableFactors,
    parsed.targetGap,
    ...parsed.recommendedActions
  ].join("\n");
  const geoTerm = profile.terminology.requiredGeoTerms.find((term) => canonical(term) === "geo");
  if (!geoTerm || !canonical(combined).includes(canonical(geoTerm))) {
    throw new TypeError("$customerProse must retain the configured GEO terminology and context.");
  }
  return deepFreeze(parsed);
}

function parseSourceOriginals(value: unknown): ReportV4CustomerSourceOriginal[] {
  const rows = array(value, "$customerProse.sourceOriginals");
  if (rows.length > 100) throw new TypeError("$customerProse.sourceOriginals has too many items.");
  return rows.map((item, index) => {
    const path = `$customerProse.sourceOriginals[${index}]`;
    const row = strictObject(item, path, SOURCE_ORIGINAL_KEYS);
    return {
      title: originalText(row.title, `${path}.title`, 2_000),
      citedText: row.citedText === null ? null : originalText(row.citedText, `${path}.citedText`, 10_000)
    };
  });
}

function assertSafeCustomerProse(value: string, path: string, prohibited: readonly string[]): void {
  const compact = canonical(value);
  const matched = prohibited.find((phrase) => compact.includes(canonical(phrase)));
  if (matched || PROHIBITED_CAUSAL_FRAMING.some((pattern) => pattern.test(value)) || /[\[{]\s*["'][^"']+["']\s*:/u.test(value)) {
    throw new TypeError(`${path} contains prohibited customer prose, leakage, or SEO framing.`);
  }
}

function parseTextBounds(value: unknown, path: string): ReportV4TextBounds {
  const row = strictObject(value, path, TEXT_BOUNDS_KEYS);
  const minChars = positiveInteger(row.minChars, `${path}.minChars`);
  const maxChars = positiveInteger(row.maxChars, `${path}.maxChars`);
  if (minChars > maxChars) throw new TypeError(`${path} bounds require maximum characters to be at least the minimum.`);
  return { minChars, maxChars };
}

function parseListBounds(value: unknown, path: string): ReportV4ListBounds {
  const row = strictObject(value, path, LIST_BOUNDS_KEYS);
  const textBounds = parseTextBounds({ minChars: row.minChars, maxChars: row.maxChars }, path);
  const minItems = positiveInteger(row.minItems, `${path}.minItems`);
  const maxItems = positiveInteger(row.maxItems, `${path}.maxItems`);
  if (minItems > maxItems) throw new TypeError(`${path} bounds require maximum items to be at least the minimum.`);
  return { ...textBounds, minItems, maxItems };
}

function parseExactListBounds(value: unknown, path: string): ReportV4ExactListBounds {
  const row = strictObject(value, path, EXACT_LIST_BOUNDS_KEYS);
  return {
    ...parseTextBounds({ minChars: row.minChars, maxChars: row.maxChars }, path),
    exactItems: positiveInteger(row.exactItems, `${path}.exactItems`)
  };
}

function strictObject(value: unknown, path: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${path} contains unknown field ${unknown}.`);
  return row;
}

function textArray(value: unknown, path: string, minItems: number, maxItems: number, maxChars: number): string[] {
  const rows = array(value, path);
  if (rows.length < minItems || rows.length > maxItems) throw new TypeError(`${path} must contain ${minItems} to ${maxItems} items.`);
  const parsed = rows.map((item, index) => text(item, `${path}[${index}]`, maxChars));
  if (new Set(parsed).size !== parsed.length) throw new TypeError(`${path} items must be unique.`);
  return parsed;
}

function boundedText(value: unknown, path: string, bounds: ReportV4TextBounds): string {
  const parsed = text(value, path, bounds.maxChars);
  if (parsed.length < bounds.minChars) throw new TypeError(`${path} length must be between ${bounds.minChars} and ${bounds.maxChars} characters.`);
  return parsed;
}

function text(value: unknown, path: string, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be nonblank text.`);
  const parsed = value.trim().normalize("NFC");
  if (parsed.length > maxChars) throw new TypeError(`${path} length must not exceed ${maxChars} characters.`);
  return parsed;
}

function originalText(value: unknown, path: string, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be nonblank text.`);
  if (value.length > maxChars) throw new TypeError(`${path} length must not exceed ${maxChars} characters.`);
  return value;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new TypeError(`${path} must be a positive integer.`);
  return value;
}

function profileLocale(value: unknown): ReportV4CustomerProseLocale {
  if (value !== "zh-CN" && value !== "en") {
    throw new TypeError("$profile.locale must equal zh-CN or en.");
  }
  return value;
}

function exact(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`);
}

function canonical(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
