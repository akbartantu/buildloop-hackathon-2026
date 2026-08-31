import { z } from "zod";

export const waitlistRoleValues = [
  "solo_builder",
  "developer",
  "product_manager",
  "founder",
  "other",
] as const;

export type WaitlistRoleValue = (typeof waitlistRoleValues)[number];

export const roleValues = [...waitlistRoleValues] as [string, ...string[]];

export const PAIN_POINT_MAX = 500;

export type WaitlistValidationMessages = {
  emailRequired: string;
  emailMax: string;
  emailInvalid: string;
  roleRequired: string;
  painMax: string;
  consentRequired: string;
};

export function createWaitlistSchema(messages: WaitlistValidationMessages) {
  return z.object({
    email: z
      .string()
      .trim()
      .min(1, { message: messages.emailRequired })
      .max(255, { message: messages.emailMax })
      .email({ message: messages.emailInvalid })
      .transform((v) => v.toLowerCase()),
    role: z.enum(roleValues, { message: messages.roleRequired }),
    painPoint: z
      .string()
      .trim()
      .max(PAIN_POINT_MAX, { message: messages.painMax })
      .optional(),
    consent: z.boolean().refine((v) => v === true, { message: messages.consentRequired }),
    trap: z.string().optional(),
  });
}

export const waitlistSchema = createWaitlistSchema({
  emailRequired: "Email is required.",
  emailMax: "Email must be at most 255 characters.",
  emailInvalid: "Enter a valid email address.",
  roleRequired: "Select a role.",
  painMax: `Maximum ${PAIN_POINT_MAX} characters.`,
  consentRequired: "Consent is required.",
});

export type WaitlistInput = z.input<typeof waitlistSchema>;
export type WaitlistParsed = z.output<typeof waitlistSchema>;

export type WaitlistResult =
  | { status: "ok" }
  | { status: "duplicate" }
  | { status: "disposable_email" }
  | { status: "error" };

export const DISPOSABLE_EMAIL_MESSAGE =
  "Use a permanent email address. Temporary email addresses cannot be used for pilot registration.";
