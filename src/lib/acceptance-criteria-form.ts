import { mergeUserAndGeneratedCriteria } from "@/lib/planning/clarification-policy";

export function parseAcceptanceCriteria(raw: string): string[] | undefined {
  const criteria = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 3);

  return criteria.length > 0 ? criteria : undefined;
}

export function countAcceptanceCriteria(raw: string): number {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

export function mergeSuggestedIntoCriteriaText(
  currentText: string,
  suggested: string[],
): string {
  const existingLines = currentText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const merged = mergeUserAndGeneratedCriteria(
    existingLines.length > 0 ? existingLines : undefined,
    suggested,
  );

  return merged.join("\n");
}

export function prepareTextareaForNewCriterion(currentText: string): string {
  if (currentText.length === 0) {
    return "";
  }
  if (currentText.endsWith("\n")) {
    return currentText;
  }
  return `${currentText}\n`;
}
