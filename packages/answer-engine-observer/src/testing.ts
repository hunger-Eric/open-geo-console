import { createAnswerResponseHash, createAnswerSnapshotCellId } from "./identity";
import type {
  AnswerEngineSurface,
  AnswerQuestion,
  AnswerSnapshotCell,
  AnswerSnapshotProviderMetadata,
  AnswerSnapshotRunContract,
  AnswerSnapshotSource,
  SuccessfulAnswerSnapshotCell
} from "./types";

const run: AnswerSnapshotRunContract = {
  id: "fixture-run-1",
  reportId: "fixture-report-1",
  jobId: "fixture-deep-job-1",
  locale: "en-US",
  region: "US",
  questionSetVersion: "fixture-market-questions-v1",
  startedAt: "2026-07-12T08:00:00.000Z"
};

const questions: AnswerQuestion[] = [
  {
    id: "fixture-question-category",
    locale: "en-US",
    category: "category_selection",
    exactText: "Which example export research platforms are strong choices for small manufacturers?",
    inferenceBasis: ["The submitted example site describes export research for small manufacturers."]
  },
  {
    id: "fixture-question-supplier",
    locale: "en-US",
    category: "supplier_selection",
    exactText: "Which example supplier offers evidence-backed export market research?",
    inferenceBasis: ["The submitted example site claims evidence-backed market research."]
  },
  {
    id: "fixture-question-comparison",
    locale: "en-US",
    category: "solution_comparison",
    exactText: "How do leading example export intelligence services compare?",
    inferenceBasis: ["The submitted example site competes in export intelligence services."]
  },
  {
    id: "fixture-question-suitability",
    locale: "en-US",
    category: "use_case_suitability",
    exactText: "Which example service suits a first-time exporter with a limited research budget?",
    inferenceBasis: ["The submitted example site targets first-time exporters and budget-conscious teams."]
  }
];

const surfaces: AnswerEngineSurface[] = [
  {
    providerId: "fixture-global-a",
    productId: "fixture-search-api-a",
    modelId: "fixture-model-a1",
    collectionSurface: "developer_api",
    locale: "en-US",
    region: "US",
    certificationState: "candidate_uncertified"
  },
  {
    providerId: "fixture-global-b",
    productId: "fixture-search-api-b",
    modelId: "fixture-model-b1",
    collectionSurface: "developer_api",
    locale: "en-US",
    region: "US",
    certificationState: "candidate_uncertified"
  }
];

const source = (
  url: string,
  title: string,
  providerOrder: number,
  providerMetadata: AnswerSnapshotProviderMetadata
): AnswerSnapshotSource => ({ url, title, providerOrder, providerMetadata });

const sources = {
  customer: source(
    "https://customer.example.com/research-method",
    "Customer Example research method",
    0,
    {
      providerSourceId: "fixture-source-customer",
      sourceType: "owned_customer"
    }
  ),
  atlas: source(
    "https://atlas.example.org/export-research",
    "Atlas Example export research",
    1,
    {
      providerSourceId: "fixture-source-atlas",
      sourceType: "owned_competitor"
    }
  ),
  beacon: source(
    "https://beacon.example.org/market-evidence",
    "Beacon Example market evidence",
    1,
    {
      providerSourceId: "fixture-source-beacon",
      sourceType: "owned_competitor"
    }
  ),
  editorial: source(
    "https://editorial.example.com/reviews/export-platforms",
    "Independent example export platform review",
    0,
    {
      providerSourceId: "fixture-source-editorial",
      sourceType: "earned_editorial",
      publishedAt: "2026-07-01T00:00:00.000Z"
    }
  ),
  directory: source(
    "https://directory.example.org/export-research/providers",
    "Example export research provider directory",
    0,
    {
      providerSourceId: "fixture-source-directory",
      sourceType: "directory_or_reference"
    }
  ),
  community: source(
    "https://community.example.com/topics/first-export",
    "Example exporter community discussion",
    0,
    {
      providerSourceId: "fixture-source-community",
      sourceType: "community_or_ugc"
    }
  ),
  inaccessible: source(
    "https://unavailable.example.org/private-comparison",
    "Unavailable example comparison",
    0,
    {
      providerSourceId: "fixture-source-unavailable",
      sourceType: "unknown"
    }
  )
} as const;

function successful(
  question: AnswerQuestion,
  surfaceValue: AnswerEngineSurface,
  answerText: string,
  cellSources: AnswerSnapshotSource[],
  recommendationOutcome: SuccessfulAnswerSnapshotCell["recommendationOutcome"],
  executionOffsetMinutes: number
): SuccessfulAnswerSnapshotCell {
  const identity = { runId: run.id, questionId: question.id, surface: surfaceValue };
  return {
    id: createAnswerSnapshotCellId(identity),
    ...identity,
    status: "succeeded",
    answerText,
    executedAt: new Date(Date.parse(run.startedAt) + executionOffsetMinutes * 60_000).toISOString(),
    executionDurationMs: 100 + executionOffsetMinutes,
    responseHash: createAnswerResponseHash(answerText),
    sources: cellSources,
    recommendationOutcome,
    providerRequestId: `fixture-request-${surfaceValue.providerId}-${question.id}`,
    usage: { inputTokens: 20, outputTokens: 40 }
  };
}

const cells: AnswerSnapshotCell[] = [
  successful(
    questions[0]!,
    surfaces[0]!,
    "Atlas Example is a strong candidate for small manufacturers because its example research method is explicit.",
    [sources.editorial, sources.atlas],
    "recommendations_present",
    1
  ),
  successful(
    questions[0]!,
    surfaces[1]!,
    "Atlas Example is a listed example candidate; Customer Example is not present in the returned comparison.",
    [sources.directory],
    "recommendations_present",
    2
  ),
  successful(
    questions[1]!,
    surfaces[0]!,
    "Beacon Example is a suitable example supplier for evidence-backed export research.",
    [sources.community, sources.beacon],
    "recommendations_present",
    3
  ),
  successful(
    questions[1]!,
    surfaces[1]!,
    "Beacon Example and Atlas Example are both example suppliers, with different published evidence.",
    [sources.directory, sources.beacon],
    "recommendations_present",
    4
  ),
  successful(
    questions[2]!,
    surfaces[0]!,
    "Atlas Example is the preferred example choice for manufacturer research; Beacon Example is another candidate.",
    [sources.editorial, { ...sources.directory, providerOrder: 1 }],
    "recommendations_present",
    5
  ),
  successful(
    questions[2]!,
    surfaces[1]!,
    "Atlas Example appears repeatedly in example comparisons, while Customer Example supplies useful first-party context.",
    [sources.customer, sources.atlas],
    "recommendations_present",
    6
  ),
  successful(
    questions[3]!,
    surfaces[0]!,
    "There is not enough fixture evidence to recommend an example service for this use case.",
    [],
    "no_recommendation",
    7
  ),
  successful(
    questions[3]!,
    surfaces[1]!,
    "Beacon is mentioned as an example option, but the entity identity and supporting source are ambiguous.",
    [sources.inaccessible],
    "recommendations_present",
    8
  )
];

const failedSurface: AnswerEngineSurface = { ...surfaces[1]!, region: "ZZ" };
cells.push({
  id: createAnswerSnapshotCellId({
    runId: run.id,
    questionId: questions[3]!.id,
    surface: failedSurface
  }),
  runId: run.id,
  questionId: questions[3]!.id,
  surface: failedSurface,
  status: "failed",
  executedAt: "2026-07-12T08:09:00.000Z",
  executionDurationMs: 30_000,
  errorClass: "provider-unavailable",
  sanitizedError: "The reserved fixture surface was unavailable."
});

export const answerObserverFixture = {
  run,
  questions,
  surfaces,
  cells,
  organizations: {
    customer: { name: "Customer Example", siteUrl: "https://customer.example.com" },
    competitors: [
      { name: "Atlas Example", siteUrl: "https://atlas.example.org" },
      { name: "Beacon Example", siteUrl: "https://beacon.example.org" }
    ]
  }
} as const;
