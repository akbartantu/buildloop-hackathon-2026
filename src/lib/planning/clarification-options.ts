import type { PlanningSpecificationEntry } from "@/lib/specifications/specification-set-record";

export const CLARIFICATION_OTHER_OPTION_ID = "other";

export type ClarificationOption = {
  id: string;
  label: string;
  description: string;
  recommended?: boolean;
  recommendationReason?: string;
};

export type ClarificationChoiceSet = {
  question: string;
  options: ClarificationOption[];
  allowOther: boolean;
  presentationMode: "choices" | "free_text";
};

function slugId(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || `option-${index + 1}`;
}

export function dedupeClarificationOptions(options: ClarificationOption[]): ClarificationOption[] {
  const seen = new Set<string>();
  const output: ClarificationOption[] = [];
  for (const [index, option] of options.entries()) {
    const key = option.label.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push({
      ...option,
      id: option.id || slugId(option.label, index),
    });
  }
  return output;
}

export function normalizeChoiceSet(input: ClarificationChoiceSet): ClarificationChoiceSet {
  const options = dedupeClarificationOptions(input.options);
  if (input.presentationMode === "free_text" || options.length < 2) {
    return {
      question: input.question,
      options: [],
      allowOther: false,
      presentationMode: "free_text",
    };
  }
  return {
    ...input,
    options,
    allowOther: input.allowOther,
    presentationMode: "choices",
  };
}

export function resolveClarificationAnswer(input: {
  options: ClarificationOption[];
  selectedOptionId: string;
  customAnswer?: string;
}): string {
  if (input.selectedOptionId === CLARIFICATION_OTHER_OPTION_ID) {
    return input.customAnswer?.trim() ?? "";
  }
  const match = input.options.find((option) => option.id === input.selectedOptionId);
  return match?.label.trim() ?? "";
}

export function buildPasswordResetChoiceSet(
  specifications: PlanningSpecificationEntry[],
): ClarificationChoiceSet {
  const inferred = inferResetMethodFromSpecs(specifications);
  const recommendEmail = inferred !== "otp";

  return normalizeChoiceSet({
    question: "How should users reset their password?",
    allowOther: true,
    presentationMode: "choices",
    options: [
      {
        id: "email-link",
        label: "Email link",
        description: "Send a secure reset link by email. Fits most Supabase auth setups.",
        ...(recommendEmail
          ? {
              recommended: true,
              recommendationReason:
                "Safer default when no specification defines another method. Avoids OTP delivery setup.",
            }
          : {}),
      },
      {
        id: "otp",
        label: "OTP verification",
        description: "Verify identity with a one-time code before allowing a password reset.",
        ...(!recommendEmail && inferred === "otp"
          ? {
              recommended: true,
              recommendationReason: "Matches the reset method described in your specifications.",
            }
          : {}),
      },
    ],
  });
}

export function buildSpecConflictChoiceSet(input: {
  question: string;
  leftLabel: string;
  rightLabel: string;
  leftDescription: string;
  rightDescription: string;
}): ClarificationChoiceSet {
  return normalizeChoiceSet({
    question: input.question,
    allowOther: true,
    presentationMode: "choices",
    options: [
      {
        id: slugId(input.leftLabel, 0),
        label: input.leftLabel,
        description: input.leftDescription,
      },
      {
        id: slugId(input.rightLabel, 1),
        label: input.rightLabel,
        description: input.rightDescription,
      },
    ],
  });
}

export function buildScopeAmbiguityFreeText(question: string): ClarificationChoiceSet {
  return {
    question,
    options: [],
    allowOther: false,
    presentationMode: "free_text",
  };
}

type ResetMethodSignal = "email_link" | "otp";

function inferResetMethodFromSpecs(
  specifications: PlanningSpecificationEntry[],
): ResetMethodSignal | null {
  const combined = new Set<ResetMethodSignal>();
  for (const spec of specifications) {
    const text = spec.content.toLowerCase();
    if (/email link|magic link|reset link|password reset email/.test(text)) {
      combined.add("email_link");
    }
    if (/\botp\b|one[- ]time password|verification code/.test(text)) {
      combined.add("otp");
    }
  }
  if (combined.size === 1) {
    return [...combined][0] ?? null;
  }
  return null;
}

export function isValidChoiceOptions(
  options: ClarificationOption[] | undefined,
): options is ClarificationOption[] {
  return Array.isArray(options) && options.length >= 2 && options.every((item) => item.label.trim().length > 0);
}
