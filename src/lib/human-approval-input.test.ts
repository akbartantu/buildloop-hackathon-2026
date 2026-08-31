import { describe, expect, test } from "bun:test";

import {
  requiresApprovalConfirmation,
  showsAdditionalReviewFields,
  showsRejectReasonField,
  showsRevisionNoteField,
  validateHumanApprovalForm,
} from "@/lib/human-approval-input";

describe("human approval form validation", () => {
  test("request revision cannot submit without note", () => {
    expect(
      validateHumanApprovalForm({
        decision: "REQUEST_REVISION",
      }),
    ).toBe("revision_note_required");
  });

  test("request revision accepts note", () => {
    expect(
      validateHumanApprovalForm({
        decision: "REQUEST_REVISION",
        note: "Preserve README content.",
      }),
    ).toBeNull();
  });

  test("reject works without reason", () => {
    expect(
      validateHumanApprovalForm({
        decision: "REJECT_CHANGES",
      }),
    ).toBeNull();
  });

  test("additional review requires review type and note", () => {
    expect(
      validateHumanApprovalForm({
        decision: "ESCALATE_REVIEW",
      }),
    ).toBe("review_type_required");

    expect(
      validateHumanApprovalForm({
        decision: "ESCALATE_REVIEW",
        reviewType: "technical",
      }),
    ).toBe("additional_review_note_required");
  });

  test("approve commit requires confirmation checkbox", () => {
    expect(
      validateHumanApprovalForm({
        decision: "APPROVE_COMMIT",
      }),
    ).toBe("confirm_required");

    expect(
      validateHumanApprovalForm({
        decision: "APPROVE_COMMIT",
        confirmedReview: true,
      }),
    ).toBeNull();
  });

  test("confirmation checkbox only applies to approve commit", () => {
    expect(requiresApprovalConfirmation("APPROVE_COMMIT")).toBe(true);
    expect(requiresApprovalConfirmation("REQUEST_REVISION")).toBe(false);
    expect(requiresApprovalConfirmation("REJECT_CHANGES")).toBe(false);
    expect(requiresApprovalConfirmation("ESCALATE_REVIEW")).toBe(false);
  });

  test("decision-specific fields visibility", () => {
    expect(showsRevisionNoteField("REQUEST_REVISION")).toBe(true);
    expect(showsRejectReasonField("REJECT_CHANGES")).toBe(true);
    expect(showsAdditionalReviewFields("ESCALATE_REVIEW")).toBe(true);
    expect(showsRevisionNoteField("APPROVE_COMMIT")).toBe(false);
  });
});
