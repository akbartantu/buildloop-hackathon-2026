import { useEffect } from "react";
import { useI18n } from "./context";
import { translatePublic } from "./public-pages";

export function usePublicI18n() {
  const { locale } = useI18n();

  return {
    locale,
    pt: (key: string, params?: Record<string, string | number>) =>
      translatePublic(locale, key, params),
  };
}

export function usePublicPageMeta(titleKey: string, descriptionKey: string) {
  const { locale, pt } = usePublicI18n();

  useEffect(() => {
    document.title = pt(titleKey);
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute("content", pt(descriptionKey));
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute("content", pt(titleKey));
    }
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) {
      ogDescription.setAttribute("content", pt(descriptionKey));
    }
  }, [locale, pt, titleKey, descriptionKey]);
}
