# Source of Truth and Documentation Drift

## 1. Why this file exists

BuildLoop has evolved quickly. The connected GitHub repository and the current hackathon development state are not yet fully synchronized.

This file prevents older repository documentation from being mistaken for the current product specification.

## 2. Evidence inspected on 29 August 2026

Connected GitHub repository:
`akbartantu/buildloop`

The current GitHub `main` root contains primarily:

- `.buildloop/`
- `tools/`

The inspected `.buildloop/project-context.md` describes an earlier validation stage in which BuildLoop was still primarily a manual governance workflow.

Recent GitHub commits visible through the connected repository are from July 2026 and include BL-012 lifecycle records.

## 3. Current hackathon state reported in project work

More recent implementation progress provided during the hackathon work reports substantially newer capabilities, including:

- orchestrator domain;
- contract handling;
- preflight;
- worker report;
- separate deterministic checker;
- decision engine;
- decision log;
- CLI;
- bounded self-correction;
- PASS/BLOCKED-oriented workflow;
- UI work and local development mode.

These newer claims must be verified against the latest actual working repository before final submission documentation states them as proven facts.

## 4. Authority order for hackathon documentation

Use this priority:

1. actual latest repository/runtime evidence;
2. passing tests and demo traces;
3. current task contracts/checkpoint reports;
4. this documentation pack;
5. older `.buildloop` product hypotheses.

## 5. Required reconciliation before submission

Before publishing the final README/Devpost description:

- ensure the latest implementation is in the submission repository;
- re-audit file tree and architecture;
- confirm Gemini model/version actually used;
- confirm Google ADK integration actually executes;
- confirm Cloud Run/Firestore components actually used;
- run PASS scenario;
- run BLOCKED scenario;
- capture test output;
- capture cloud evidence;
- update architecture and schema docs to match implementation exactly.

## 6. Rule

No document should claim a capability is complete merely because it is planned here.
