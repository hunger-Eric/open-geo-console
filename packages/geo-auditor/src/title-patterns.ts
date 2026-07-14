const MIN_SHARED_CODE_POINTS = 20;
const MIN_SHARED_RATIO = 0.6;
const MIN_AFFECTED_RATIO = 0.6;
const SEPARATOR =
  /^[\s|｜:：·•—–-]+|[\s|｜:：·•—–-]+$/gu;

export type TitlePatternKind =
  | "exact_duplicate"
  | "dominant_prefix"
  | "dominant_suffix";

export interface TitlePatternPage {
  url: string;
  status: number;
  title?: string;
}

export interface TitlePatternMatch {
  kind: TitlePatternKind;
  sharedSegment: string;
  sharedLength: number;
  affectedUrls: string[];
  uniqueSegments: Record<string, string>;
  weightedLengths: Record<string, number>;
}

interface EligibleTitle {
  url: string;
  title: string;
  points: string[];
}

interface TemplateCandidate {
  kind: "dominant_prefix" | "dominant_suffix";
  sharedSegment: string;
  sharedLength: number;
}

interface RankedTemplateMatch {
  match: TitlePatternMatch;
  summedSharedRatio: number;
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function codePoints(value: string): string[] {
  return [...value];
}

function trimSeparators(value: string): string {
  return value.replace(SEPARATOR, "").trim();
}

function commonPrefix(left: string[], right: string[]): string {
  let end = 0;
  while (end < left.length && end < right.length && left[end] === right[end]) {
    end += 1;
  }
  return left.slice(0, end).join("");
}

function commonSuffix(left: string[], right: string[]): string {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - length - 1] === right[right.length - length - 1]
  ) {
    length += 1;
  }
  return left.slice(left.length - length).join("");
}

function uniqueSegment(
  title: EligibleTitle,
  kind: TemplateCandidate["kind"],
  sharedLength: number
): string {
  const points =
    kind === "dominant_prefix"
      ? title.points.slice(sharedLength)
      : title.points.slice(0, title.points.length - sharedLength);
  return trimSeparators(points.join(""));
}

export function weightedTitleLength(value: string): number {
  return codePoints(normalize(value)).reduce(
    (sum, character) =>
      sum + (/[^\u0000-\u00ff]/u.test(character) ? 2 : 1),
    0
  );
}

export function analyzeTitlePatterns(
  pages: readonly TitlePatternPage[]
): TitlePatternMatch[] {
  const eligible: EligibleTitle[] = pages.flatMap((page) => {
    if (page.status < 200 || page.status >= 400 || !page.title?.trim()) {
      return [];
    }
    const title = normalize(page.title);
    return [{ url: page.url, title, points: codePoints(title) }];
  });

  const duplicateGroups = new Map<string, EligibleTitle[]>();
  for (const page of eligible) {
    const key = page.title.toLowerCase();
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), page]);
  }

  const duplicateMatches: TitlePatternMatch[] = [];
  const duplicateUrls = new Set<string>();
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    const sharedSegment = group[0]!.title;
    const affectedUrls = group.map(({ url }) => url);
    for (const url of affectedUrls) duplicateUrls.add(url);
    duplicateMatches.push({
      kind: "exact_duplicate",
      sharedSegment,
      sharedLength: codePoints(sharedSegment).length,
      affectedUrls,
      uniqueSegments: Object.fromEntries(affectedUrls.map((url) => [url, ""])),
      weightedLengths: Object.fromEntries(
        group.map(({ url, title }) => [url, weightedTitleLength(title)])
      )
    });
  }

  const templatePages = eligible.filter(({ url }) => !duplicateUrls.has(url));
  const minimumAffected = Math.max(
    3,
    Math.ceil(templatePages.length * MIN_AFFECTED_RATIO)
  );
  if (templatePages.length < minimumAffected) return duplicateMatches;

  const candidateMap = new Map<string, TemplateCandidate>();
  for (let leftIndex = 0; leftIndex < templatePages.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < templatePages.length;
      rightIndex += 1
    ) {
      const left = templatePages[leftIndex]!;
      const right = templatePages[rightIndex]!;
      for (const [kind, rawSegment] of [
        ["dominant_prefix", commonPrefix(left.points, right.points)],
        ["dominant_suffix", commonSuffix(left.points, right.points)]
      ] as const) {
        const sharedSegment = trimSeparators(rawSegment);
        const sharedLength = codePoints(sharedSegment).length;
        if (sharedLength < MIN_SHARED_CODE_POINTS) continue;
        candidateMap.set(`${kind}\u0000${sharedSegment}`, {
          kind,
          sharedSegment,
          sharedLength
        });
      }
    }
  }

  const qualifying: RankedTemplateMatch[] = [];
  for (const candidate of candidateMap.values()) {
    const affected = templatePages.filter((page) => {
      const containsShared =
        candidate.kind === "dominant_prefix"
          ? page.title.startsWith(candidate.sharedSegment)
          : page.title.endsWith(candidate.sharedSegment);
      return (
        containsShared &&
        candidate.sharedLength / page.points.length >= MIN_SHARED_RATIO
      );
    });
    if (affected.length < minimumAffected) continue;

    const uniqueSegments = Object.fromEntries(
      affected.map((page) => [
        page.url,
        uniqueSegment(page, candidate.kind, candidate.sharedLength)
      ])
    );
    const distinctUniqueSegments = new Set(
      Object.values(uniqueSegments).filter(Boolean)
    );
    if (distinctUniqueSegments.size < 2) continue;

    qualifying.push({
      match: {
        kind: candidate.kind,
        sharedSegment: candidate.sharedSegment,
        sharedLength: candidate.sharedLength,
        affectedUrls: affected.map(({ url }) => url),
        uniqueSegments,
        weightedLengths: Object.fromEntries(
          affected.map(({ url, title }) => [url, weightedTitleLength(title)])
        )
      },
      summedSharedRatio: affected.reduce(
        (sum, page) => sum + candidate.sharedLength / page.points.length,
        0
      )
    });
  }

  qualifying.sort((left, right) => {
    return (
      right.match.affectedUrls.length - left.match.affectedUrls.length ||
      right.summedSharedRatio - left.summedSharedRatio ||
      right.match.sharedLength - left.match.sharedLength ||
      (left.match.kind === "dominant_prefix" ? 0 : 1) -
        (right.match.kind === "dominant_prefix" ? 0 : 1)
    );
  });

  return qualifying[0]
    ? [...duplicateMatches, qualifying[0].match]
    : duplicateMatches;
}
