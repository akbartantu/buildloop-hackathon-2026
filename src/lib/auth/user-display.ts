export const AUTH_PHONE_MAX = 30;

type UserMetadataLike = {
  full_name?: string;
  name?: string;
  phone?: string;
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
/** Profile form value: user-edited full_name, else OAuth name — never overwrites metadata. */
export function resolveProfileFullName(metadata?: UserMetadataLike | null | undefined): string {
  const fullName = metadata?.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  return metadata?.name?.trim() ?? "";
}

export function resolveUserDisplayName(
  input: {
    email?: string | null | undefined;
    userMetadata?: UserMetadataLike | null | undefined;
  },
  fallback = "User",
): string {
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

  return fallback;
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

/** Profile contact phone — metadata only, not phone-auth identity. */
export function normalizePhone(value: string): string {
  return value.trim();
}

export function isValidPhone(value: string): boolean {
  const trimmed = normalizePhone(value);
  if (!trimmed) {
    return true;
  }

  if (trimmed.length > AUTH_PHONE_MAX) {
    return false;
  }

  return /^\+?[\d\s\-().]+$/.test(trimmed) && /\d/.test(trimmed);
}

export function canChangePassword(user: AuthUserLike): boolean {
  const providers = new Set<string>();

  const appProvider = user.app_metadata?.provider?.trim().toLowerCase();
  if (appProvider) {
    providers.add(appProvider);
  }

  for (const identity of user.identities ?? []) {
    const provider = identity.provider?.trim().toLowerCase();
    if (provider) {
      providers.add(provider);
    }
  }

  return providers.has("email");
}
