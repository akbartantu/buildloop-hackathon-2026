import { LegalPage, LegalSection } from "@/components/site/legal-page";
import {
  LEGAL_PAGE_META,
  LEGAL_PAGE_SECTIONS,
  legalSectionHeadingKey,
  legalSectionParagraphKey,
  type LegalPageId,
} from "@/lib/legal/legal-page-config";
import { useI18n } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/en";

export function LegalDocumentPage({ pageId }: { pageId: LegalPageId }) {
  const { t } = useI18n();
  const meta = LEGAL_PAGE_META[pageId];
  const sections = LEGAL_PAGE_SECTIONS[pageId];

  return (
    <LegalPage
      title={t(meta.titleKey)}
      intro={t(meta.introKey)}
      updatedNote={t(meta.updatedKey)}
    >
      {sections.map((section) => (
        <LegalSection
          key={section.id}
          heading={t(legalSectionHeadingKey(pageId, section.id))}
        >
          {Array.from({ length: section.paragraphCount }, (_, index) => {
            const key = legalSectionParagraphKey(pageId, section.id, index + 1);
            return <p key={key}>{t(key as TranslationKey)}</p>;
          })}
        </LegalSection>
      ))}
    </LegalPage>
  );
}

export function legalPageHead(pageId: LegalPageId, t: (key: TranslationKey) => string) {
  const meta = LEGAL_PAGE_META[pageId];
  const title = t(meta.metaTitleKey);
  const description = t(meta.metaDescriptionKey);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  };
}
