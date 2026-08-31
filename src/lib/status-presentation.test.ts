import { describe, expect, test } from "bun:test";

import {
  checkEvidencePresentation,
  presentationHasNonColorIndicator,
  progressVisualPresentation,
  taskStatusPresentation,
  taskStatusSemanticTone,
  verdictPresentation,
} from "@/lib/status-presentation";

describe("semantic status presentation", () => {
  test("PASS uses success semantic presentation", () => {
    const presentation = verdictPresentation("PASS", "en");
    expect(presentation?.tone).toBe("success");
    expect(presentation?.label).toBe("Passed");
    expect(presentation?.iconKind).toBe("check");
    expect(presentation?.badgeClass).toContain("status-pass");
  });

  test("FAILED uses critical semantic presentation", () => {
    const presentation = verdictPresentation("FAILED", "en");
    expect(presentation?.tone).toBe("critical");
    expect(presentation?.label).toBe("Failed");
    expect(presentation?.iconKind).toBe("x");
    expect(presentation?.badgeClass).toContain("destructive");
  });

  test("BLOCKED has distinct human-readable explanation", () => {
    const presentation = verdictPresentation("BLOCKED", "en");
    expect(presentation?.tone).toBe("attention");
    expect(presentation?.label).toBe("Blocked");
    expect(presentation?.iconKind).toBe("alert");
    expect(taskStatusPresentation("BLOCKED", "en").accessibleLabel).toBe("Blocked");
  });

  test("waiting and skipped are neutral", () => {
    const waiting = progressVisualPresentation("waiting", "en");
    const skipped = progressVisualPresentation("skipped", "en");
    expect(waiting.tone).toBe("neutral");
    expect(skipped.tone).toBe("neutral");
    expect(waiting.label).toBe("Waiting");
    expect(skipped.label).toBe("Skipped");
  });

  test("semantic UI does not rely only on color", () => {
    const pass = taskStatusPresentation("PASS", "en");
    const failed = taskStatusPresentation("FAILED", "en");
    expect(presentationHasNonColorIndicator(pass)).toBe(true);
    expect(presentationHasNonColorIndicator(failed)).toBe(true);
    expect(pass.iconKind).not.toBe(failed.iconKind);
    expect(pass.label).not.toBe(failed.label);
  });

  test("check evidence statuses map to semantic tones", () => {
    expect(checkEvidencePresentation("pass", "en").tone).toBe("success");
    expect(checkEvidencePresentation("fail", "en").tone).toBe("critical");
    expect(checkEvidencePresentation("skipped", "en").tone).toBe("neutral");
  });

  test("FAILED task list tone is critical not attention", () => {
    expect(taskStatusSemanticTone("FAILED")).toBe("critical");
    expect(taskStatusSemanticTone("BLOCKED")).toBe("attention");
    expect(taskStatusSemanticTone("AWAITING_APPROVAL")).toBe("attention");
  });
});
