import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { createDraftContract, lockContract, reviseContract } from "./contract/schema";
import { decide } from "./decision/engine";
import { computeManifestRevision } from "./manifest/revision";

describe("orchestrator contract", () => {
  test("locked contract is immutable via lock helper", () => {
    const draft = createDraftContract({
      id: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      version: 1,
      goal: "Safe task goal for contract lock test",
      inScope: ["src/**"],
      outOfScope: ["deployment"],
      acceptanceCriteria: ["Checks pass"],
    });
    const locked = lockContract(draft);
    expect(locked.lockedAt).not.toBeNull();
    expect(() => lockContract(locked)).toThrow();
  });

  test("revision creates new version", () => {
    const locked = lockContract(
      createDraftContract({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        version: 1,
        goal: "Safe task goal for revision test",
        inScope: ["src/**"],
        outOfScope: ["deployment"],
        acceptanceCriteria: ["Checks pass"],
      }),
    );
    const next = reviseContract(locked, { acceptanceCriteria: ["Updated criterion"] });
    expect(next.version).toBe(2);
    expect(next.lockedAt).toBeNull();
  });
});

describe("decision engine", () => {
  test("preflight block does not invoke worker", () => {
    const result = decide({
      currentStatus: "INSPECTING",
      preflightSafe: false,
      checkerResult: null,
      correctionCount: 0,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.nextStatus).toBe("BLOCKED");
    expect(result.shouldInvokeWorker).toBe(false);
  });

  test("failed checks allow correction until limit", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: {
        evidence: [],
        blocked: false,
        failed: true,
        passed: false,
      },
      correctionCount: 1,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.nextStatus).toBe("NEEDS_CORRECTION");
    expect(result.shouldCorrect).toBe(true);
  });

  test("pass moves to awaiting approval", () => {
    const result = decide({
      currentStatus: "CHECKING",
      preflightSafe: true,
      checkerResult: {
        evidence: [],
        blocked: false,
        failed: false,
        passed: true,
      },
      correctionCount: 1,
      maximumCorrections: 2,
      sourceStale: false,
    });
    expect(result.verdict).toBe("PASS");
    expect(result.nextStatus).toBe("AWAITING_APPROVAL");
  });
});

describe("manifest revision", () => {
  test("computes stable revision hash", async () => {
    const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
    const first = await computeManifestRevision(root);
    const second = await computeManifestRevision(root);
    expect(first.revision).toBe(second.revision);
    expect(first.revision.length).toBe(64);
  });
});
