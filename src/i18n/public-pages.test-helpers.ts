type PublicLeaf = string | PublicTree;
type PublicTree = { [key: string]: PublicLeaf };

export function flattenPublicKeys(tree: PublicTree, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.push(path);
    } else {
      keys.push(...flattenPublicKeys(value, path));
    }
  }
  return keys;
}
