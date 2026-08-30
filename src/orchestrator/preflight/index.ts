import { detectSensitiveIntent, type BlockedReason } from "@/lib/sensitive-intent";
import type { CheckerEvidence } from "../types";
import type { LockedContract } from "../contract/schema";

export type PreflightResult = {
  safe: boolean;
  blockedReasons: BlockedReason[];
  evidence: CheckerEvidence[];
};

export function runPreflight(input: {
  runId: string;
  contract: LockedContract;
}): PreflightResult {
  const blockedReasons = detectSensitiveIntent(input.contract.goal);
  const now = new Date().toISOString();

  const evidence: CheckerEvidence[] = blockedReasons.map((reason, index) => ({
    id: crypto.randomUUID(),
    runId: input.runId,
    attemptNumber: 0,
    category: "preflight",
    name: reason.rule,
    status: "blocked",
    summary: reason.explanation,
    details: `matched="${reason.matchedText}" target="${reason.protectedTarget}"`,
    affectedFiles: [],
    severity: "critical",
    createdAt: now,
  }));

  if (blockedReasons.length === 0) {
    evidence.push({
      id: crypto.randomUUID(),
      runId: input.runId,
      attemptNumber: 0,
      category: "preflight",
      name: "policy_preflight",
      status: "pass",
      summary: "Preflight policy check passed.",
      details: "No credential, deployment, protected branch, or forbidden action detected.",
      affectedFiles: [],
      severity: "info",
      createdAt: now,
    });
  }

  return {
    safe: blockedReasons.length === 0,
    blockedReasons,
    evidence,
  };
}
