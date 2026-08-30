import { describe, expect, test } from "bun:test";

import { buildGitExecOptions, GIT_HOME_DIR, GIT_REMOTE_TIMEOUT_MS } from "@/orchestrator/workspace/git-exec-env";

describe("buildGitExecOptions", () => {
  test("uses writable HOME under tmp and disables terminal prompts", () => {
    const options = buildGitExecOptions(1024);
    expect(options.maxBuffer).toBe(1024);
    expect(options.timeout).toBe(GIT_REMOTE_TIMEOUT_MS);
    expect(options.env.HOME).toBe(GIT_HOME_DIR);
    expect(options.env.GIT_TERMINAL_PROMPT).toBe("0");
  });
});
