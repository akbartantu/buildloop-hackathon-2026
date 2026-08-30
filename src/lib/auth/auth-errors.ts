type AuthErrorLike = {
  message?: string | undefined;
  code?: string | undefined;
  status?: number | undefined;
};

export type RegistrationCreateUserResult =
  | { status: "email_taken" }
  | { status: "weak_password" }
  | { status: "error" };

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

export function mapRegistrationCreateUserError(
  error: AuthErrorLike,
): RegistrationCreateUserResult {
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

  return { status: "error" };
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
