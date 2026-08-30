import { describe, expect, mock, test } from "bun:test";

const setSessionMock = mock(async () => ({ error: null }));
const exchangeCodeForSessionMock = mock(async () => ({ error: null }));
const getSessionMock = mock(async () => ({ data: { session: null }, error: null }));

mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      setSession: setSessionMock,
      exchangeCodeForSession: exchangeCodeForSessionMock,
      getSession: getSessionMock,
    },
  },
}));

describe("establishSessionFromCallbackUrl", () => {
  test("creates session from PKCE auth code", async () => {
    const { establishSessionFromCallbackUrl } = await import("@/lib/auth-callback");

    const result = await establishSessionFromCallbackUrl(
      new URL("https://buildloop.example.com/auth/callback?code=abc123"),
    );

    expect(result).toEqual({ status: "session" });
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
  });

  test("creates session from implicit-flow tokens", async () => {
    const { establishSessionFromCallbackUrl } = await import("@/lib/auth-callback");

    const result = await establishSessionFromCallbackUrl(
      new URL("https://buildloop.example.com/auth/callback#access_token=at&refresh_token=rt"),
    );

    expect(result).toEqual({ status: "session" });
    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
  });
});
