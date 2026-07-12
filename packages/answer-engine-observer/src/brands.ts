const COMPANY_SUFFIXES = [
  "incorporated", "corporation", "company", "limited", "inc", "corp", "llc", "ltd", "co",
  "plc", "gmbh", "pte", "pty", "股份有限公司", "有限责任公司", "有限公司"
] as const;

export function canonicalizeBrand(value: string): string {
  const normalized = stripCompanySuffix(value);
  return normalized.replace(/[\p{P}\p{Z}\s_]+/gu, "");
}

export function containsCanonicalBrand(text: string, brands: readonly string[]): boolean {
  const searchable = normalizeWords(text).replace(/[\p{P}\p{Z}\s_]+/gu, "");
  return brands.some((brand) => {
    const canonical = canonicalizeBrand(brand);
    return canonical.length > 0 && searchable.includes(canonical);
  });
}

export function stripCanonicalBrands(value: string, brands: readonly string[]): string {
  return [...brands]
    .sort((left, right) => canonicalizeBrand(right).length - canonicalizeBrand(left).length)
    .reduce((result, brand) => {
      const coreWords = normalizeWords(stripCompanySuffix(brand)).split(" ").filter(Boolean);
      if (coreWords.length === 0) return result;
      const corePattern = coreWords.map(escapeRegExp).join("[\\p{P}\\p{Z}\\s_]*");
      const suffixPattern = COMPANY_SUFFIXES.map((suffix) =>
        normalizeWords(suffix).split(" ").map(escapeRegExp).join("[\\p{P}\\p{Z}\\s_]*")
      ).join("|");
      return result.replace(new RegExp(`${corePattern}(?:[\\p{P}\\p{Z}\\s_]*(?:${suffixPattern}))?`, "giu"), "");
    }, value)
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripCompanySuffix(value: string): string {
  let normalized = normalizeWords(value);
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of COMPANY_SUFFIXES) {
      const normalizedSuffix = normalizeWords(suffix);
      if (normalized === normalizedSuffix) return "";
      if (normalized.endsWith(` ${normalizedSuffix}`)) {
        normalized = normalized.slice(0, -(normalizedSuffix.length + 1)).trim();
        changed = true;
        break;
      }
      if (normalized.endsWith(normalizedSuffix) && normalized.length > normalizedSuffix.length &&
          !/[a-z0-9]$/iu.test(normalized.slice(0, -normalizedSuffix.length))) {
        normalized = normalized.slice(0, -normalizedSuffix.length).trim();
        changed = true;
        break;
      }
    }
  }
  return normalized;
}

function normalizeWords(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[\p{P}\p{Z}\s_]+/gu, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
