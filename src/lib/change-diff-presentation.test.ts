import { describe, expect, test } from "bun:test";

import {
  classifyDiffLine,
  countDiffLineChanges,
  diffLineClassName,
  formatDiffChangeSummary,
  isLargeDeletion,
} from "@/lib/change-diff-presentation";

const sampleDiff = `diff --git a/README.md b/README.md
index 1234567..89abcde 100644
--- a/README.md
+++ b/README.md
@@ -1,3 +1,4 @@
 unchanged context
-old line removed
+new line added
 context line
`;

describe("change diff presentation", () => {
  test("counts +1/-1 correctly for README-style diff", () => {
    const counts = countDiffLineChanges(sampleDiff);
    expect(counts.added).toBe(1);
    expect(counts.removed).toBe(1);
    expect(formatDiffChangeSummary(counts)).toBe("+1 added · -1 removed");
  });

  test("does not count +++ and --- metadata lines as changed lines", () => {
    expect(classifyDiffLine("--- a/README.md")).toBe("meta");
    expect(classifyDiffLine("+++ b/README.md")).toBe("meta");
    expect(classifyDiffLine("+actual addition")).toBe("added");
    expect(classifyDiffLine("-actual removal")).toBe("removed");

    const counts = countDiffLineChanges("--- a/file\n+++ b/file\n+added\n-removed");
    expect(counts.added).toBe(1);
    expect(counts.removed).toBe(1);
  });

  test("added and removed lines use semantic classes", () => {
    expect(diffLineClassName("added")).toContain("emerald");
    expect(diffLineClassName("removed")).toContain("red");
  });

  test("hunk and meta lines use neutral styling", () => {
    expect(diffLineClassName("hunk")).toContain("muted-foreground");
    expect(diffLineClassName("meta")).toContain("muted-foreground");
    expect(classifyDiffLine("@@ -1,3 +1,4 @@")).toBe("hunk");
    expect(classifyDiffLine("diff --git a/x b/x")).toBe("meta");
  });

  test("large deletion warning threshold", () => {
    const removedLines = Array.from({ length: 25 }, (_, index) => `-line ${index}`).join("\n");
    const diff = `--- a/README.md\n+++ b/README.md\n+one addition\n${removedLines}`;
    const counts = countDiffLineChanges(diff);
    expect(counts.removed).toBe(25);
    expect(counts.added).toBe(1);
    expect(isLargeDeletion(counts)).toBe(true);
  });

  test("small balanced edits do not trigger large deletion warning", () => {
    const counts = countDiffLineChanges(sampleDiff);
    expect(isLargeDeletion(counts)).toBe(false);
  });
});
