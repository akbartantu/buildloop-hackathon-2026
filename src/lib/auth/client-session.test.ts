import { describe, expect, test } from "bun:test";

import { withAuthTimeout } from "./client-session";

describe("client-session", () => {
  test("withAuthTimeout resolves when promise completes in time", async () => {
    const result = await withAuthTimeout(Promise.resolve("ok"), 100, "test");
    expect(result).toBe("ok");
  });

  test("withAuthTimeout rejects when promise exceeds timeout", async () => {
    await expect(
      withAuthTimeout(
        new Promise<string>((resolve) => setTimeout(() => resolve("late"), 50)),
        5,
        "slow lookup",
      ),
    ).rejects.toThrow("slow lookup timed out");
  });
});
