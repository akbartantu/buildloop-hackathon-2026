import { describe, expect, test } from "bun:test";

import {
  countAttemptFileEntries,
  countUniqueChangedFiles,
} from "@/orchestrator/run-files";
import type { WorkerReport } from "@/orchestrator/types";

function workerReport(filesChanged: string[], summary: string): WorkerReport {
  return {
    workerId: "test-worker",
    attemptNumber: 1,
    filesChanged,
    commandsRequested: [],
    commandsExecuted: [],
    summary,
    patchSummary: summary,
  };
}

describe("run file accounting", () => {
  test("unique changed files use final worker attempt only", () => {
    const reports: WorkerReport[] = [
      workerReport(["README.md", "package.json"], "attempt 1"),
      workerReport(["README.md"], "attempt 2"),
      workerReport(["README.md", "README.md"], "attempt 3 duplicate entries"),
    ];
    expect(countUniqueChangedFiles(reports)).toBe(1);
    expect(countAttemptFileEntries(reports)).toBe(5);
  });

  test("README-only scenario reports one unique file", () => {
    const reports: WorkerReport[] = [
      workerReport(["README.md", "src/index.ts"], "wrong scope"),
      workerReport(["README.md"], "corrected"),
    ];
    expect(countUniqueChangedFiles(reports)).toBe(1);
  });
});
