import { afterEach, describe, expect, test } from "bun:test";
import {
  extractDomainCandidates,
  isDisposableEmailDomain,
  normalizeAuthEmail,
  setBlocklistCheckerForTests,
} from "@/lib/auth/disposable-email";

describe("normalizeAuthEmail", () => {
  test("trims whitespace and lowercases", () => {
    expect(normalizeAuthEmail("  User@Example.COM  ")).toBe("user@example.com");
  });
});

describe("extractDomainCandidates", () => {
  test("builds suffix candidates for subdomain checks", () => {
    expect(extractDomainCandidates("mail.mailinator.com")).toEqual([
      "mail.mailinator.com",
      "mailinator.com",
    ]);
  });

  test("does not treat similar valid domains as disposable suffixes", () => {
    expect(extractDomainCandidates("company-mailinator.com")).toEqual(["company-mailinator.com"]);
    expect(extractDomainCandidates("company-mailinator.com")).not.toContain("mailinator.com");
  });
});

describe("isDisposableEmailDomain", () => {
  afterEach(() => {
    setBlocklistCheckerForTests(null);
  });

  test("allows permanent email domains", async () => {
    setBlocklistCheckerForTests(async (email) => !email.endsWith("@example.com"));
    await expect(isDisposableEmailDomain("builder@example.com")).resolves.toBe(false);
  });

  test("blocks disposable email domains", async () => {
    setBlocklistCheckerForTests(async (email) => email.endsWith("@mailinator.com"));
    await expect(isDisposableEmailDomain("temp@mailinator.com")).resolves.toBe(true);
  });

  test("blocks uppercase disposable domains after normalization", async () => {
    setBlocklistCheckerForTests(async (email) => email.endsWith("@mailinator.com"));
    await expect(isDisposableEmailDomain("  TEMP@MAILINATOR.COM ")).resolves.toBe(true);
  });

  test("does not block domains that only look similar", async () => {
    setBlocklistCheckerForTests(async (email) => email.endsWith("@mailinator.com"));
    await expect(isDisposableEmailDomain("user@company-mailinator.com")).resolves.toBe(false);
  });

  test("blocks subdomains of disposable domains when checker matches suffix rules", async () => {
    setBlocklistCheckerForTests(async (email) => {
      const domain = email.split("@")[1] ?? "";
      return domain === "mailinator.com" || domain.endsWith(".mailinator.com");
    });
    await expect(isDisposableEmailDomain("user@box.mailinator.com")).resolves.toBe(true);
  });
});
