import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CLARIFICATION_OTHER_OPTION_ID,
  isValidChoiceOptions,
  type ClarificationOption,
} from "@/lib/planning/clarification-options";
import { useI18n } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/en";

export type ClarificationGateProps = {
  title?: string;
  intro?: string;
  reason?: string;
  question: string;
  choiceOptions?: ClarificationOption[];
  allowOther?: boolean;
  presentationMode?: "choices" | "free_text";
  selectedOptionId: string | null;
  customAnswer: string;
  onSelectOption: (optionId: string) => void;
  onCustomAnswerChange: (value: string) => void;
};

export function ClarificationGate({
  title,
  intro,
  reason,
  question,
  choiceOptions,
  allowOther = false,
  presentationMode = "free_text",
  selectedOptionId,
  customAnswer,
  onSelectOption,
  onCustomAnswerChange,
}: ClarificationGateProps) {
  const { t } = useI18n();
  const useChoices =
    presentationMode === "choices" && isValidChoiceOptions(choiceOptions) && choiceOptions.length >= 2;

  return (
    <div className="mt-4 rounded-md border border-status-review/40 bg-status-review/5 p-4">
      <p className="text-sm font-semibold text-foreground">
        {title ?? t("tasks.clarificationNeeded")}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {intro ?? t("tasks.clarificationIntro")}
      </p>
      {reason ? <p className="mt-2 text-xs text-muted-foreground">{reason}</p> : null}

      <fieldset className="mt-4 space-y-3">
        <legend className="text-sm font-medium text-foreground">{question}</legend>

        {useChoices ? (
          <div className="space-y-2" role="radiogroup" aria-label={question}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("tasks.clarificationSuggestedChoices")}
            </p>
            {choiceOptions.map((option) => {
              const selected = selectedOptionId === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                    selected
                      ? "border-ring bg-background shadow-sm"
                      : "border-border bg-card hover:bg-muted/30",
                  )}
                >
                  <input
                    type="radio"
                    name="clarification-choice"
                    className="mt-1"
                    checked={selected}
                    onChange={() => onSelectOption(option.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {option.label}
                      {option.recommended ? (
                        <span className="rounded-md border border-status-pass/40 bg-status-pass/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-pass">
                          {t("tasks.clarificationRecommended")}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                    {option.recommended && option.recommendationReason ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {option.recommendationReason}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}

            {allowOther ? (
              <label
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                  selectedOptionId === CLARIFICATION_OTHER_OPTION_ID
                    ? "border-ring bg-background shadow-sm"
                    : "border-border bg-card hover:bg-muted/30",
                )}
              >
                <input
                  type="radio"
                  name="clarification-choice"
                  className="mt-1"
                  checked={selectedOptionId === CLARIFICATION_OTHER_OPTION_ID}
                  onChange={() => onSelectOption(CLARIFICATION_OTHER_OPTION_ID)}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-foreground">
                    {t("tasks.clarificationOtherOption")}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {t("tasks.clarificationOtherDescription")}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        ) : null}

        {(!useChoices || selectedOptionId === CLARIFICATION_OTHER_OPTION_ID) && (
          <div className="space-y-2">
            <Label htmlFor="clarification-answer">
              {useChoices ? t("tasks.clarificationCustomDecisionLabel") : t("tasks.clarificationDecisionLabel")}
            </Label>
            <Textarea
              id="clarification-answer"
              value={customAnswer}
              onChange={(event) => onCustomAnswerChange(event.target.value)}
              placeholder={t("tasks.clarificationCustomPlaceholder")}
              rows={3}
            />
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function clarificationValidationMessageKey(input: {
  presentationMode?: "choices" | "free_text";
  choiceOptions?: ClarificationOption[];
  selectedOptionId: string | null;
  customAnswer: string;
}): TranslationKey | null {
  const useChoices =
    input.presentationMode === "choices" &&
    isValidChoiceOptions(input.choiceOptions) &&
    (input.choiceOptions?.length ?? 0) >= 2;

  if (!useChoices) {
    return input.customAnswer.trim() ? null : "tasks.clarificationDecisionRequired";
  }

  if (!input.selectedOptionId) {
    return "tasks.clarificationChoiceRequired";
  }

  if (input.selectedOptionId === CLARIFICATION_OTHER_OPTION_ID && !input.customAnswer.trim()) {
    return "tasks.clarificationOtherRequired";
  }

  return null;
}

export function resolveClarificationSubmission(input: {
  presentationMode?: "choices" | "free_text";
  choiceOptions?: ClarificationOption[];
  selectedOptionId: string | null;
  customAnswer: string;
}): { answer: string; selectedOptionId?: string; customAnswer?: string } {
  const useChoices =
    input.presentationMode === "choices" &&
    isValidChoiceOptions(input.choiceOptions) &&
    (input.choiceOptions?.length ?? 0) >= 2;

  if (!useChoices) {
    const answer = input.customAnswer.trim();
    return answer ? { answer, customAnswer: answer } : { answer: "" };
  }

  if (!input.selectedOptionId) {
    return { answer: "" };
  }

  if (input.selectedOptionId === CLARIFICATION_OTHER_OPTION_ID) {
    const answer = input.customAnswer.trim();
    return answer
      ? {
          answer,
          selectedOptionId: CLARIFICATION_OTHER_OPTION_ID,
          customAnswer: answer,
        }
      : { answer: "" };
  }

  const match = input.choiceOptions!.find((option) => option.id === input.selectedOptionId);
  const answer = match?.label.trim() ?? "";
  return answer
    ? {
        answer,
        selectedOptionId: input.selectedOptionId,
      }
    : { answer: "" };
}
