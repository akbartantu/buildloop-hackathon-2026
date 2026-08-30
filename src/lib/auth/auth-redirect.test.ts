import { describe, expect, test } from "bun:test";
import { AUTH_CALLBACK_PATH } from "@/lib/auth/signup-flow";
import {
  buildAuthCallbackUrl,
  buildGoogleOAuthRequest,
  buildServerAuthCallbackUrl,
  GOOGLE_OAUTH_PROVIDER,
} from "@/lib/auth/auth-redirect";

describe("buildAuthCallbackUrl", () => {
  test("uses explicit base URL with auth callback path", () => {
    expect(buildAuthCallbackUrl("https://buildloop.example.com")).toBe(
      `https://buildloop.example.com${AUTH_CALLBACK_PATH}`,
    );
  });

  test("preserves localhost development callback", () => {
    expect(buildAuthCallbackUrl("http://localhost:8080")).toBe(
      `http://localhost:8080${AUTH_CALLBACK_PATH}`,
    );
  });
});

describe("buildServerAuthCallbackUrl", () => {
  test("uses canonical server base URL for email signup redirects", () => {
    expect(buildServerAuthCallbackUrl("https://buildloop.example.com")).toBe(
      `https://buildloop.example.com${AUTH_CALLBACK_PATH}`,
    );
  });
});

describe("buildGoogleOAuthRequest", () => {
  test("invokes OAuth with google provider and callback redirect", () => {
    const redirectTo = `https://buildloop.example.com${AUTH_CALLBACK_PATH}`;
    expect(buildGoogleOAuthRequest(redirectTo)).toEqual({
      provider: GOOGLE_OAUTH_PROVIDER,
      options: { redirectTo },
    });
  });

  test("defaults redirect to auth callback URL helper", () => {
    const request = buildGoogleOAuthRequest(`https://buildloop.example.com${AUTH_CALLBACK_PATH}`);
    expect(request.provider).toBe("google");
    expect(request.options.redirectTo).toContain(AUTH_CALLBACK_PATH);
  });
});

describe("google sign-in button wiring", () => {
  test("uses buildGoogleOAuthRequest for signInWithOAuth", async () => {
    const source = await Bun.file(
      new URL("../../components/auth/google-sign-in-button.tsx", import.meta.url),
    ).text();

    expect(source).toContain("buildGoogleOAuthRequest");
    expect(source).toContain("signInWithOAuth");
    expect(source).not.toContain("service-role");
  });
});
