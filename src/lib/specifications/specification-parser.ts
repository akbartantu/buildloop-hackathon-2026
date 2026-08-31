export type ParsedSpecification = {
  summary: string;
  requirementCount: number;
  constraintCount: number;
  flowCount: number;
};

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

export function parseSpecificationContent(content: string, filename: string): ParsedSpecification {
  const normalized = content.replace(/\r\n/g, "\n");
  const requirementCount = countMatches(
    normalized,
    /^\s*(?:[-*]|\d+\.)\s+.+/gm,
  );
  const constraintCount = countMatches(
    normalized,
    /\b(must not|shall not|cannot|must|shall|required|constraint|protected)\b/gi,
  );
  const flowCount = countMatches(
    normalized,
    /\b(user flow|flow:|journey|password reset|sign[- ]?in|sign[- ]?up|authentication)\b/gi,
  );

  const firstParagraph =
    normalized
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find((block) => block.length > 0) ?? normalized.trim();

  const summaryBase = firstParagraph.slice(0, 220).trim();
  const summary = `${filename}: ${summaryBase}${summaryBase.length < firstParagraph.length ? "…" : ""}`;

  return {
    summary,
    requirementCount: Math.max(requirementCount, 0),
    constraintCount: Math.max(constraintCount, 0),
    flowCount: Math.max(flowCount, 0),
  };
}
