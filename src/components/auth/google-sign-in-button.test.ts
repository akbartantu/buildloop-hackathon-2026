import { describe, expect, test } from "bun:test";
import { buildGoogleOAuthRequest } from "@/lib/auth/auth-redirect";
import { AUTH_CALLBACK_PATH } from "@/lib/auth/signup-flow";

describe("GoogleSignInButton OAuth flow", () => {
  test("buildGoogleOAuthRequest uses google provider", () => {
    const request = buildGoogleOAuthRequest(`https://buildloop.example.com${AUTH_CALLBACK_PATH}`);
    expect(request.provider).toBe("google");
  });

  test("redirect target is the auth callback route", () => {
    const request = buildGoogleOAuthRequest(`https://buildloop.example.com${AUTH_CALLBACK_PATH}`);
    expect(request.options.redirectTo).toBe(`https://buildloop.example.com${AUTH_CALLBACK_PATH}`);
  });
});
