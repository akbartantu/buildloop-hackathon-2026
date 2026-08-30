import { z } from "zod";

export const AUTH_EMAIL_MAX = 255;
export const AUTH_PASSWORD_MIN = 6;

export const authEmailSchema = z
  .string()
  .trim()
  .min(1, { message: "Email is required." })
  .max(AUTH_EMAIL_MAX, { message: `Email must be at most ${AUTH_EMAIL_MAX} characters.` })
  .email({ message: "Enter a valid email address." })
  .transform((value) => value.toLowerCase());

export const authPasswordSchema = z
  .string()
  .min(1, { message: "Password is required." })
  .min(AUTH_PASSWORD_MIN, {
    message: `Password must be at least ${AUTH_PASSWORD_MIN} characters.`,
  });

export const signInSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1, { message: "Password is required." }),
});

export const signUpSchema = z
  .object({
    email: authEmailSchema,
    password: authPasswordSchema,
    confirmPassword: z.string().min(1, { message: "Please confirm your password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: authEmailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: authPasswordSchema,
    confirmPassword: z.string().min(1, { message: "Please confirm your password." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignInInput = z.input<typeof signInSchema>;
export type SignInParsed = z.output<typeof signInSchema>;
export type SignUpInput = z.input<typeof signUpSchema>;
export type SignUpParsed = z.output<typeof signUpSchema>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ForgotPasswordParsed = z.output<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ResetPasswordParsed = z.output<typeof resetPasswordSchema>;
