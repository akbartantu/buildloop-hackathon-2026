import { readFile } from "node:fs/promises";
import path from "node:path";

export type DetectedProjectCommands = {
  typecheck: string | null;
  test: string | null;
  lint: string | null;
  build: string | null;
};

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bgit\s+clean\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bsudo\b/i,
  /\bcurl\b.+\|\s*(?:ba)?sh\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bTRUNCATE\b/i,
  /\bnpm\s+publish\b/i,
  /\bwrangler\s+deploy\b/i,
  /\bgcloud\s+/i,
];

export function isCommandAllowed(command: string, contractAllowlist: string[]): boolean {
  const normalized = command.trim();
  if (!normalized) return false;
  if (DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  if (contractAllowlist.length === 0) {
    return /^(bun|npm|pnpm|yarn)\s+(run\s+)?(typecheck|test|lint|build)\b/.test(normalized);
  }
  return contractAllowlist.some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed} `),
  );
}

export async function detectProjectCommands(workspaceRoot: string): Promise<DetectedProjectCommands> {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  try {
    const raw = await readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
    const pm = await fileExists(path.join(workspaceRoot, "bun.lock")) ? "bun" : "npm";

    return {
      typecheck: scripts["typecheck"] ? `${pm} run typecheck` : null,
      test: scripts["test"] ? `${pm} test` : null,
      lint: scripts["lint"] ? `${pm} run lint` : null,
      build: scripts["build"] ? `${pm} run build` : null,
    };
  } catch {
    return { typecheck: null, test: null, lint: null, build: null };
  }
}

export function requiredCommandsForContract(
  contractCommands: string[],
  detected: DetectedProjectCommands,
): string[] {
  if (contractCommands.length > 0) {
    return contractCommands;
  }
  const defaults = [detected.typecheck, detected.test].filter(Boolean) as string[];
  return defaults;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await readFile(target);
    return true;
  } catch {
    return false;
  }
}
