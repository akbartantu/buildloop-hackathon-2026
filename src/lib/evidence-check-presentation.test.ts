import { describe, expect, test } from "bun:test";

import {
  extractEvidenceCheckCommand,
  formatEvidenceCheckSummary,
  formatEvidenceCheckTitle,
  formatEvidenceCheckUserLine,
  shouldShowEvidenceCheckSummary,
} from "@/lib/evidence-check-presentation";
import { buildCheckTechnicalDetails } from "@/lib/evidence-summary";
import type { EvidenceRow } from "@/lib/evidence-analysis";

function row(overrides: Partial<EvidenceRow> & Pick<EvidenceRow, "category" | "name" | "status" | "summary">): EvidenceRow {
  return {
    attemptNumber: 1,
    ...overrides,
  };
}

describe("evidence check presentation", () => {
  test("Indonesian technical check labels and descriptions are localized", () => {
    const worker = row({
      category: "scope",
      name: "worker_invocation",
      status: "pass",
      summary: "Worker report received.",
    });
    expect(formatEvidenceCheckTitle(worker, "id")).toBe("Scope yang disetujui");
    expect(formatEvidenceCheckUserLine(worker, "id")).toBe("Laporan worker diterima.");
    expect(formatEvidenceCheckSummary(worker, "id")).toBe("Laporan worker diterima.");

    const protectedPath = row({
      category: "acceptance",
      name: "protected_path_unchanged",
      status: "pass",
      summary: "No protected path changes detected.",
    });
    expect(formatEvidenceCheckTitle(protectedPath, "id")).toBe("Path yang dilindungi");
    expect(formatEvidenceCheckUserLine(protectedPath, "id")).toBe(
      "Tidak ada path yang dilindungi yang diubah.",
    );
    expect(formatEvidenceCheckSummary(protectedPath, "id")).toBe(
      "Tidak ada perubahan pada path yang dilindungi.",
    );

    const typecheck = row({
      category: "typecheck",
      name: "typecheck_bun_run_typecheck_not_applicable",
      status: "skipped",
      summary: "Command not applicable for this workspace: bun run typecheck",
    });
    expect(formatEvidenceCheckTitle(typecheck, "id")).toBe("Pemeriksaan tipe proyek");
    expect(formatEvidenceCheckUserLine(typecheck, "id")).toBe("Pemeriksaan tipe proyek tidak diperlukan.");
    expect(formatEvidenceCheckSummary(typecheck, "id")).toBe(
      "Perintah tidak berlaku untuk workspace ini: bun run typecheck",
    );
  });

  test("English locale remains English", () => {
    const worker = row({
      category: "scope",
      name: "worker_invocation",
      status: "pass",
      summary: "Worker report received.",
    });
    expect(formatEvidenceCheckTitle(worker, "en")).toBe("Approved scope");
    expect(formatEvidenceCheckUserLine(worker, "en")).toBe("Worker report received.");

    const command = row({
      category: "command",
      name: "command_bun_run_lint_not_applicable",
      status: "skipped",
      summary: "Command not applicable for this workspace: bun run lint",
    });
    expect(formatEvidenceCheckSummary(command, "en")).toBe(
      "Command not applicable for this workspace: bun run lint",
    );
  });

  test("filenames, paths, commands, codes, and identifiers remain literal", () => {
    const scopeFile = row({
      category: "scope",
      name: "scope_prototype/index.html",
      status: "pass",
      summary: "Change within allowed paths.",
    });
    expect(scopeFile.name).toBe("scope_prototype/index.html");
    expect(extractEvidenceCheckCommand("Command failed: bun run typecheck")).toBe("bun run typecheck");

    const details = buildCheckTechnicalDetails(
      [
        row({
          category: "typecheck",
          name: "typecheck_bun_run_typecheck",
          status: "fail",
          summary: "Command failed: bun run typecheck",
        }),
      ],
      "id",
    );
    expect(details[0]?.command).toBe("bun run typecheck");
    expect(details[0]?.name).toBe("typecheck_bun_run_typecheck");
    expect(details[0]?.category).toBe("typecheck");
    expect(details[0]?.status).toBe("fail");
  });

  test("git diff summary localizes count and sha while keeping sha literal", () => {
    const gitDiff = row({
      category: "scope",
      name: "git_diff_summary",
      status: "pass",
      summary: "2 file berubah dari baseline a10183eb.",
    });
    expect(formatEvidenceCheckSummary(gitDiff, "id")).toBe("2 file diubah dari baseline a10183eb.");
    expect(formatEvidenceCheckSummary(gitDiff, "en")).toBe("2 files changed from baseline a10183eb.");
    expect(formatEvidenceCheckTitle(gitDiff, "id")).toBe("Perubahan file dari baseline");
  });

  test("unknown custom messages safely fall back to original text", () => {
    const custom = row({
      category: "scope",
      name: "custom_probe",
      status: "pass",
      summary: "Custom checker message from a future release.",
    });
    expect(formatEvidenceCheckSummary(custom, "id")).toBe("Custom checker message from a future release.");
    expect(formatEvidenceCheckUserLine(custom, "id")).toBe("Hanya file yang disetujui yang diubah.");
  });

  test("duplicate summary is hidden when it matches user line", () => {
    const worker = row({
      category: "scope",
      name: "worker_invocation",
      status: "pass",
      summary: "Worker report received.",
    });
    const userLine = formatEvidenceCheckUserLine(worker, "en");
    const summary = formatEvidenceCheckSummary(worker, "en");
    expect(shouldShowEvidenceCheckSummary(userLine, summary)).toBe(false);
  });
});
