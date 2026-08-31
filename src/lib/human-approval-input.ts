import type { HumanGateDecision } from "@/lib/human-approval";

export const ADDITIONAL_REVIEW_TYPES = ["technical", "security", "product", "other"] as const;

export type AdditionalReviewType = (typeof ADDITIONAL_REVIEW_TYPES)[number];

export type HumanApprovalFormInput = {
  decision: HumanGateDecision;
  note?: string;
  reviewType?: AdditionalReviewType;
  confirmedReview?: boolean;
};

export type HumanApprovalFormError =
  | "confirm_required"
  | "revision_note_required"
  | "review_type_required"
  | "additional_review_note_required";

export function validateHumanApprovalForm(input: HumanApprovalFormInput): HumanApprovalFormError | null {
  if (input.decision === "APPROVE_COMMIT" && !input.confirmedReview) {
    return "confirm_required";
  }

  const note = input.note?.trim() ?? "";
  if (input.decision === "REQUEST_REVISION" && !note) {
    return "revision_note_required";
  }

  if (input.decision === "ESCALATE_REVIEW") {
    if (!input.reviewType) {
      return "review_type_required";
    }
    if (!note) {
      return "additional_review_note_required";
    }
  }

  return null;
}

export function requiresApprovalConfirmation(decision: HumanGateDecision): boolean {
  return decision === "APPROVE_COMMIT";
}

export function showsRevisionNoteField(decision: HumanGateDecision): boolean {
  return decision === "REQUEST_REVISION";
}

export function showsRejectReasonField(decision: HumanGateDecision): boolean {
  return decision === "REJECT_CHANGES";
}

export function showsAdditionalReviewFields(decision: HumanGateDecision): boolean {
  return decision === "ESCALATE_REVIEW";
}
