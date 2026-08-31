import { describe, expect, test } from "bun:test";

import { assertTaskProjectExecutionSafe } from "./execution-guard";
import type { TaskRecord } from "@/lib/tasks-schema";

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    workspace: "https://github.com/owner/a",
    goal: "Goal",
    status: "APPROVED_FOR_EXECUTION",
    contract: {
      goal: "Goal",
      inScope: ["README.md"],
      outOfScope: [],
      acceptanceCriteria: ["Done"],
      allowedActions: [],
      protectedPaths: [],
      requiredChecks: [],
      maxAttempts: 2,
    },
    blockedReasons: [],
    runnerState: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lockedAt: null,
    projectId: "11111111-1111-4111-8111-111111111111",
    sourceCommitSha: "abc1234567890abcdef1234567890abcdef123456",
    ...overrides,
  };
}

describe("assertTaskProjectExecutionSafe", () => {
  test("blocks execution when task project differs from active workspace", () => {
    expect(() =>
      assertTaskProjectExecutionSafe({
        task: task(),
        project: {
          repositoryUrl: "https://github.com/owner/a",
          connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
        },
        activeProjectId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow(/active workspace/i);
  });

  test("blocks execution when repository source mismatches project", () => {
    expect(() =>
      assertTaskProjectExecutionSafe({
        task: task({ workspace: "https://github.com/owner/b" }),
        project: {
          repositoryUrl: "https://github.com/owner/a",
          connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
        },
      }),
    ).toThrow(/repository source/i);
  });

  test("blocks execution when source commit mismatches project baseline", () => {
    expect(() =>
      assertTaskProjectExecutionSafe({
        task: task({ sourceCommitSha: "def4567890abcdef4567890abcdef4567890abcd" }),
        project: {
          repositoryUrl: "https://github.com/owner/a",
          connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
        },
      }),
    ).toThrow(/Repository changed since this contract was created/);
  });

  test("allows matching source commit A to A", () => {
    expect(() =>
      assertTaskProjectExecutionSafe({
        task: task({ sourceCommitSha: "abc1234567890abcdef1234567890abcdef123456" }),
        project: {
          repositoryUrl: "https://github.com/owner/a",
          connectedCommitSha: "abc1234567890abcdef1234567890abcdef123456",
        },
      }),
    ).not.toThrow();
  });

  test("allows demo tasks without project linkage", () => {
    expect(() =>
      assertTaskProjectExecutionSafe({
        task: task({ projectId: null, sourceCommitSha: null, workspace: "buildloop-demo" }),
        project: null,
        activeProjectId: null,
      }),
    ).not.toThrow();
  });
});
