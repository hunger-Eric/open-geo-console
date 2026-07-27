import { answerObserverFixture } from "@open-geo-console/answer-engine-observer/testing";
import {
  categorizeSource,
  classifyRecommendations,
  createOpportunityHypothesis,
  gradeCitationEvidence,
  resolveEntity,
  type CitationSourceCategory,
  type EntityResolution,
  type GradedCitationEvidence,
  type OpportunityHypothesis,
  type RecommendationSignal
} from "./index";

export interface CitationIntelligenceFixture {
  fixtureId: "citation-intelligence-fixture-1";
  recommendations: RecommendationSignal[];
  entityResolutions: EntityResolution[];
  sourceCategories: Array<{ url: string; category: CitationSourceCategory }>;
  evidence: GradedCitationEvidence[];
  opportunities: OpportunityHypothesis[];
}

export function createCitationIntelligenceFixture(): CitationIntelligenceFixture {
  const cells = answerObserverFixture.cells;
  if (cells.length < 8) throw new Error("answer observer fixture must contain at least eight cells");
  const cellIds = cells.map(({ id }) => id);

  const recommendations = [
    ...classifyRecommendations("Atlas Example is a strong candidate for small manufacturers.", [
      { entityId: "atlas-example", name: "Atlas Example" }
    ]),
    ...classifyRecommendations("Beacon Example is suitable for evidence-backed export research.", [
      { entityId: "beacon-example", name: "Beacon Example" }
    ])
  ];

  const entityResolutions: EntityResolution[] = [
    resolveEntity({
      name: "Beacon",
      candidates: [
        { entityId: "beacon-research", name: "Beacon", registrableDomain: "beacon.example.org" },
        { entityId: "beacon-consulting", name: "Beacon", registrableDomain: "beacon.example.com" }
      ]
    }),
    resolveEntity({
      name: "Atlas Example",
      sourceUrl: "https://atlas.example.org/export-research",
      candidates: [
        {
          entityId: "atlas-example",
          name: "Atlas Example",
          registrableDomain: "atlas.example.org"
        }
      ]
    })
  ];

  const sourceContext = {
    customerRegistrableDomain: "customer.example.com",
    competitorRegistrableDomains: ["atlas.example.org", "beacon.example.org"],
    knownDomains: {
      "editorial.example.com": "earned_editorial",
      "directory.example.org": "directory_or_reference",
      "community.example.com": "community_or_ugc"
    } as const
  };
  const urls = [
    "https://customer.example.com/research-method",
    "https://atlas.example.org/export-research",
    "https://editorial.example.com/reviews/export-platforms",
    "https://directory.example.org/export-research/providers",
    "https://community.example.com/topics/first-export",
    "https://unavailable.example.org/resource"
  ];
  const sourceCategories = urls.map((url) => ({ category: categorizeSource(url, sourceContext), url }));

  const evidence: GradedCitationEvidence[] = [
    gradeCitationEvidence({
      evidenceId: "fixture-evidence-a",
      cellId: cellIds[0]!,
      sourceUrl: "https://editorial.example.com/reviews/export-platforms",
      providerReturned: true,
      retrievalState: "available",
      verifiedExcerpt: "Atlas Example is a strong choice for small manufacturers entering export markets.",
      directSupport: true,
      preciseMapping: true,
      relevantEntityEvidence: true,
      entityAmbiguous: false
    }),
    gradeCitationEvidence({
      evidenceId: "fixture-evidence-b",
      cellId: cellIds[1]!,
      sourceUrl: "https://directory.example.org/export-research/providers",
      providerReturned: true,
      retrievalState: "available",
      verifiedExcerpt: "The directory lists Atlas Example and Beacon Example as export research providers.",
      directSupport: false,
      preciseMapping: false,
      relevantEntityEvidence: true,
      entityAmbiguous: false
    }),
    gradeCitationEvidence({
      evidenceId: "fixture-evidence-c",
      cellId: cellIds[0]!,
      sourceUrl: "https://atlas.example.org/export-research",
      providerReturned: true,
      retrievalState: "available",
      directSupport: false,
      preciseMapping: false,
      relevantEntityEvidence: false,
      entityAmbiguous: false,
      repeatedPattern: {
        kind: "source",
        value: "https://atlas.example.org/export-research",
        occurrences: [
          {
            cellId: cellIds[0]!,
            recommendationOutcome: "recommendations_present",
            supportingText: "https://atlas.example.org/export-research"
          },
          {
            cellId: cellIds[5]!,
            recommendationOutcome: "recommendations_present",
            supportingText: "https://atlas.example.org/export-research"
          }
        ]
      }
    }),
    gradeCitationEvidence({
      evidenceId: "fixture-evidence-d-inaccessible-ambiguous",
      cellId: cellIds[7]!,
      sourceUrl: "https://unavailable.example.org/private-comparison",
      providerReturned: true,
      retrievalState: "inaccessible",
      directSupport: false,
      preciseMapping: false,
      relevantEntityEvidence: true,
      entityAmbiguous: true
    })
  ];

  const opportunities = [
    createOpportunityHypothesis({
      id: "fixture-opportunity-editorial-benchmark",
      title: "Prepare an auditable benchmark for editorial review",
      rationale: "Independent fixture cells repeatedly expose verified operational evidence.",
      evidenceCellIds: [cellIds[0]!, cellIds[5]!],
      sourcePattern: "editorial sources documenting auditable operational evidence",
      suggestedAction: "Give relevant editors a bounded evidence pack they can independently verify."
    })
  ];

  return {
    fixtureId: "citation-intelligence-fixture-1",
    recommendations,
    entityResolutions,
    sourceCategories,
    evidence,
    opportunities
  };
}

export const citationIntelligenceFixture = createCitationIntelligenceFixture();
