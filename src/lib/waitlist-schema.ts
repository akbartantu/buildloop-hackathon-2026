import { z } from "zod";

export const waitlistRoles = [
  { value: "solo_builder", label: "Solo builder" },
  { value: "developer", label: "Developer" },
  { value: "product_manager", label: "Product manager" },
  { value: "founder", label: "Founder" },
  { value: "other", label: "Lainnya" },
] as const;

export const roleValues = waitlistRoles.map((r) => r.value) as [string, ...string[]];

export const PAIN_POINT_MAX = 500;

export const waitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: "Email wajib diisi." })
    .max(255, { message: "Email maksimal 255 karakter." })
    .email({ message: "Format email tidak valid." })
    .transform((v) => v.toLowerCase()),
  role: z.enum(roleValues, { message: "Peran wajib dipilih." }),
  painPoint: z
    .string()
    .trim()
    .max(PAIN_POINT_MAX, { message: `Maksimal ${PAIN_POINT_MAX} karakter.` })
    .optional(),
  consent: z.boolean().refine((v) => v === true, { message: "Persetujuan wajib dicentang." }),
  // Honeypot: harus tetap kosong untuk pengunjung sesungguhnya.
  trap: z.string().optional(),
});

export type WaitlistInput = z.input<typeof waitlistSchema>;
export type WaitlistParsed = z.output<typeof waitlistSchema>;

export type WaitlistResult =
  { status: "ok" } | { status: "duplicate" } | { status: "disposable_email" } | { status: "error" };

export const DISPOSABLE_EMAIL_MESSAGE =
  "Gunakan email permanen. Email temporer tidak dapat digunakan untuk mendaftar pilot.";
