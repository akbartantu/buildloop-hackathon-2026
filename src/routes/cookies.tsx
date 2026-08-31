import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage, legalPageHead } from "@/components/site/legal-document-page";
import { translate } from "@/i18n";

export const Route = createFileRoute("/cookies")({
  head: () => legalPageHead("cookies", (key) => translate("en", key)),
  component: CookiesPage,
});

function CookiesPage() {
  return <LegalDocumentPage pageId="cookies" />;
}
