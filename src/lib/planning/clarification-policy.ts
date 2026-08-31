import { isAmbiguousGoal } from "@/orchestrator/contract/derive-task-contract";
import type { BlockedReason } from "@/lib/sensitive-intent";
import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";
import type { PlanningSource, TaskClarification } from "./planning-source";
import { isPasswordResetGoal, isReadmeGoal } from "./planning-context";

export type ClarificationDecision = "CLEAR" | "MATERIAL_AMBIGUITY" | "SENSITIVE_OR_PROTECTED" | "SPEC_CONFLICT";

export type ResetMethodSignal = "email_link" | "otp" | "admin_reset";

export type ClarificationEvaluation = {
  decision: ClarificationDecision;
  question?: string;
  options?: string[];
  reason?: string;
  conflictSources?: PlanningSource[];
  inferredCriteria?: string[];
  clarification?: TaskClarification;
};

function extractResetMethodSignals(text: string): Set<ResetMethodSignal> {
  const normalized = text.toLowerCase();
  const signals = new Set<ResetMethodSignal>();
  if (
    /email link|magic link|reset link|password reset email|send a reset email|link in email/.test(
      normalized,
    )
  ) {
    signals.add("email_link");
  }
  if (/\botp\b|one[- ]time password|verification code|sms code|6-digit code/.test(normalized)) {
    signals.add("otp");
  }
  if (/admin reset|support reset|manual reset by admin/.test(normalized)) {
    signals.add("admin_reset");
  }
  return signals;
}

function signalsBySpecification(
  specifications: PlanningSpecificationEntry[],
): Array<{ spec: PlanningSpecificationEntry; signals: Set<ResetMethodSignal> }> {
  return specifications.map((spec) => ({
    spec,
    signals: extractResetMethodSignals(spec.content),
  }));
}

function resetMethodLabel(signal: ResetMethodSignal): string {
  switch (signal) {
    case "email_link":
      return "email link";
    case "otp":
      return "OTP";
    case "admin_reset":
      return "admin reset";
  }
}

function criteriaFromResetMethod(method: ResetMethodSignal, goal: string): string[] {
  switch (method) {
    case "email_link":
      return [
        "Password reset uses a secure email link flow.",
        "Reset requests do not reveal whether an account exists.",
        "Reset flow integrates with existing auth routes.",
        "Relevant auth tests pass.",
        "No protected paths are modified.",
      ];
    case "otp":
      return [
        "Password reset uses a one-time password (OTP) verification flow.",
        "OTP delivery and expiry are handled securely.",
        "Reset flow integrates with existing auth routes.",
        "Relevant auth tests pass.",
        "No protected paths are modified.",
      ];
    case "admin_reset":
      return [
        "Password reset is initiated through an admin-approved process.",
        "Reset flow is auditable and does not expose credentials.",
        "Relevant auth tests pass.",
        "No protected paths are modified.",
      ];
    default:
      return [`Implement the requested change: ${goal.trim()}`, "No protected paths are modified."];
  }
}

function parseClarificationAnswer(answer: string): ResetMethodSignal | null {
  const normalized = answer.toLowerCase();
  if (/email|link|magic link/.test(normalized)) {
    return "email_link";
  }
  if (/otp|one[- ]time|verification code|code/.test(normalized)) {
    return "otp";
  }
  if (/admin|support/.test(normalized)) {
    return "admin_reset";
  }
  return null;
}

function detectSpecConflict(
  specifications: PlanningSpecificationEntry[],
): { conflict: true; question: string; options: string[]; sources: PlanningSource[] } | { conflict: false } {
  const entries = signalsBySpecification(specifications).filter((entry) => entry.signals.size > 0);
  const allSignals = new Set<ResetMethodSignal>();
  for (const entry of entries) {
    for (const signal of entry.signals) {
      allSignals.add(signal);
    }
  }

  if (allSignals.size <= 1 || entries.length < 2) {
    return { conflict: false };
  }

  const prd = entries.find((entry) => entry.spec.documentType === "PRD");
  const frd = entries.find((entry) => entry.spec.documentType === "FRD");
  const left = prd ?? entries[0]!;
  const right = frd ?? entries.find((entry) => entry.spec.id !== left.spec.id)!;

  const leftSignal = [...left.signals][0];
  const rightSignal = [...right.signals].find((signal) => signal !== leftSignal) ?? [...right.signals][0];
  if (!leftSignal || !rightSignal || leftSignal === rightSignal) {
    return { conflict: false };
  }

  return {
    conflict: true,
    question: `${left.spec.documentType} specifies ${resetMethodLabel(leftSignal)} while ${right.spec.documentType} specifies ${resetMethodLabel(rightSignal)}. Which source should be authoritative for this task?`,
    options: [left.spec.documentType, right.spec.documentType],
    sources: [
      {
        sourceType: "specification",
        displayName: left.spec.filename,
        documentId: left.spec.id,
        section: "Password recovery",
      },
      {
        sourceType: "specification",
        displayName: right.spec.filename,
        documentId: right.spec.id,
        section: "Password recovery",
      },
    ],
  };
}

function inferResetMethodFromSpecs(
  specifications: PlanningSpecificationEntry[],
): ResetMethodSignal | null {
  const combined = new Set<ResetMethodSignal>();
  for (const entry of signalsBySpecification(specifications)) {
    for (const signal of entry.signals) {
      combined.add(signal);
    }
  }
  if (combined.size === 1) {
    return [...combined][0] ?? null;
  }
  return null;
}

export function evaluateClarificationPolicy(input: {
  goal: string;
  specifications: PlanningSpecificationEntry[];
  sensitiveBlocked: BlockedReason[];
  userCriteria?: string[];
  clarificationAnswer?: string;
  existingClarification?: TaskClarification;
}): ClarificationEvaluation {
  if (input.sensitiveBlocked.length > 0) {
    return { decision: "SENSITIVE_OR_PROTECTED" };
  }

  const goal = input.goal.trim();
  const userCriteria = input.userCriteria ?? [];
  const relevantSpecs = input.specifications;

  if (input.clarificationAnswer || input.existingClarification?.answer) {
    const answer = input.clarificationAnswer ?? input.existingClarification?.answer ?? "";
    if (isPasswordResetGoal(goal)) {
      const resolved =
        input.clarificationAnswer?.toLowerCase().includes("prd") ||
        input.clarificationAnswer?.toLowerCase().includes("frd")
          ? inferResetMethodFromSpecs(
              relevantSpecs.filter((spec) =>
                answer.toLowerCase().includes(spec.documentType.toLowerCase()),
              ),
            )
          : parseClarificationAnswer(answer);
      if (resolved) {
        return {
          decision: "CLEAR",
          inferredCriteria: criteriaFromResetMethod(resolved, goal),
        };
      }
    }
    return { decision: "CLEAR" };
  }

  if (isReadmeGoal(goal) && !isAmbiguousGoal(goal)) {
    return { decision: "CLEAR" };
  }

  if (userCriteria.length > 0 && !isPasswordResetGoal(goal)) {
    return { decision: "CLEAR" };
  }

  if (isPasswordResetGoal(goal)) {
    const conflict = detectSpecConflict(relevantSpecs);
    if (conflict.conflict) {
      return {
        decision: "SPEC_CONFLICT",
        question: conflict.question,
        options: conflict.options,
        reason: "Conflicting specification sources for password reset method.",
        conflictSources: conflict.sources,
      };
    }

    const inferred = inferResetMethodFromSpecs(relevantSpecs);
    if (inferred) {
      return {
        decision: "CLEAR",
        inferredCriteria: criteriaFromResetMethod(inferred, goal),
      };
    }

    if (relevantSpecs.length === 0 || !inferResetMethodFromSpecs(relevantSpecs)) {
      return {
        decision: "MATERIAL_AMBIGUITY",
        question: "How should users reset their password: email link or OTP?",
        options: ["Email link", "OTP"],
        reason: "Password reset method materially affects contract scope and acceptance criteria.",
      };
    }
  }

  if (isAmbiguousGoal(goal) && userCriteria.length === 0) {
    return {
      decision: "MATERIAL_AMBIGUITY",
      question:
        "Which exact files or directories may BuildLoop modify to complete this task?",
      reason: "Goal scope is too broad to derive a safe bounded contract.",
    };
  }

  return { decision: "CLEAR" };
}

export function buildClarificationRecord(input: {
  evaluation: ClarificationEvaluation;
  answer?: string;
}): TaskClarification | undefined {
  if (!input.evaluation.question) {
    return undefined;
  }

  const now = new Date().toISOString();
  return {
    question: input.evaluation.question,
    ...(input.evaluation.options ? { options: input.evaluation.options } : {}),
    reason: input.evaluation.reason ?? "Material ambiguity detected.",
    askedAt: now,
    ...(input.answer
      ? {
          answer: input.answer,
          answeredAt: now,
        }
      : {}),
  };
}

export function mergeUserAndGeneratedCriteria(
  userCriteria: string[] | undefined,
  generatedCriteria: string[],
): string[] {
  if (!userCriteria?.length) {
    return generatedCriteria;
  }
  const merged = [...userCriteria];
  for (const criterion of generatedCriteria) {
    if (!merged.some((existing) => existing.toLowerCase() === criterion.toLowerCase())) {
      merged.push(criterion);
    }
  }
  return merged;
}
