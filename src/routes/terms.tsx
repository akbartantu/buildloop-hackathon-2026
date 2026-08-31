import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/site/legal-page";
import { publicEn } from "@/i18n/public-pages";
import { usePublicI18n, usePublicPageMeta } from "@/i18n/use-public-i18n";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: publicEn.terms.metaTitle },
      { name: "description", content: publicEn.terms.metaDescription },
      { property: "og:title", content: publicEn.terms.metaTitle },
      { property: "og:description", content: publicEn.terms.metaDescription },
    ],
  }),
  component: Terms,
});

function Terms() {
  const { pt } = usePublicI18n();
  usePublicPageMeta("terms.metaTitle", "terms.metaDescription");

  return (
    <LegalPage
      title={pt("terms.title")}
      draft
      intro={pt("terms.draftIntro")}
      updatedNote={pt("terms.updatedNote")}
    >
      <LegalSection heading={pt("terms.serviceHeading")}>
        <p>{pt("terms.serviceP1")}</p>
      </LegalSection>

      <LegalSection heading={pt("terms.responsibilityHeading")}>
        <p>{pt("terms.responsibilityP1")}</p>
      </LegalSection>

      <LegalSection heading={pt("terms.limitsHeading")}>
        <p>{pt("terms.limitsP1")}</p>
      </LegalSection>

      <LegalSection heading={pt("terms.changesHeading")}>
        <p>{pt("terms.changesP1")}</p>
      </LegalSection>
    </LegalPage>
  );
}
