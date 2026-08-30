import { describe, expect, test } from "bun:test";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/auth-schema";

describe("signInSchema", () => {
  test("accepts valid credentials", () => {
    const result = signInSchema.safeParse({
      email: "User@Example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  test("rejects empty email and password", () => {
    const result = signInSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid email", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "secret123" });
    expect(result.success).toBe(false);
  });
});

describe("signUpSchema", () => {
  test("accepts matching passwords", () => {
    const result = signUpSchema.safeParse({
      fullName: "Akbar Tantu",
      email: "builder@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe("Akbar Tantu");
    }
  });

  test("requires full name", () => {
    const result = signUpSchema.safeParse({
      fullName: "",
      email: "builder@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });
    expect(result.success).toBe(false);
  });

  test("rejects password mismatch", () => {
    const result = signUpSchema.safeParse({
      fullName: "Akbar Tantu",
      email: "builder@example.com",
      password: "secret123",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "confirmPassword")).toBe(true);
    }
  });

  test("rejects short password", () => {
    const result = signUpSchema.safeParse({
      fullName: "Akbar Tantu",
      email: "builder@example.com",
      password: "12345",
      confirmPassword: "12345",
    });
    expect(result.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  test("requires a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "user@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "bad" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  test("requires matching new passwords", () => {
    const ok = resetPasswordSchema.safeParse({
      password: "newpass123",
      confirmPassword: "newpass123",
    });
    const bad = resetPasswordSchema.safeParse({
      password: "newpass123",
      confirmPassword: "otherpass",
    });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });
});
