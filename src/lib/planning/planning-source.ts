import type { ClarificationOption } from "./clarification-options";

export type PlanningSourceType =
  | "specification"
  | "repository_file"
  | "source_commit"
  | "clarification";

export type PlanningSource = {
  sourceType: PlanningSourceType;
  displayName: string;
  path?: string;
  section?: string;
  documentId?: string;
  setId?: string;
  setName?: string;
  fileRole?: string;
  sourceCommitSha?: string;
};

export type TaskClarification = {
  question: string;
  /** @deprecated Legacy flat labels; use choiceOptions when present. */
  options?: string[];
  choiceOptions?: ClarificationOption[];
  allowOther?: boolean;
  selectedOptionId?: string;
  customAnswer?: string;
  answer?: string;
  askedAt: string;
  answeredAt?: string;
  reason: string;
};

export function formatPlanningSourceLabel(source: PlanningSource): string {
  const section = source.section ? ` § ${source.section}` : "";
  const path = source.path ? source.path : source.displayName;
  return `${path}${section}`;
}
