import { createFileRoute } from "@tanstack/react-router";
import { ApprovalsPage } from "@/components/site/pages/approvals-page";

export const Route = createFileRoute("/_authenticated/app/_workspace/approvals/")({
  component: ApprovalsPage,
  head: () => ({
    meta: [{ title: "Approvals — BuildLoop" }],
  }),
});
