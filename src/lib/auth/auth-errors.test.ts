import { describe, expect, test } from "bun:test";
import {
  isSafeAuthErrorMessageForLogging,
  mapAuthError,
  mapRegistrationCreateUserError,
  mapSignupError,
} from "@/lib/auth/auth-errors";

describe("mapAuthError", () => {
  test("maps invalid credentials", () => {
    expect(mapAuthError({ message: "Invalid login credentials" })).toContain("Incorrect email or password");
  });

  test("maps duplicate registration", () => {
    expect(mapAuthError({ message: "User already registered" })).toContain("already exists");
  });

  test("maps weak password", () => {
    expect(mapAuthError({ message: "Password should be at least 6 characters" })).toContain(
      "minimum requirements",
    );
  });

  test("returns generic message for unknown errors", () => {
    expect(mapAuthError({ message: "unexpected upstream failure" })).toBe(
      "Something went wrong. Please try again.",
    );
  });
});

describe("mapSignupError", () => {
  test("maps existing user by error code", () => {
    expect(mapSignupError({ code: "user_already_exists" })).toEqual({
      status: "email_taken",
    });
    expect(mapSignupError({ code: "email_exists" })).toEqual({
      status: "email_taken",
    });
  });

  test("maps weak password by error code", () => {
    expect(mapSignupError({ code: "weak_password" })).toEqual({
      status: "weak_password",
    });
  });

  test("maps rate limiting safely", () => {
    expect(mapSignupError({ code: "over_email_send_rate_limit" })).toEqual({
      status: "rate_limited",
    });
    expect(mapSignupError({ message: "Email rate limit exceeded" })).toEqual({
      status: "rate_limited",
    });
  });

  test("returns generic error for unknown failures", () => {
    expect(mapSignupError({ message: "unexpected upstream failure" })).toEqual({
      status: "error",
    });
  });
});

describe("mapRegistrationCreateUserError", () => {
  test("maps existing user by error code", () => {
    expect(mapRegistrationCreateUserError({ code: "user_already_exists" })).toEqual({
      status: "email_taken",
    });
    expect(mapRegistrationCreateUserError({ code: "email_exists" })).toEqual({
      status: "email_taken",
    });
  });

  test("maps existing user by message", () => {
    expect(
      mapRegistrationCreateUserError({ message: "User already registered" }),
    ).toEqual({ status: "email_taken" });
  });

  test("maps weak password by error code", () => {
    expect(mapRegistrationCreateUserError({ code: "weak_password" })).toEqual({
      status: "weak_password",
    });
  });

  test("maps weak password by message", () => {
    expect(
      mapRegistrationCreateUserError({ message: "Password should be at least 6 characters" }),
    ).toEqual({ status: "weak_password" });
  });

  test("returns generic error for unknown failures", () => {
    expect(mapRegistrationCreateUserError({ message: "unexpected upstream failure" })).toEqual({
      status: "error",
    });
  });
});

describe("isSafeAuthErrorMessageForLogging", () => {
  test("allows generic operational messages", () => {
    expect(isSafeAuthErrorMessageForLogging("Database error checking email")).toBe(true);
  });

  test("rejects messages containing email addresses", () => {
    expect(isSafeAuthErrorMessageForLogging("Invalid email user@example.com")).toBe(false);
  });

  test("rejects messages containing credential-like content", () => {
    expect(isSafeAuthErrorMessageForLogging("Invalid API key sb_secret_example")).toBe(false);
    expect(isSafeAuthErrorMessageForLogging("password is required")).toBe(false);
  });
});
