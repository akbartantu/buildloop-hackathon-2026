import { describe, expect, test } from "bun:test";

import { decide, hasOnlyNonSemanticFailures } from "@/orchestrator/decision/engine";
import type { CheckerResult } from "@/orchestrator/checker/deterministic-checker";

describe("decision engine irrelevant failures", () => {
  const commandOnlyFailure: CheckerResult = {
    evidence: [
      {
        category: "typecheck",
        name: "typecheck_bun_run_typecheck",
        status: "fail",
        summary: "Command failed: bun run typecheck",
        details: "exit=1",
        affectedFiles: [],
        severity: "error",
      },
      {
        category: "command",
        name: "required_commands",
        status: "skipped",
        summary: "Checker skipped command execution.",
        details: "",
        affectedFiles: [],
        severity: "info",
      },
    ],
    blocked: false,
    failed: true,
    passed: false,
  };

  test("hasOnlyNonSemanticFailures is true for command-only failures with empty allowlist", () => {
    expect(hasOnlyNonSemanticFailures(commandOnlyFailure, [])).toBe(true);
    expect(hasOnlyNonSemanticFailures(commandOnlyFailure, ["bun run typecheck"])).toBe(false);
  });

  test("irrelevant command failure does not consume semantic correction", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: commandOnlyFailure,
      correctionCount: 0,
      maximumCorrections: 2,
      allowedCommands: [],
      sourceStale: false,
    });
    expect(result.rule).toBe("IRRELEVANT_CHECK_FAILURE");
    expect(result.nextStatus).toBe("FAILED");
    expect(result.shouldCorrect).toBe(false);
    expect(result.outcome).toBe("FAILED");
  });

  test("semantic acceptance failure still allows correction", () => {
    const semanticFailure: CheckerResult = {
      evidence: [
        {
          category: "acceptance",
          name: "readme_goal_reflected",
          status: "fail",
          summary: "README does not appear to include the requested subtitle change.",
          details: "goal",
          affectedFiles: ["README.md"],
          severity: "error",
        },
      ],
      blocked: false,
      failed: true,
      passed: false,
    };
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: semanticFailure,
      correctionCount: 0,
      maximumCorrections: 2,
      allowedCommands: [],
      sourceStale: false,
    });
    expect(result.rule).toBe("CORRECTION_ALLOWED");
    expect(result.shouldCorrect).toBe(true);
  });
});
