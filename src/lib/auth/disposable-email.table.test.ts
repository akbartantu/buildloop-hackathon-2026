import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const limitMock = mock(() => Promise.resolve({ data: [] as { domain: string }[], error: null }));
const inMock = mock(() => ({ limit: limitMock }));
const selectMock = mock(() => ({ in: inMock }));
const fromMock = mock(() => ({ select: selectMock }));

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: fromMock,
  },
}));

let isDisposableEmailDomain: typeof import("@/lib/auth/disposable-email").isDisposableEmailDomain;
let setBlocklistCheckerForTests: typeof import("@/lib/auth/disposable-email").setBlocklistCheckerForTests;

beforeAll(async () => {
  const module = await import("@/lib/auth/disposable-email");
  isDisposableEmailDomain = module.isDisposableEmailDomain;
  setBlocklistCheckerForTests = module.setBlocklistCheckerForTests;
});

describe("isDisposableEmailDomain table lookup", () => {
  afterEach(() => {
    setBlocklistCheckerForTests(null);
    limitMock.mockClear();
    inMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
  });

  test("allows permanent email domains via blocked_email_domains lookup", async () => {
    limitMock.mockImplementationOnce(() => Promise.resolve({ data: [], error: null }));

    await expect(isDisposableEmailDomain("builder@example.com")).resolves.toBe(false);

    expect(fromMock).toHaveBeenCalledWith("blocked_email_domains");
    expect(inMock).toHaveBeenCalledWith("domain", ["example.com"]);
  });

  test("blocks disposable domains via blocked_email_domains lookup", async () => {
    limitMock.mockImplementationOnce(() =>
      Promise.resolve({ data: [{ domain: "mailinator.com" }], error: null }),
    );

    await expect(isDisposableEmailDomain("temp@mailinator.com")).resolves.toBe(true);
    expect(inMock).toHaveBeenCalledWith("domain", ["mailinator.com"]);
  });

  test("throws when blocked_email_domains lookup fails", async () => {
    limitMock.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } }),
    );

    await expect(isDisposableEmailDomain("builder@example.com")).rejects.toThrow(
      "domain_check_failed",
    );
  });
});
