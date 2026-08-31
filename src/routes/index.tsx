import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/site/pages/landing-page";
import { publicEn } from "@/i18n/public-pages";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: publicEn.meta.title },
      { name: "description", content: publicEn.meta.description },
      { property: "og:title", content: publicEn.meta.title },
      { property: "og:description", content: publicEn.meta.description },
    ],
  }),
  component: LandingPage,
});
