type AuthErrorLike = {
  message?: string | undefined;
  code?: string | undefined;
  status?: number | undefined;
};

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
