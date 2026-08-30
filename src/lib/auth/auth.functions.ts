import { createServerFn } from "@tanstack/react-start";
import {
  isSafeAuthErrorMessageForLogging,
  mapRegistrationCreateUserError,
} from "@/lib/auth/auth-errors";
import { signUpSchema, type SignUpParsed } from "@/lib/auth/auth-schema";
import { isDisposableEmailDomain, normalizeAuthEmail } from "@/lib/auth/disposable-email";

export type RegisterResult =
  | { status: "ok" }
  | { status: "needs_email_confirmation" }
  | { status: "disposable_email" }
  | { status: "email_taken" }
  | { status: "weak_password" }
  | { status: "validation_error"; message: string }
  | { status: "error" };

type CreateUserArgs = {
  email: string;
  password: string;
  email_confirm: boolean;
};

type CreateUserResponse = {
  data: {
    user: {
      email_confirmed_at: string | null;
    } | null;
  };
  error: {
    message?: string;
    code?: string;
    status?: number;
  } | null;
};

type RegistrationAdminClient = {
  auth: {
    admin: {
      createUser: (args: CreateUserArgs) => Promise<CreateUserResponse>;
    };
  };
};

let registrationAdminOverride: RegistrationAdminClient | null = null;

/** Test hook — override the Supabase admin client used during registration. */
export function setRegistrationAdminForTests(client: RegistrationAdminClient | null): void {
  registrationAdminOverride = client;
}

async function getRegistrationAdmin(): Promise<RegistrationAdminClient> {
  if (registrationAdminOverride) {
    return registrationAdminOverride;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as RegistrationAdminClient;
}

function logRegistrationFailure(
  phase:
    | "registration_blocklist_check_failed"
    | "registration_create_user_failed"
    | "registration_create_user_empty",
  detail?: { code?: string; status?: number; message?: string },
): void {
  const payload: Record<string, string | number> = { phase };

  if (detail?.code) {
    payload.code = detail.code;
  }

  if (detail?.status !== undefined) {
    payload.status = detail.status;
  }

  if (detail?.message && isSafeAuthErrorMessageForLogging(detail.message)) {
    payload.message = detail.message;
  }

  console.error("[registration]", payload);
}

export async function performEmailRegistration(data: SignUpParsed): Promise<RegisterResult> {
  const email = normalizeAuthEmail(data.email);

  try {
    if (await isDisposableEmailDomain(email)) {
      return { status: "disposable_email" };
    }
  } catch {
    logRegistrationFailure("registration_blocklist_check_failed");
    return { status: "error" };
  }

  const supabaseAdmin = await getRegistrationAdmin();
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: false,
  });

  if (error) {
    const mapped = mapRegistrationCreateUserError(error);

    if (mapped.status === "error") {
      logRegistrationFailure("registration_create_user_failed", {
        code: error.code,
        status: error.status,
        message: error.message,
      });
    }

    return mapped;
  }

  if (!created.user) {
    logRegistrationFailure("registration_create_user_empty");
    return { status: "error" };
  }

  if (!created.user.email_confirmed_at) {
    return { status: "needs_email_confirmation" };
  }

  return { status: "ok" };
}

export const registerWithEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signUpSchema.parse(input))
  .handler(async ({ data }): Promise<RegisterResult> => performEmailRegistration(data));
