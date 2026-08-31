import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/site/legal-page";
import { publicEn } from "@/i18n/public-pages";
import { usePublicI18n, usePublicPageMeta } from "@/i18n/use-public-i18n";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: publicEn.docs.metaTitle },
      { name: "description", content: publicEn.docs.metaDescription },
      { property: "og:title", content: publicEn.docs.metaTitle },
      { property: "og:description", content: publicEn.docs.metaDescription },
    ],
  }),
  component: Docs,
});

function Docs() {
  const { pt } = usePublicI18n();
  usePublicPageMeta("docs.metaTitle", "docs.metaDescription");

  return (
    <LegalPage title={pt("docs.title")} intro={pt("docs.intro")}>
      <LegalSection heading={pt("docs.contractHeading")}>
        <p>{pt("docs.contractP1")}</p>
        <p>{pt("docs.contractP2")}</p>
      </LegalSection>

      <LegalSection heading={pt("docs.evidenceHeading")}>
        <p>{pt("docs.evidenceP1")}</p>
      </LegalSection>

      <LegalSection heading={pt("docs.statusHeading")}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{pt("docs.statusPass")}</li>
          <li>{pt("docs.statusBlocked")}</li>
          <li>{pt("docs.statusReview")}</li>
          <li>{pt("docs.statusStale")}</li>
        </ul>
      </LegalSection>

      <LegalSection heading={pt("docs.decisionHeading")}>
        <p>{pt("docs.decisionP1")}</p>
      </LegalSection>

      <LegalSection heading={pt("docs.limitsHeading")}>
        <p>{pt("docs.limitsP1")}</p>
      </LegalSection>
    </LegalPage>
  );
}
