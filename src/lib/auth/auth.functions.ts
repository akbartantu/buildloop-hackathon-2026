import { createServerFn } from "@tanstack/react-start";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { signUpSchema, type SignUpParsed } from "@/lib/auth/auth-schema";
import { AUTH_CALLBACK_PATH } from "@/lib/auth/signup-flow";
import { isDisposableEmailDomain, normalizeAuthEmail } from "@/lib/auth/disposable-email";

export type SignupPrecheckResult =
  | { status: "ok"; emailRedirectTo: string }
  | { status: "disposable_email" }
  | { status: "validation_error"; message: string }
  | { status: "error" };

function logPrecheckFailure(phase: "registration_blocklist_check_failed"): void {
  console.error("[registration]", { phase });
}

export function buildSignupEmailRedirectUrl(baseUrl: string = getAppBaseUrl()): string {
  return `${baseUrl}${AUTH_CALLBACK_PATH}`;
}

export async function performSignupPrecheck(data: SignUpParsed): Promise<SignupPrecheckResult> {
  const email = normalizeAuthEmail(data.email);

  try {
    if (await isDisposableEmailDomain(email)) {
      return { status: "disposable_email" };
    }
  } catch {
    logPrecheckFailure("registration_blocklist_check_failed");
    return { status: "error" };
  }

  return {
    status: "ok",
    emailRedirectTo: buildSignupEmailRedirectUrl(),
  };
}

export const precheckEmailSignup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signUpSchema.parse(input))
  .handler(async ({ data }): Promise<SignupPrecheckResult> => performSignupPrecheck(data));
