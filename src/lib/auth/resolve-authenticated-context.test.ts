import { afterEach, describe, expect, test } from "bun:test";

import { resolveDevBypassPrincipal } from "@/lib/auth/principal";
import { createDevTaskRepository } from "@/lib/tasks/dev-task-repository";
import { DEV_AUTH_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import { resolveAuthenticatedRequestContext } from "@/lib/auth/resolve-authenticated-context";

describe("resolveAuthenticatedRequestContext", () => {
  const originalDevAuthBypass = process.env["DEV_AUTH_BYPASS"];
  const originalNodeEnv = process.env["NODE_ENV"];
  const repo = createDevTaskRepository();

  afterEach(async () => {
    if (originalDevAuthBypass === undefined) {
      delete process.env["DEV_AUTH_BYPASS"];
    } else {
      process.env["DEV_AUTH_BYPASS"] = originalDevAuthBypass;
    }

    if (originalNodeEnv === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = originalNodeEnv;
    }

    await repo.resetForTests();
  });

  test("returns dev repository without Supabase when bypass is active", async () => {
    process.env["DEV_AUTH_BYPASS"] = "true";
    process.env["NODE_ENV"] = "development";

    const context = await resolveAuthenticatedRequestContext();
    expect(context.auth.mode).toBe("dev-bypass");
    expect(context.supabase).toBeUndefined();
    expect(context.tasks).toBeDefined();

    const task = await context.tasks.createTask({
      userId: context.auth.userId,
      goal: "Ubah teks penjelasan workspace menjadi lebih jelas.",
    });
    expect(task.status).toBe("CONTRACT_READY");
  });

  test("does not activate dev bypass when flag is false", () => {
    process.env["DEV_AUTH_BYPASS"] = "false";
    process.env["NODE_ENV"] = "development";
    expect(resolveDevBypassPrincipal()).toBeNull();
  });

  test("dev repository operations use development principal without JWT", async () => {
    process.env["DEV_AUTH_BYPASS"] = "true";
    process.env["NODE_ENV"] = "development";

    const context = await resolveAuthenticatedRequestContext();
    const created = await context.tasks.createTask({
      userId: DEV_AUTH_BYPASS_USER_ID,
      goal: "Ubah teks penjelasan workspace menjadi lebih jelas.",
    });
    const listed = await context.tasks.listTasks(DEV_AUTH_BYPASS_USER_ID);
    expect(listed.some((task) => task.id === created.id)).toBe(true);
  });
});
