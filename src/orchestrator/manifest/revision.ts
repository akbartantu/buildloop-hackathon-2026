import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export type ManifestEntry = {
  path: string;
  hash: string;
  size: number;
};

const IGNORE_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".output",
  "dist",
  "dist-ssr",
  ".vinxi",
  ".nitro",
  ".wrangler",
  "graphify-out",
  ".buildloop",
]);

const IGNORE_FILE_NAMES = new Set([".env"]);
const IGNORE_FILE_PREFIXES = [".env."];

function shouldIgnore(relativePath: string, isDirectory: boolean): boolean {
  const segments = relativePath.split(/[/\\]/);
  for (const segment of segments) {
    if (IGNORE_DIR_NAMES.has(segment)) return true;
  }
  const base = path.basename(relativePath);
  if (IGNORE_FILE_NAMES.has(base)) return true;
  if (IGNORE_FILE_PREFIXES.some((prefix) => base.startsWith(prefix))) return true;
  if (!isDirectory && relativePath.endsWith(".log")) return true;
  return false;
}

async function walk(root: string, current: string, entries: ManifestEntry[]): Promise<void> {
  const absolute = path.join(root, current);
  const dirEntries = await readdir(absolute, { withFileTypes: true });

  for (const entry of dirEntries) {
    const relative = current.length > 0 ? `${current}/${entry.name}` : entry.name;
    if (shouldIgnore(relative, entry.isDirectory())) continue;

    const fullPath = path.join(root, relative);
    if (entry.isDirectory()) {
      await walk(root, relative.replace(/\\/g, "/"), entries);
      continue;
    }

    const buffer = await readFile(fullPath);
    const fileStat = await stat(fullPath);
    entries.push({
      path: relative.replace(/\\/g, "/"),
      hash: createHash("sha256").update(buffer).digest("hex"),
      size: fileStat.size,
    });
  }
}

/** Deterministic SHA-256 manifest revision without Git HEAD. */
export async function computeManifestRevision(
  root: string,
): Promise<{ revision: string; entries: ManifestEntry[] }> {
  const entries: ManifestEntry[] = [];
  await walk(root, "", entries);
  entries.sort((a, b) => a.path.localeCompare(b.path));

  const digest = createHash("sha256");
  for (const entry of entries) {
    digest.update(`${entry.path}:${entry.hash}:${entry.size}\n`);
  }

  return { revision: digest.digest("hex"), entries };
}

export function diffManifestRevisions(before: string, after: string): boolean {
  return before !== after;
}
