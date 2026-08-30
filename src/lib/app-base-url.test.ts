import { afterEach, describe, expect, test } from "bun:test";
import { getAppBaseUrl } from "./app-base-url";

const original = process.env["APP_BASE_URL"];

afterEach(() => {
  if (original === undefined) {
    delete process.env["APP_BASE_URL"];
  } else {
    process.env["APP_BASE_URL"] = original;
  }
});

describe("getAppBaseUrl", () => {
  test("falls back to local dev origin when unset", () => {
    delete process.env["APP_BASE_URL"];
    expect(getAppBaseUrl()).toBe("http://localhost:5173");
  });

  test("normalizes trailing slash", () => {
    process.env["APP_BASE_URL"] = "https://example.com/";
    expect(getAppBaseUrl()).toBe("https://example.com");
  });

  test("rejects non-http protocols", () => {
    process.env["APP_BASE_URL"] = "ftp://example.com";
    expect(() => getAppBaseUrl()).toThrow("http:");
  });
});
