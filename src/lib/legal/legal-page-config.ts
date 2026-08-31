export type LegalPageId = "privacy" | "cookies" | "security";

export type LegalSectionDef = {
  id: string;
  paragraphCount: number;
};

export const LEGAL_PAGE_META: Record<
  LegalPageId,
  {
    titleKey: `legal.${LegalPageId}.title`;
    introKey: `legal.${LegalPageId}.intro`;
    updatedKey: `legal.${LegalPageId}.updated`;
    metaTitleKey: `legal.${LegalPageId}.metaTitle`;
    metaDescriptionKey: `legal.${LegalPageId}.metaDescription`;
  }
> = {
  privacy: {
    titleKey: "legal.privacy.title",
    introKey: "legal.privacy.intro",
    updatedKey: "legal.privacy.updated",
    metaTitleKey: "legal.privacy.metaTitle",
    metaDescriptionKey: "legal.privacy.metaDescription",
  },
  cookies: {
    titleKey: "legal.cookies.title",
    introKey: "legal.cookies.intro",
    updatedKey: "legal.cookies.updated",
    metaTitleKey: "legal.cookies.metaTitle",
    metaDescriptionKey: "legal.cookies.metaDescription",
  },
  security: {
    titleKey: "legal.security.title",
    introKey: "legal.security.intro",
    updatedKey: "legal.security.updated",
    metaTitleKey: "legal.security.metaTitle",
    metaDescriptionKey: "legal.security.metaDescription",
  },
};

export const LEGAL_PAGE_SECTIONS: Record<LegalPageId, LegalSectionDef[]> = {
  privacy: [
    { id: "collected", paragraphCount: 3 },
    { id: "purposes", paragraphCount: 2 },
    { id: "ai", paragraphCount: 2 },
    { id: "providers", paragraphCount: 2 },
    { id: "github", paragraphCount: 2 },
    { id: "specifications", paragraphCount: 3 },
    { id: "secrets", paragraphCount: 1 },
    { id: "waitlist", paragraphCount: 2 },
    { id: "retention", paragraphCount: 2 },
    { id: "rights", paragraphCount: 2 },
    { id: "security", paragraphCount: 1 },
    { id: "international", paragraphCount: 2 },
    { id: "contact", paragraphCount: 1 },
  ],
  cookies: [
    { id: "overview", paragraphCount: 2 },
    { id: "essential", paragraphCount: 2 },
    { id: "preferences", paragraphCount: 2 },
    { id: "auth", paragraphCount: 2 },
    { id: "noTracking", paragraphCount: 2 },
    { id: "cache", paragraphCount: 2 },
    { id: "manage", paragraphCount: 2 },
  ],
  security: [
    { id: "overview", paragraphCount: 2 },
    { id: "approval", paragraphCount: 2 },
    { id: "bounded", paragraphCount: 2 },
    { id: "isolation", paragraphCount: 2 },
    { id: "infrastructure", paragraphCount: 2 },
    { id: "logging", paragraphCount: 2 },
    { id: "governance", paragraphCount: 2 },
    { id: "headers", paragraphCount: 2 },
    { id: "limitations", paragraphCount: 2 },
    { id: "reporting", paragraphCount: 2 },
  ],
};

export function legalSectionHeadingKey(
  pageId: LegalPageId,
  sectionId: string,
): `legal.${LegalPageId}.sections.${string}.heading` {
  return `legal.${pageId}.sections.${sectionId}.heading`;
}

export function legalSectionParagraphKey(
  pageId: LegalPageId,
  sectionId: string,
  index: number,
): `legal.${LegalPageId}.sections.${string}.p${number}` {
  return `legal.${pageId}.sections.${sectionId}.p${index}`;
}

/** Storage keys documented in the Cookie & Local Storage policy. */
export const DOCUMENTED_BROWSER_STORAGE_KEYS = [
  "buildloop.locale",
  "buildloop.activeProjectId",
  "buildloop-connected-repository",
  "buildloop.productTour.completed.v2",
  "sb-*-auth-token (Supabase-managed session storage key pattern)",
  "sidebar_state (cookie)",
] as const;
