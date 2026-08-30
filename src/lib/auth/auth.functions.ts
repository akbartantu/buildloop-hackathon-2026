import { createServerFn } from "@tanstack/react-start";
import { signUpSchema } from "@/lib/auth/auth-schema";
import { isDisposableEmailDomain, normalizeAuthEmail } from "@/lib/auth/disposable-email";

export type RegisterResult =
  | { status: "ok" }
  | { status: "needs_email_confirmation" }
  | { status: "disposable_email" }
  | { status: "email_taken" }
  | { status: "weak_password" }
  | { status: "validation_error"; message: string }
  | { status: "error" };

export const registerWithEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signUpSchema.parse(input))
  .handler(async ({ data }): Promise<RegisterResult> => {
    const email = normalizeAuthEmail(data.email);

    try {
      if (await isDisposableEmailDomain(email)) {
        return { status: "disposable_email" };
      }
    } catch {
      return { status: "error" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: false,
    });

    if (error) {
      const message = (error.message ?? "").toLowerCase();

      if (message.includes("already been registered") || message.includes("already exists")) {
        return { status: "email_taken" };
      }

      if (message.includes("password should be at least") || message.includes("weak password")) {
        return { status: "weak_password" };
      }

      console.error("registerWithEmail failed", error.message);
      return { status: "error" };
    }

    if (!created.user) {
      return { status: "error" };
    }

    if (!created.user.email_confirmed_at) {
      return { status: "needs_email_confirmation" };
    }

    return { status: "ok" };
  });
