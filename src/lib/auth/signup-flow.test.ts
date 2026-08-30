import { describe, expect, test } from "bun:test";
import { AUTH_CALLBACK_PATH, interpretSignupResponse } from "@/lib/auth/signup-flow";

describe("interpretSignupResponse", () => {
  test("returns needs_email_confirmation when user exists without session", () => {
    expect(
      interpretSignupResponse({
        user: { identities: [{ id: "identity-1" }] },
        session: null,
      }),
    ).toEqual({ status: "needs_email_confirmation" });
  });

  test("returns ok when signup returns an active session", () => {
    expect(
      interpretSignupResponse({
        user: { identities: [{ id: "identity-1" }] },
        session: { access_token: "token" },
      }),
    ).toEqual({ status: "ok" });
  });

  test("returns email_taken when Supabase omits identities for existing users", () => {
    expect(
      interpretSignupResponse({
        user: { identities: [] },
        session: null,
      }),
    ).toEqual({ status: "email_taken" });
  });

  test("returns error when signup response is empty", () => {
    expect(
      interpretSignupResponse({
        user: null,
        session: null,
      }),
    ).toEqual({ status: "error" });
  });
});

describe("AUTH_CALLBACK_PATH", () => {
  test("remains the existing auth callback route", () => {
    expect(AUTH_CALLBACK_PATH).toBe("/auth/callback");
  });
});
