import { readFile } from "node:fs/promises";
import path from "node:path";

export type DetectedProjectCommands = {
  hasPackageJson: boolean;
  typecheck: string | null;
  test: string | null;
  lint: string | null;
  build: string | null;
};

const PACKAGE_SCRIPT_COMMAND_PATTERN =
  /^(bun|npm|pnpm|yarn)\s+(run\s+)?(typecheck|test|lint|build)\b/i;

export function looksLikePackageScriptCommand(command: string): boolean {
  return PACKAGE_SCRIPT_COMMAND_PATTERN.test(command.trim());
}

function scriptKindForCommand(command: string): keyof Pick<DetectedProjectCommands, "typecheck" | "test" | "lint" | "build"> | null {
  const normalized = command.trim().toLowerCase();
  if (/typecheck/.test(normalized)) return "typecheck";
  if (/\btest\b/.test(normalized)) return "test";
  if (/lint/.test(normalized)) return "lint";
  if (/build/.test(normalized)) return "build";
  return null;
}

export function partitionContractCommandsByApplicability(
  contractCommands: string[],
  detected: DetectedProjectCommands,
): { applicable: string[]; skipped: string[] } {
  if (contractCommands.length === 0) {
    return { applicable: [], skipped: [] };
  }

  const applicable: string[] = [];
  const skipped: string[] = [];
  const seenApplicable = new Set<string>();

  for (const command of contractCommands) {
    const kind = scriptKindForCommand(command);
    if (kind) {
      const detectedCommand = detected[kind];
      if (detectedCommand) {
        if (!seenApplicable.has(detectedCommand)) {
          seenApplicable.add(detectedCommand);
          applicable.push(detectedCommand);
        }
      } else {
        skipped.push(command);
      }
      continue;
    }

    applicable.push(command);
  }

  return { applicable, skipped };
}

export function commandSkipReason(
  command: string,
  detected: DetectedProjectCommands,
): string {
  if (!detected.hasPackageJson) {
    return "No package.json present; package-script verification does not apply to this repository.";
  }
  if (looksLikePackageScriptCommand(command)) {
    return "package.json does not define the script required for this check.";
  }
  return "Command is not applicable for this workspace.";
}

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

function authorizesPackageScriptCommand(command: string, contractAllowlist: string[]): boolean {
  const kind = scriptKindForCommand(command);
  if (!kind) {
    return false;
  }
  return contractAllowlist.some((allowed) => scriptKindForCommand(allowed) === kind);
}

export function isCommandAllowed(command: string, contractAllowlist: string[]): boolean {
  const normalized = command.trim();
  if (!normalized) return false;
  if (DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  if (contractAllowlist.length === 0) {
    return looksLikePackageScriptCommand(normalized);
  }
  return (
    contractAllowlist.some(
      (allowed) => normalized === allowed || normalized.startsWith(`${allowed} `),
    ) || authorizesPackageScriptCommand(normalized, contractAllowlist)
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
      hasPackageJson: true,
      typecheck: scripts["typecheck"] ? `${pm} run typecheck` : null,
      test: scripts["test"] ? `${pm} test` : null,
      lint: scripts["lint"] ? `${pm} run lint` : null,
      build: scripts["build"] ? `${pm} run build` : null,
    };
  } catch {
    return { hasPackageJson: false, typecheck: null, test: null, lint: null, build: null };
  }
}

export function requiredCommandsForContract(
  contractCommands: string[],
  detected: DetectedProjectCommands,
): string[] {
  return partitionContractCommandsByApplicability(contractCommands, detected).applicable;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await readFile(target);
    return true;
  } catch {
    return false;
  }
}
