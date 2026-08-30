import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  buildSignupEmailRedirectUrl,
  performSignupPrecheck,
} from "@/lib/auth/auth.functions";
import { AUTH_CALLBACK_PATH } from "@/lib/auth/signup-flow";
import { setBlocklistCheckerForTests } from "@/lib/auth/disposable-email";

const originalAppBaseUrl = process.env["APP_BASE_URL"];

describe("performSignupPrecheck", () => {
  const originalConsoleError = console.error;
  const consoleErrorMock = mock(() => {});

  afterEach(() => {
    setBlocklistCheckerForTests(null);
    console.error = originalConsoleError;
    consoleErrorMock.mockClear();

    if (originalAppBaseUrl === undefined) {
      delete process.env["APP_BASE_URL"];
    } else {
      process.env["APP_BASE_URL"] = originalAppBaseUrl;
    }
  });

  test("returns disposable_email for blocked domains", async () => {
    setBlocklistCheckerForTests(async () => true);

    const result = await performSignupPrecheck({
      email: "temp@mailinator.com",
      password: "secret123",
      confirmPassword: "secret123",
    });

    expect(result).toEqual({ status: "disposable_email" });
  });

  test("returns ok with auth callback redirect for permanent email", async () => {
    process.env["APP_BASE_URL"] = "https://buildloop.example.com/";
    setBlocklistCheckerForTests(async () => false);

    const result = await performSignupPrecheck({
      email: "builder@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });

    expect(result).toEqual({
      status: "ok",
      emailRedirectTo: `https://buildloop.example.com${AUTH_CALLBACK_PATH}`,
    });
  });

  test("returns generic error when blocklist lookup fails", async () => {
    console.error = consoleErrorMock;
    setBlocklistCheckerForTests(async () => {
      throw new Error("domain_check_failed");
    });

    const result = await performSignupPrecheck({
      email: "builder@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });

    expect(result).toEqual({ status: "error" });
    expect(consoleErrorMock).toHaveBeenCalledWith("[registration]", {
      phase: "registration_blocklist_check_failed",
    });
  });
});

describe("buildSignupEmailRedirectUrl", () => {
  afterEach(() => {
    if (originalAppBaseUrl === undefined) {
      delete process.env["APP_BASE_URL"];
    } else {
      process.env["APP_BASE_URL"] = originalAppBaseUrl;
    }
  });

  test("uses APP_BASE_URL for callback redirect", () => {
    expect(buildSignupEmailRedirectUrl("https://buildloop.example.com")).toBe(
      `https://buildloop.example.com${AUTH_CALLBACK_PATH}`,
    );
  });
});

describe("signup auth module security", () => {
  test("auth.functions.ts does not import service-role client", async () => {
    const source = await Bun.file(new URL("./auth.functions.ts", import.meta.url)).text();

    expect(source).not.toContain("client.server");
    expect(source).not.toContain("SERVICE_ROLE");
    expect(source).not.toContain("supabaseAdmin");
    expect(source).not.toContain("createUser");
  });

  test("sign-up route does not reference service-role credentials", async () => {
    const source = await Bun.file(new URL("../../routes/auth/sign-up.tsx", import.meta.url)).text();

    expect(source).not.toContain("SERVICE_ROLE");
    expect(source).not.toContain("client.server");
    expect(source).not.toContain("supabaseAdmin");
  });
});
