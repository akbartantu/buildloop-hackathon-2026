type UserMetadataLike = {
  full_name?: string;
  name?: string;
  avatar_url?: string;
};

type UserIdentityLike = {
  provider?: string;
};

type AuthUserLike = {
  email?: string | null;
  user_metadata?: UserMetadataLike | null;
  app_metadata?: { provider?: string } | null;
  identities?: UserIdentityLike[] | null;
  last_sign_in_at?: string | null;
};

/** Canonical display name: full_name → name (OAuth) → email local-part → fallback. */
export function resolveUserDisplayName(input: {
  email?: string | null | undefined;
  userMetadata?: UserMetadataLike | null | undefined;
}): string {
  const fullName = input.userMetadata?.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  const oauthName = input.userMetadata?.name?.trim();
  if (oauthName) {
    return oauthName;
  }

  const localPart = input.email?.split("@")[0]?.trim();
  if (localPart) {
    return localPart;
  }

  return "Pengguna";
}

export function resolveAuthProviderLabel(user: AuthUserLike): string {
  const appProvider = user.app_metadata?.provider?.trim().toLowerCase();
  if (appProvider === "google") {
    return "Google";
  }
  if (appProvider === "email") {
    return "Email";
  }

  const identityProvider = user.identities?.[0]?.provider?.trim().toLowerCase();
  if (identityProvider === "google") {
    return "Google";
  }
  if (identityProvider === "email") {
    return "Email";
  }

  return "Email";
}

export function formatLastSignIn(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString();
}

export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
