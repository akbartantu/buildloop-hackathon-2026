import { describe, expect, test } from "bun:test";

import { parseHashParamsForTest, resolveAuthCallbackFromParams } from "./auth-callback";

describe("resolveAuthCallbackFromParams", () => {
  test("returns error for OAuth error query params", () => {
    const result = resolveAuthCallbackFromParams(new URLSearchParams("error=access_denied"), new URLSearchParams());
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("cancelled");
    }
  });

  test("returns safe error for provider disabled callback", () => {
    const result = resolveAuthCallbackFromParams(
      new URLSearchParams("error=server_error&error_description=Provider+google+is+not+enabled"),
      new URLSearchParams(),
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("not available");
      expect(result.message).not.toContain("token");
    }
  });

  test("returns tokens when hash contains access and refresh tokens", () => {
    const hash = new URLSearchParams({
      access_token: "test-access",
      refresh_token: "test-refresh",
    });
    const result = resolveAuthCallbackFromParams(new URLSearchParams(), hash);
    expect(result).toEqual({
      status: "tokens",
      accessToken: "test-access",
      refreshToken: "test-refresh",
    });
  });

  test("returns code when query contains PKCE auth code", () => {
    const result = resolveAuthCallbackFromParams(new URLSearchParams("code=abc123"), new URLSearchParams());
    expect(result).toEqual({ status: "code", code: "abc123" });
  });

  test("returns pending when no auth params are present", () => {
    const result = resolveAuthCallbackFromParams(new URLSearchParams(), new URLSearchParams());
    expect(result).toEqual({ status: "pending" });
  });
});

describe("parseHashParamsForTest", () => {
  test("strips leading hash before parsing", () => {
    const params = parseHashParamsForTest("#access_token=one&refresh_token=two");
    expect(params.get("access_token")).toBe("one");
    expect(params.get("refresh_token")).toBe("two");
  });
});
