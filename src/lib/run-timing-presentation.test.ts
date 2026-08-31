import { describe, expect, test } from "bun:test";

import { buildContract, zeroChangeRunnerState } from "@/lib/task-contract";
import type { TaskRecord } from "@/lib/tasks-schema";
import { formatHumanApprovalAuditEntry } from "@/lib/human-approval-presentation";
import {
  buildAttemptHistoryViewModels,
  buildCurrentRunTimingViewModel,
  buildRunHistoryTimingViewModel,
  computePersistedDurationMs,
  formatMissingTimestamp,
  formatPersistedDateTime,
  formatPersistedTime,
  resolveLocaleTag,
} from "@/lib/run-timing-presentation";
import type { TaskRunSnapshot } from "@/lib/task-rerun";

function completedTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    workspace: "buildloop-demo",
    goal: "Update README",
    status: "AWAITING_APPROVAL",
    contract: buildContract("Update README"),
    blockedReasons: [],
    runnerState: {
      ...zeroChangeRunnerState("PASS"),
      runnerInvoked: true,
      runId: "run-pass-1",
      correctionCount: 0,
      evidence: [
        { category: "acceptance", name: "readme", status: "pass", summary: "ok", attemptNumber: 1 },
      ],
    },
    createdAt: "2026-08-31T07:00:00.000Z",
    updatedAt: "2026-08-31T07:24:02.000Z",
    lockedAt: "2026-08-31T07:23:41.000Z",
    projectId: null,
    sourceCommitSha: null,
    ...overrides,
  };
}

describe("run timing presentation", () => {
  test("run start/completion timestamps render from persisted data", () => {
    const timing = buildCurrentRunTimingViewModel(completedTask(), "en");
    expect(timing?.startedAtIso).toBe("2026-08-31T07:23:41.000Z");
    expect(timing?.completedAtIso).toBe("2026-08-31T07:24:02.000Z");
    expect(timing?.startedAtLabel).toContain("2026");
    expect(timing?.completedAtLabel).toContain("2026");
    expect(formatPersistedTime("2026-08-31T07:23:41.000Z", "en")).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  test("total duration is calculated correctly", () => {
    const durationMs = computePersistedDurationMs(
      "2026-08-31T07:23:41.000Z",
      "2026-08-31T07:24:02.000Z",
    );
    expect(durationMs).toBe(21_000);

    const timing = buildCurrentRunTimingViewModel(completedTask(), "en");
    expect(timing?.durationLabel).toBe("21s");
    expect(timing?.durationIsElapsed).toBe(false);
  });

  test("missing timestamps do not create fabricated durations", () => {
    expect(computePersistedDurationMs(null, "2026-08-31T07:24:02.000Z")).toBeNull();
    expect(computePersistedDurationMs("2026-08-31T07:23:41.000Z", null)).toBeNull();
    expect(computePersistedDurationMs("invalid", "2026-08-31T07:24:02.000Z")).toBeNull();

    const timing = buildCurrentRunTimingViewModel(
      completedTask({
        lockedAt: null,
        runnerState: {
          ...zeroChangeRunnerState("draft"),
          runnerInvoked: false,
        },
      }),
      "en",
    );
    expect(timing).toBeNull();

    const historyTiming = buildRunHistoryTimingViewModel(
      {
        runNumber: 1,
        runId: "run-old",
        status: "FAILED",
        verdict: "FAILED",
        contractVersion: 1,
        startedAt: "",
        finishedAt: "",
        correctionCount: 0,
        filesChanged: 0,
      } satisfies TaskRunSnapshot,
      "en",
    );
    expect(historyTiming.durationLabel).toBeNull();
    expect(historyTiming.startedAtLabel).toBe(formatMissingTimestamp("en"));
  });

  test("approval decisions show their recorded timestamps", () => {
    const audit = formatHumanApprovalAuditEntry(
      {
        decision: "REQUEST_REVISION",
        createdAt: "2026-08-31T07:24:45.000Z",
        note: "Preserve the existing README content and only add the requested sentence.",
        runId: "run-pass-1",
      },
      "en",
    );
    expect(audit.decisionLabel).toBe("Request revision");
    expect(audit.timestamp).toContain("2026");
    expect(audit.timestampTime).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(audit.note).toContain("Preserve the existing README");
  });

  test("timestamp formatting respects EN/ID locale", () => {
    const iso = "2026-08-31T07:24:45.000Z";
    expect(resolveLocaleTag("en")).toBe("en-GB");
    expect(resolveLocaleTag("id")).toBe("id-ID");

    const enLabel = formatPersistedDateTime(iso, "en");
    const idLabel = formatPersistedDateTime(iso, "id");
    expect(enLabel).toBeTruthy();
    expect(idLabel).toBeTruthy();
    expect(enLabel).not.toBe(idLabel);
  });

  test("old records without timing data load gracefully", () => {
    const legacyTask = completedTask({
      lockedAt: null,
      updatedAt: "2026-08-31T07:24:02.000Z",
      runnerState: {
        ...zeroChangeRunnerState("legacy"),
        runnerInvoked: true,
        runId: "run-legacy",
        evidence: [
          { category: "test", name: "test", status: "pass", summary: "ok", attemptNumber: 1 },
        ],
        humanApprovals: [
          {
            decision: "APPROVE_COMMIT",
            action: "COMMIT",
            actorUserId: "user-1",
            runId: "run-legacy",
            note: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    const timing = buildCurrentRunTimingViewModel(legacyTask, "en");
    expect(timing?.startedAtIso).toBe("2026-08-31T07:24:02.000Z");
    expect(timing?.startedAtLabel).toContain("2026");

    const attempts = buildAttemptHistoryViewModels(legacyTask, "en");
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0]?.hasTiming).toBe(false);
    expect(attempts[0]?.durationLabel).toBeNull();
  });
});
