type AuthErrorLike = {
  message?: string | undefined;
  code?: string | undefined;
  status?: number | undefined;
};

export type SignupErrorResult =
  | { status: "email_taken" }
  | { status: "weak_password" }
  | { status: "rate_limited" }
  | { status: "error" };

/** @deprecated Use SignupErrorResult */
export type RegistrationCreateUserResult = SignupErrorResult;

const SENSITIVE_LOG_PATTERNS = [
  /@/,
  /\bsb_(publishable|secret)_/i,
  /\bBearer\s+/i,
  /\bpassword\b/i,
  /\btoken\b/i,
];

/** True when an auth error message is safe to include in server logs. */
export function isSafeAuthErrorMessageForLogging(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  return !SENSITIVE_LOG_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function mapSignupError(error: AuthErrorLike): SignupErrorResult {
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();

  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("user already registered") ||
    message.includes("already been registered") ||
    message.includes("already registered") ||
    message.includes("already exists")
  ) {
    return { status: "email_taken" };
  }

  if (
    code === "weak_password" ||
    message.includes("password should be at least") ||
    message.includes("weak password")
  ) {
    return { status: "weak_password" };
  }

  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return { status: "rate_limited" };
  }

  if (
    code === "unexpected_failure" ||
    message.includes("error sending confirmation email") ||
    message.includes("email delivery") ||
    message.includes("failed to send")
  ) {
    return { status: "error" };
  }

  return { status: "error" };
}

/** @deprecated Use mapSignupError */
export function mapRegistrationCreateUserError(error: AuthErrorLike): RegistrationCreateUserResult {
  return mapSignupError(error);
}

export function mapAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) {
    return "Something went wrong. Please try again.";
  }

  const message = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid email or password") ||
    code === "invalid_credentials"
  ) {
    return "Incorrect email or password. Please try again.";
  }

  if (
    message.includes("user already registered") ||
    message.includes("already been registered") ||
    code === "user_already_exists"
  ) {
    return "An account with this email already exists. Sign in or use a different email.";
  }

  if (
    message.includes("password should be at least") ||
    message.includes("weak password") ||
    code === "weak_password"
  ) {
    return "Password does not meet the minimum requirements. Use at least 6 characters.";
  }

  if (message.includes("rate limit") || code === "over_email_send_rate_limit") {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (message.includes("email not confirmed")) {
    return "Please confirm your email before signing in. Check your inbox for the confirmation link.";
  }

  if (message.includes("signup is disabled")) {
    return "Email sign-up is not available right now. Please contact support.";
  }

  return "Something went wrong. Please try again.";
}

/** Safe user-facing message when starting OAuth from the browser. */
export function mapOAuthStartError(error: AuthErrorLike | null | undefined): string {
  if (!error) {
    return "Could not start Google sign-in. Please try again.";
  }

  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();

  if (
    message.includes("not enabled") ||
    message.includes("unsupported provider") ||
    code === "validation_failed"
  ) {
    return "Google sign-in is not available right now. Please try email sign-in or contact support.";
  }

  if (
    message.includes("redirect") ||
    message.includes("invalid request") ||
    code === "bad_oauth_callback"
  ) {
    return "Sign-in redirect is misconfigured. Please try again or contact support.";
  }

  return "Could not start Google sign-in. Please try again.";
}

/** Safe user-facing message for OAuth callback failures (no tokens in output). */
export function mapOAuthCallbackError(input: {
  error?: string | null;
  errorDescription?: string | null;
  fallback?: string;
}): string {
  const code = (input.error ?? "").toLowerCase();
  const description = (input.errorDescription ?? "").toLowerCase();

  if (code === "access_denied" || description.includes("access_denied")) {
    return "Google sign-in was cancelled. You can try again when ready.";
  }

  if (
    code === "server_error" ||
    description.includes("provider is not enabled") ||
    description.includes("unsupported provider")
  ) {
    return "Google sign-in is not available right now. Please try email sign-in or contact support.";
  }

  if (
    code === "invalid_request" ||
    description.includes("redirect") ||
    description.includes("redirect_uri")
  ) {
    return "Sign-in redirect is misconfigured. Please try again or contact support.";
  }

  return input.fallback ?? "Sign-in was cancelled or failed. Please try again.";
}
