import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LockedContract } from "../contract/schema";
import type { CodingWorker, WorkerInput } from "./types";
import { PASS_DEMO_TARGET_RELATIVE } from "../scenarios/pass";

const PARTIAL_WORKSPACE_COPY =
  "Task di workspace ini dijalankan di sandbox terkontrol. Perubahan kode ditinjau sebelum disimpan.";

const FULL_WORKSPACE_COPY =
  "Task di workspace ini dijalankan di sandbox terkontrol. Tindakan sensitif seperti commit, push, merge, atau deploy membutuhkan approval manusia sebelum dijalankan.";

/** Deterministic worker for PASS demo — never sets verdict. */
export class DemoPassWorker implements CodingWorker {
  readonly id = "demo-worker";

  async execute(input: WorkerInput) {
    const target = path.join(input.sandboxRoot, PASS_DEMO_TARGET_RELATIVE);
    await mkdir(path.dirname(target), { recursive: true });

    let source: string;
    try {
      source = await readFile(path.join(input.workspaceRoot, PASS_DEMO_TARGET_RELATIVE), "utf8");
    } catch {
      source = "";
    }

    const isCorrection = input.attemptNumber > 1 || Boolean(input.correctionInstruction);
    const nextCopy = isCorrection ? FULL_WORKSPACE_COPY : PARTIAL_WORKSPACE_COPY;
    const updated = injectWorkspaceCopy(source, nextCopy);
    await writeFile(target, updated, "utf8");

    return {
      workerId: this.id,
      attemptNumber: input.attemptNumber,
      filesChanged: [PASS_DEMO_TARGET_RELATIVE],
      commandsRequested: [],
      commandsExecuted: [],
      summary: isCorrection
        ? "Applied correction to workspace copy with approval guidance."
        : "Updated workspace copy with sandbox note (approval guidance pending).",
      patchSummary: `Set workspace explanation copy (${isCorrection ? "full" : "partial"}).`,
    };
  }
}

export function injectWorkspaceCopy(source: string, copy: string): string {
  const newMarker =
    '<p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">';
  const legacyMarker =
    '<p className="mt-5 max-w-2xl border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">';

  for (const marker of [newMarker, legacyMarker]) {
    if (!source.includes(marker)) continue;
    const pattern = new RegExp(
      `(${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})[\\s\\S]*?(<\\/p>)`,
    );
    if (pattern.test(source)) {
      return source.replace(pattern, `$1\n          ${copy}\n        $2`);
    }
  }

  return `${source}\n<!-- workspace-copy -->\n${copy}\n`;
}

export function contractMatchesPassDemo(contract: LockedContract): boolean {
  return contract.goal.toLowerCase().includes("sandbox") && contract.goal.toLowerCase().includes("approval");
}
