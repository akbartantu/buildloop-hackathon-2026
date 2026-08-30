import { describe, expect, test } from "bun:test";
import {
  isDemoGoal,
  resolveWorkerExecutionMode,
  selectWorker,
} from "@/orchestrator/worker/worker-selection";

describe("resolveWorkerExecutionMode", () => {
  test("uses real worker for public GitHub repository tasks", () => {
    expect(
      resolveWorkerExecutionMode(
        "Add a small deterministic health endpoint and update its focused test.",
        undefined,
        "https://github.com/example/example-repo",
      ),
    ).toBe("real");
  });

  test("keeps demo worker for demo goals on local workspace", () => {
    expect(
      resolveWorkerExecutionMode(
        "Tambahkan penjelasan sandbox approval workspace pada UI.",
        undefined,
        "buildloop-demo",
      ),
    ).toBe("demo");
  });
});

describe("selectWorker", () => {
  test("does not select DemoPassWorker for real repository tasks", () => {
    const selection = selectWorker({
      mode: "real",
      goal: "Add a small deterministic health endpoint and update its focused test.",
    });

    expect(selection.workerId).toBe("adk-gemini-worker");
    expect(selection.worker.id).toBe("adk-gemini-worker");
  });

  test("selects DemoPassWorker only for demo mode", () => {
    const selection = selectWorker({
      mode: "demo",
      goal: isDemoGoal("sandbox approval workspace") ? "sandbox approval workspace" : "demo",
    });

    expect(selection.workerId).toBe("demo-worker");
  });
});
