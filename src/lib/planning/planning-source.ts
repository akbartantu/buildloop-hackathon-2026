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

export const CLARIFICATION_TOPICS = [
  "BUSINESS_LOGIC",
  "UX_BEHAVIOR",
  "UX_DESIGN",
  "SECURITY",
  "DATA",
  "ARCHITECTURE",
  "SCOPE",
] as const;

export type ClarificationTopic = (typeof CLARIFICATION_TOPICS)[number];

export type ClarificationQuestionOption = ClarificationOption & {
  /** Stable value used for criteria generation and contract consistency checks. */
  value: string;
};

export type ClarificationQuestion = {
  id: string;
  topic: ClarificationTopic;
  question: string;
  reason: string;
  required: boolean;
  options: ClarificationQuestionOption[];
  allowOther: boolean;
  presentationMode?: "choices" | "free_text";
  recommendedOptionId?: string;
  assumptionOptionId?: string;
  assumptionLabel?: string;
  sourceReferences?: PlanningSource[];
};

export type ClarificationAnswerRecord = {
  questionId: string;
  selectedOptionId: string;
  customAnswer?: string;
  answer: string;
  answeredAt: string;
  usedAssumption?: boolean;
};

export type ClarificationInterviewMode = "none" | "recommended" | "required";

export type ClarificationInterviewRecord = {
  mode: Exclude<ClarificationInterviewMode, "none">;
  questions: ClarificationQuestion[];
  answers: ClarificationAnswerRecord[];
  assumptionSummary?: string;
  askedAt: string;
  completedAt?: string;
};

export type TaskClarification = {
  /** @deprecated Legacy single-question prompt; first interview question when present. */
  question?: string;
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
  interview?: ClarificationInterviewRecord;
};

export function formatPlanningSourceLabel(source: PlanningSource): string {
  const section = source.section ? ` § ${source.section}` : "";
  const path = source.path ? source.path : source.displayName;
  return `${path}${section}`;
}
