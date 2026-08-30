import { afterEach, describe, expect, test } from "bun:test";

import {
  createDevAuthBypassUser,
  DEV_AUTH_BYPASS_EMAIL,
  DEV_AUTH_BYPASS_NAME,
  DEV_AUTH_BYPASS_USER_ID,
  evaluateDevAuthBypass,
} from "./dev-auth-bypass";
import {
  principalFromDevBypassUser,
  resolveDevBypassPrincipal,
} from "./auth/principal";

describe("evaluateDevAuthBypass", () => {
  test("activates only when development runtime and flag is true", () => {
    expect(evaluateDevAuthBypass({ isDevelopment: true, bypassFlag: "true" })).toBe(true);
  });

  test("refuses bypass when flag is false", () => {
    expect(evaluateDevAuthBypass({ isDevelopment: true, bypassFlag: "false" })).toBe(false);
  });

  test("refuses bypass when flag is absent", () => {
    expect(evaluateDevAuthBypass({ isDevelopment: true, bypassFlag: undefined })).toBe(false);
    expect(evaluateDevAuthBypass({ isDevelopment: true, bypassFlag: null })).toBe(false);
  });

  test("refuses bypass in production even when flag is true", () => {
    expect(evaluateDevAuthBypass({ isDevelopment: false, bypassFlag: "true" })).toBe(false);
  });
});

describe("createDevAuthBypassUser", () => {
  test("returns the expected local demo identity", () => {
    const user = createDevAuthBypassUser();
    expect(user.id).toBe(DEV_AUTH_BYPASS_USER_ID);
    expect(user.email).toBe(DEV_AUTH_BYPASS_EMAIL);
    expect(user.user_metadata["full_name"]).toBe(DEV_AUTH_BYPASS_NAME);
    expect(user.app_metadata.provider).toBe("dev-bypass");
  });

  test("does not include a JWT access token", () => {
    const user = createDevAuthBypassUser();
    expect(Object.keys(user)).not.toContain("access_token");
    expect(Object.keys(user)).not.toContain("token");
  });
});

describe("resolveDevBypassPrincipal", () => {
  const originalDevAuthBypass = process.env["DEV_AUTH_BYPASS"];
  const originalNodeEnv = process.env["NODE_ENV"];

  afterEach(() => {
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
  });

  test("returns development principal when bypass is enabled at runtime", () => {
    process.env["DEV_AUTH_BYPASS"] = "true";
    process.env["NODE_ENV"] = "development";

    const principal = resolveDevBypassPrincipal();
    expect(principal).not.toBeNull();
    expect(principal?.mode).toBe("dev-bypass");
    expect(principal?.userId).toBe(DEV_AUTH_BYPASS_USER_ID);
    expect(principal?.email).toBe(DEV_AUTH_BYPASS_EMAIL);
  });

  test("returns null when bypass flag is false in development", () => {
    process.env["DEV_AUTH_BYPASS"] = "false";
    process.env["NODE_ENV"] = "development";
    expect(resolveDevBypassPrincipal()).toBeNull();
  });

  test("returns null when bypass flag is absent in development", () => {
    delete process.env["DEV_AUTH_BYPASS"];
    process.env["NODE_ENV"] = "development";
    expect(resolveDevBypassPrincipal()).toBeNull();
  });

  test("returns null in production even when bypass flag is true", () => {
    process.env["DEV_AUTH_BYPASS"] = "true";
    process.env["NODE_ENV"] = "production";
    expect(resolveDevBypassPrincipal()).toBeNull();
  });

  test("principalFromDevBypassUser matches deterministic identity", () => {
    const principal = principalFromDevBypassUser();
    expect(principal.mode).toBe("dev-bypass");
    expect(principal.userId).toBe(DEV_AUTH_BYPASS_USER_ID);
  });
});
