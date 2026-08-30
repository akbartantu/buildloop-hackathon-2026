#!/usr/bin/env bun
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BootstrapOrchestrator } from "./bootstrap/orchestrator";
import { computeManifestRevision } from "./manifest/revision";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function main() {
  const [command, subcommand] = process.argv.slice(2);
  const orchestrator = new BootstrapOrchestrator({ workspaceRoot });

  if (command === "manifest") {
    const { revision, entries } = await computeManifestRevision(workspaceRoot);
    console.log(JSON.stringify({ revision, fileCount: entries.length }, null, 2));
    return;
  }

  if (command === "demo" && subcommand === "pass") {
    const result = await orchestrator.runPassDemo();
    printResult("PASS demo", result);
    process.exit(result.run.verdict === "PASS" ? 0 : 1);
  }

  if (command === "demo" && subcommand === "blocked") {
    const result = await orchestrator.runBlockedDemo();
    printResult("BLOCKED demo", result);
    const ok =
      result.run.verdict === "BLOCKED" &&
      result.run.counters.workerCalls === 0 &&
      result.run.counters.filesChanged === 0;
    process.exit(ok ? 0 : 1);
  }

  if (command === "validate") {
    const pass = await orchestrator.runPassDemo();
    const blocked = await orchestrator.runBlockedDemo();
    const passOk = pass.run.verdict === "PASS" && pass.run.counters.correctionCount === 1;
    const blockedOk =
      blocked.run.verdict === "BLOCKED" && blocked.run.counters.workerCalls === 0;
    console.log(JSON.stringify({ passOk, blockedOk }, null, 2));
    process.exit(passOk && blockedOk ? 0 : 1);
  }

  console.log(`BuildLoop Bootstrap Orchestrator

Usage:
  bun src/orchestrator/cli.ts manifest
  bun src/orchestrator/cli.ts demo pass
  bun src/orchestrator/cli.ts demo blocked
  bun src/orchestrator/cli.ts validate
`);
}

function printResult(label: string, result: Awaited<ReturnType<BootstrapOrchestrator["runPassDemo"]>>) {
  console.log(
    JSON.stringify(
      {
        label,
        run: result.run,
        evidenceCount: result.evidence.length,
        workerReports: result.workerReports.length,
        decisionLog: result.decisionLog,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
