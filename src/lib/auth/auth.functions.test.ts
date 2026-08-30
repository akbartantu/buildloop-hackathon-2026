import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  performEmailRegistration,
  setRegistrationAdminForTests,
} from "@/lib/auth/auth.functions";
import { setBlocklistCheckerForTests } from "@/lib/auth/disposable-email";

describe("performEmailRegistration", () => {
  const originalConsoleError = console.error;
  const consoleErrorMock = mock(() => {});

  afterEach(() => {
    setBlocklistCheckerForTests(null);
    setRegistrationAdminForTests(null);
    console.error = originalConsoleError;
    consoleErrorMock.mockClear();
  });

  test("returns disposable_email for blocked domains", async () => {
    setBlocklistCheckerForTests(async () => true);

    const result = await performEmailRegistration({
      email: "temp@mailinator.com",
      password: "secret123",
      confirmPassword: "secret123",
    });

    expect(result).toEqual({ status: "disposable_email" });
  });

  test("returns generic error when blocklist lookup fails", async () => {
    console.error = consoleErrorMock;
    setBlocklistCheckerForTests(async () => {
      throw new Error("domain_check_failed");
    });

    const result = await performEmailRegistration({
      email: "builder@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });

    expect(result).toEqual({ status: "error" });
    expect(consoleErrorMock).toHaveBeenCalledWith("[registration]", {
      phase: "registration_blocklist_check_failed",
    });
  });

  test("maps existing user responses to email_taken", async () => {
    setBlocklistCheckerForTests(async () => false);
    setRegistrationAdminForTests({
      auth: {
        admin: {
          createUser: async () => ({
            data: { user: null },
            error: { code: "email_exists", message: "User already registered" },
          }),
        },
      },
    });

    const result = await performEmailRegistration({
      email: "builder@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });

    expect(result).toEqual({ status: "email_taken" });
  });

  test("maps weak password responses correctly", async () => {
    setBlocklistCheckerForTests(async () => false);
    setRegistrationAdminForTests({
      auth: {
        admin: {
          createUser: async () => ({
            data: { user: null },
            error: { code: "weak_password", message: "Password should be at least 6 characters" },
          }),
        },
      },
    });

    const result = await performEmailRegistration({
      email: "builder@example.com",
      password: "123",
      confirmPassword: "123",
    });

    expect(result).toEqual({ status: "weak_password" });
  });

  test("returns needs_email_confirmation for unconfirmed users", async () => {
    setBlocklistCheckerForTests(async () => false);
    setRegistrationAdminForTests({
      auth: {
        admin: {
          createUser: async () => ({
            data: { user: { email_confirmed_at: null } },
            error: null,
          }),
        },
      },
    });

    const result = await performEmailRegistration({
      email: "builder@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });

    expect(result).toEqual({ status: "needs_email_confirmation" });
  });

  test("does not log email addresses or secrets on createUser failure", async () => {
    console.error = consoleErrorMock;
    setBlocklistCheckerForTests(async () => false);
    setRegistrationAdminForTests({
      auth: {
        admin: {
          createUser: async () => ({
            data: { user: null },
            error: {
              code: "unexpected_failure",
              message: "Invalid email user@example.com with sb_secret_key",
              status: 500,
            },
          }),
        },
      },
    });

    const result = await performEmailRegistration({
      email: "builder@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });

    expect(result).toEqual({ status: "error" });
    expect(consoleErrorMock).toHaveBeenCalledWith("[registration]", {
      phase: "registration_create_user_failed",
      code: "unexpected_failure",
      status: 500,
    });

    const loggedPayload = JSON.stringify(consoleErrorMock.mock.calls);
    expect(loggedPayload).not.toContain("builder@example.com");
    expect(loggedPayload).not.toContain("secret123");
    expect(loggedPayload).not.toContain("sb_secret_key");
  });
});
