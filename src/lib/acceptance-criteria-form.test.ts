import { describe, expect, test } from "bun:test";

import {
  countAcceptanceCriteria,
  mergeSuggestedIntoCriteriaText,
  parseAcceptanceCriteria,
  prepareTextareaForNewCriterion,
} from "./acceptance-criteria-form";

describe("acceptance criteria form helpers", () => {
  test("parseAcceptanceCriteria trims, ignores blank lines, and requires min length", () => {
    expect(parseAcceptanceCriteria("  First criterion  \n\nSecond one\n  ")).toEqual([
      "First criterion",
      "Second one",
    ]);
    expect(parseAcceptanceCriteria("ab\n\n")).toBeUndefined();
  });

  test("mergeSuggestedIntoCriteriaText preserves manual criteria without duplication", () => {
    const merged = mergeSuggestedIntoCriteriaText(
      "Only README.md is modified.\nCustom check added by user",
      ["Only README.md is modified.", "Existing README structure remains intact."],
    );

    expect(merged.split("\n")).toEqual([
      "Only README.md is modified.",
      "Custom check added by user",
      "Existing README structure remains intact.",
    ]);
  });

  test("mergeSuggestedIntoCriteriaText replaces empty textarea with suggested criteria", () => {
    expect(
      mergeSuggestedIntoCriteriaText("", ["Criterion A", "Criterion B"]),
    ).toBe("Criterion A\nCriterion B");
  });

  test("countAcceptanceCriteria ignores blank lines", () => {
    expect(countAcceptanceCriteria("One\n\n  Two  \n")).toBe(2);
    expect(countAcceptanceCriteria("\n\n")).toBe(0);
  });

  test("prepareTextareaForNewCriterion appends newline when needed", () => {
    expect(prepareTextareaForNewCriterion("Line one")).toBe("Line one\n");
    expect(prepareTextareaForNewCriterion("Line one\n")).toBe("Line one\n");
    expect(prepareTextareaForNewCriterion("")).toBe("");
  });

  test("manual criterion is included in parsed create payload", () => {
    const payload = parseAcceptanceCriteria(
      "Suggested item\nUser typed this extra criterion",
    );

    expect(payload).toEqual(["Suggested item", "User typed this extra criterion"]);
  });
});
