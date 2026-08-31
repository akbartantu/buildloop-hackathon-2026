import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage, legalPageHead } from "@/components/site/legal-document-page";
import { translate } from "@/i18n";

export const Route = createFileRoute("/security")({
  head: () => legalPageHead("security", (key) => translate("en", key)),
  component: SecurityPage,
});

function SecurityPage() {
  return <LegalDocumentPage pageId="security" />;
}
