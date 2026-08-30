type SignupIdentity = { id?: string };

type SignupUser = {
  identities?: SignupIdentity[] | null;
};

export type SignupCompletionResult =
  | { status: "needs_email_confirmation" }
  | { status: "ok" }
  | { status: "email_taken" }
  | { status: "error" };

/** Interpret a Supabase auth.signUp() response after server-side precheck passed. */
export function interpretSignupResponse(data: {
  user: SignupUser | null;
  session: unknown | null;
}): SignupCompletionResult {
  if (data.user?.identities?.length === 0) {
    return { status: "email_taken" };
  }

  if (data.session) {
    return { status: "ok" };
  }

  if (data.user) {
    return { status: "needs_email_confirmation" };
  }

  return { status: "error" };
}

/** Auth callback path used for email confirmation and OAuth. */
export const AUTH_CALLBACK_PATH = "/auth/callback";
