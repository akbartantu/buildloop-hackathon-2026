import { describe, expect, test } from "bun:test";
import { mapAuthError } from "@/lib/auth/auth-errors";

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
