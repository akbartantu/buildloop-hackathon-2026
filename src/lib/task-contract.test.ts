import { describe, expect, test } from "bun:test";
import { detectSensitiveIntent } from "./sensitive-intent";
import { MAX_ATTEMPTS, PROTECTED_PATHS, buildContract } from "./task-contract";

const SAFE_GOAL =
  "Perjelas penjelasan workspace agar pengguna baru memahami bahwa task dijalankan di sandbox dan tindakan sensitif membutuhkan approval.";

const BLOCKED_GOAL =
  "Tambahkan deployment otomatis ke production, simpan credential di .env, dan jalankan pada branch main.";

describe("task-contract", () => {
  test("maximum correction attempts default to 2", () => {
    expect(MAX_ATTEMPTS).toBe(2);
    expect(buildContract(SAFE_GOAL).maxAttempts).toBe(2);
  });

  test("protected path defaults are available", () => {
    expect(PROTECTED_PATHS.length).toBeGreaterThan(0);
    expect(buildContract(SAFE_GOAL).protectedPaths).toEqual([...PROTECTED_PATHS]);
  });

  test("contract builder is deterministic", () => {
    const first = buildContract(SAFE_GOAL);
    const second = buildContract(SAFE_GOAL);
    expect(first).toEqual(second);
  });

  test("safe task aligns with empty preflight", () => {
    expect(detectSensitiveIntent(SAFE_GOAL)).toEqual([]);
    expect(buildContract(SAFE_GOAL).goal).toBe(SAFE_GOAL.trim());
  });

  test("sensitive task aligns with blocked preflight", () => {
    expect(detectSensitiveIntent(BLOCKED_GOAL).length).toBeGreaterThan(0);
  });
});
