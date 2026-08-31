import { publicEn } from "./public/en";
import { publicId } from "./public/id";

type PublicLeaf = string | PublicTree;
type PublicTree = { [key: string]: PublicLeaf };

function flattenPublicTree(tree: PublicTree, prefix = ""): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries[path] = value;
    } else {
      Object.assign(entries, flattenPublicTree(value, path));
    }
  }
  return entries;
}

const publicEnFlat = flattenPublicTree(publicEn as PublicTree);
const publicIdFlat = flattenPublicTree(publicId as PublicTree);

export function translatePublic(
  locale: "en" | "id",
  key: string,
  params?: Record<string, string | number>,
): string {
  const template =
    (locale === "id" ? publicIdFlat[key] : publicEnFlat[key]) ?? publicEnFlat[key] ?? key;
  if (!params) {
    return template;
  }
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
}

export { publicEn, publicId };
