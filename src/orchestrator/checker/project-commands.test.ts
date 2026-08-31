import { describe, expect, test } from "bun:test";

import {
  detectProjectCommands,
  partitionContractCommandsByApplicability,
  requiredCommandsForContract,
} from "@/orchestrator/checker/project-commands";
import { deriveAllowedCommands } from "@/orchestrator/contract/derive-task-contract";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("requiredCommandsForContract", () => {
  test("README-only contract with empty allowlist does not require typecheck or test", async () => {
    const detected = await detectProjectCommands(workspaceRoot);
    expect(detected.hasPackageJson).toBe(true);
    expect(deriveAllowedCommands(["README.md"])).toEqual([]);
    expect(requiredCommandsForContract([], detected)).toEqual([]);
  });

  test("package-script allowlist without package.json yields skipped commands only", () => {
    const detected = {
      hasPackageJson: false,
      typecheck: null,
      test: null,
      lint: null,
      build: null,
    };
    const allowlist = ["bun run typecheck", "bun test", "bun run lint"];
    expect(partitionContractCommandsByApplicability(allowlist, detected)).toEqual({
      applicable: [],
      skipped: allowlist,
    });
  });

  test("code-changing contract still requires typecheck and test when allowlisted", async () => {
    const detected = await detectProjectCommands(workspaceRoot);
    const allowlist = deriveAllowedCommands(["src/lib/example.ts"]);
    expect(allowlist).toContain("bun run typecheck");
    expect(allowlist).toContain("bun test");
    const commands = requiredCommandsForContract(allowlist, detected);
    if (detected.typecheck) {
      expect(commands).toContain(detected.typecheck);
    }
    if (detected.test) {
      expect(commands).toContain(detected.test);
    }
  });

  test("stored locked contract commands remain authoritative", async () => {
    const detected = await detectProjectCommands(workspaceRoot);
    const stored = ["bun run lint"];
    expect(requiredCommandsForContract(stored, detected)).toEqual(
      stored.filter((command) => {
        if (command === detected.lint) return Boolean(detected.lint);
        return true;
      }),
    );
  });
});
