import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CLARIFICATION_OTHER_OPTION_ID,
  isValidChoiceOptions,
} from "@/lib/planning/clarification-options";
import type {
  ClarificationAnswerRecord,
  ClarificationInterviewMode,
  ClarificationQuestion,
} from "@/lib/planning/planning-source";
import type { ClarificationAnswerInput } from "@/lib/planning/clarification-interview";
import { applyAdaptiveQuestionFilter } from "@/lib/planning/clarification-interview";
import { useI18n } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/en";

export type ClarificationInterviewProps = {
  mode: ClarificationInterviewMode;
  questions: ClarificationQuestion[];
  initialAnswers?: ClarificationAnswerInput[];
  assumptionSummary?: string;
  onComplete: (answers: ClarificationAnswerInput[], options?: { proceedWithAssumption?: boolean }) => void;
  onCancel?: () => void;
};

type Step = "interview" | "review";

function topicLabelKey(topic: ClarificationQuestion["topic"]): TranslationKey {
  switch (topic) {
    case "BUSINESS_LOGIC":
      return "tasks.clarificationTopicBusinessLogic";
    case "UX_BEHAVIOR":
      return "tasks.clarificationTopicUxBehavior";
    case "UX_DESIGN":
      return "tasks.clarificationTopicUxDesign";
    case "SECURITY":
      return "tasks.clarificationTopicSecurity";
    case "DATA":
      return "tasks.clarificationTopicData";
    case "ARCHITECTURE":
      return "tasks.clarificationTopicArchitecture";
    default:
      return "tasks.clarificationTopicScope";
  }
}

export function ClarificationInterview({
  mode,
  questions,
  initialAnswers = [],
  assumptionSummary,
  onComplete,
  onCancel,
}: ClarificationInterviewProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("interview");
  const [answers, setAnswers] = useState<ClarificationAnswerInput[]>(initialAnswers);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [customAnswer, setCustomAnswer] = useState("");

  const pendingQuestions = useMemo(
    () => applyAdaptiveQuestionFilter(questions, answers),
    [questions, answers],
  );

  const currentQuestion = pendingQuestions[currentIndex] ?? pendingQuestions[0];
  const totalQuestions = pendingQuestions.length;
  const progressCurrent = Math.min(currentIndex + 1, totalQuestions);

  function restoreDraftForQuestion(question: ClarificationQuestion | undefined) {
    if (!question) {
      setSelectedOptionId(null);
      setCustomAnswer("");
      return;
    }
    const existing = answers.find((entry) => entry.questionId === question.id);
    setSelectedOptionId(existing?.selectedOptionId ?? null);
    setCustomAnswer(existing?.customAnswer ?? "");
  }

  function validationError(question: ClarificationQuestion): TranslationKey | null {
    const useChoices =
      question.presentationMode === "choices" &&
      isValidChoiceOptions(question.options) &&
      question.options.length >= 2;

    if (question.presentationMode === "free_text") {
      return customAnswer.trim() ? null : "tasks.clarificationDecisionRequired";
    }

    if (!useChoices) {
      return customAnswer.trim() ? null : "tasks.clarificationDecisionRequired";
    }

    if (!selectedOptionId) {
      return "tasks.clarificationChoiceRequired";
    }

    if (selectedOptionId === CLARIFICATION_OTHER_OPTION_ID && !customAnswer.trim()) {
      return "tasks.clarificationOtherRequired";
    }

    return null;
  }

  function persistCurrentAnswer(): ClarificationAnswerInput[] | null {
    if (!currentQuestion) {
      return null;
    }
    const error = validationError(currentQuestion);
    if (error) {
      return null;
    }

    const entry: ClarificationAnswerInput = {
      questionId: currentQuestion.id,
      selectedOptionId:
        currentQuestion.presentationMode === "free_text"
          ? CLARIFICATION_OTHER_OPTION_ID
          : (selectedOptionId ?? CLARIFICATION_OTHER_OPTION_ID),
      ...(customAnswer.trim() ? { customAnswer: customAnswer.trim() } : {}),
    };

    const next = [...answers.filter((item) => item.questionId !== currentQuestion.id), entry];
    setAnswers(next);
    return next;
  }

  function handleNext() {
    const nextAnswers = persistCurrentAnswer();
    if (!nextAnswers || !currentQuestion) {
      return;
    }

    const remaining = applyAdaptiveQuestionFilter(questions, nextAnswers);
    if (currentIndex >= remaining.length - 1) {
      setStep("review");
      return;
    }

    const nextQuestion = remaining[currentIndex + 1];
    setCurrentIndex((index) => Math.min(index + 1, remaining.length - 1));
    restoreDraftForQuestion(nextQuestion);
  }

  function handleBack() {
    if (step === "review") {
      setStep("interview");
      restoreDraftForQuestion(pendingQuestions[pendingQuestions.length - 1]);
      setCurrentIndex(Math.max(pendingQuestions.length - 1, 0));
      return;
    }

    if (currentIndex === 0) {
      return;
    }

    const previousIndex = currentIndex - 1;
    setCurrentIndex(previousIndex);
    restoreDraftForQuestion(pendingQuestions[previousIndex]);
  }

  function handleProceedWithAssumption() {
    onComplete(answers, { proceedWithAssumption: true });
  }

  function handleGenerateCriteria() {
    if (step === "interview") {
      const nextAnswers = persistCurrentAnswer();
      if (!nextAnswers) {
        return;
      }
      onComplete(nextAnswers);
      return;
    }
    onComplete(answers);
  }

  if (!currentQuestion && step === "interview") {
    return null;
  }

  const useChoices =
    currentQuestion?.presentationMode === "choices" &&
    isValidChoiceOptions(currentQuestion.options) &&
    currentQuestion.options.length >= 2;

  return (
    <div className="mt-4 rounded-md border border-status-review/40 bg-status-review/5 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("tasks.clarificationInterviewLabel")}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{t("tasks.clarificationResolveDecisions")}</p>

      {step === "interview" && currentQuestion ? (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("tasks.clarificationQuestionProgress", {
              current: progressCurrent,
              total: totalQuestions,
            })}
          </p>
          <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {t(topicLabelKey(currentQuestion.topic))}
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">{currentQuestion.question}</p>
          {currentQuestion.reason ? (
            <p className="mt-2 text-xs text-muted-foreground">{currentQuestion.reason}</p>
          ) : null}

          <fieldset className="mt-4 space-y-3">
            {useChoices ? (
              <div className="space-y-2" role="radiogroup" aria-label={currentQuestion.question}>
                {currentQuestion.options.map((option) => {
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
                        name={`clarification-${currentQuestion.id}`}
                        className="mt-1 shrink-0"
                        checked={selected}
                        onChange={() => {
                          setSelectedOptionId(option.id);
                          if (option.id !== CLARIFICATION_OTHER_OPTION_ID) {
                            setCustomAnswer("");
                          }
                        }}
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
                      </span>
                    </label>
                  );
                })}

                {currentQuestion.allowOther ? (
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
                      name={`clarification-${currentQuestion.id}`}
                      className="mt-1 shrink-0"
                      checked={selectedOptionId === CLARIFICATION_OTHER_OPTION_ID}
                      onChange={() => setSelectedOptionId(CLARIFICATION_OTHER_OPTION_ID)}
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
                <Label htmlFor="clarification-interview-custom">
                  {useChoices
                    ? t("tasks.clarificationCustomDecisionLabel")
                    : t("tasks.clarificationDecisionLabel")}
                </Label>
                <Textarea
                  id="clarification-interview-custom"
                  value={customAnswer}
                  onChange={(event) => setCustomAnswer(event.target.value)}
                  placeholder={t("tasks.clarificationCustomPlaceholder")}
                  rows={3}
                />
              </div>
            )}
          </fieldset>
        </>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-foreground">{t("tasks.clarificationDecisionsSummary")}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {answers.map((entry) => {
              const question = questions.find((item) => item.id === entry.questionId);
              const label =
                question?.options.find((option) => option.id === entry.selectedOptionId)?.label ??
                entry.customAnswer ??
                entry.selectedOptionId;
              return (
                <li key={entry.questionId} className="rounded-md border border-border bg-card px-3 py-2">
                  <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                    {question ? t(topicLabelKey(question.topic)) : entry.questionId}
                  </span>
                  <span className="mt-1 block text-foreground">{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(step === "review" || currentIndex > 0) && (
          <Button type="button" variant="outline" size="sm" onClick={handleBack}>
            {t("tasks.clarificationBack")}
          </Button>
        )}
        {step === "interview" && currentIndex < totalQuestions - 1 ? (
          <Button type="button" size="sm" onClick={handleNext}>
            {t("tasks.clarificationNextQuestion")}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={handleGenerateCriteria}>
            {step === "review"
              ? t("tasks.clarificationGenerateCriteria")
              : t("tasks.clarificationReviewDecisions")}
          </Button>
        )}
        {mode === "recommended" && assumptionSummary ? (
          <Button type="button" variant="secondary" size="sm" onClick={handleProceedWithAssumption}>
            {t("tasks.clarificationProceedWithAssumption")}
          </Button>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function toClarificationAnswerInputs(
  records: ClarificationAnswerRecord[],
): ClarificationAnswerInput[] {
  return records.map((entry) => ({
    questionId: entry.questionId,
    selectedOptionId: entry.selectedOptionId,
    ...(entry.customAnswer ? { customAnswer: entry.customAnswer } : {}),
  }));
}
