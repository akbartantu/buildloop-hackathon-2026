import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage, legalPageHead } from "@/components/site/legal-document-page";
import { translate } from "@/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => legalPageHead("privacy", (key) => translate("en", key)),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalDocumentPage pageId="privacy" />;
}
