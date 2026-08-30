import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/site/pages/home-page";

export const Route = createFileRoute("/_authenticated/app/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Home — BuildLoop" },
      {
        name: "description",
        content: "Ringkasan operasional workspace BuildLoop.",
      },
    ],
  }),
});
