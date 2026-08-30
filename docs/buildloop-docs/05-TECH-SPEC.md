# TECH SPEC / ARCHITECTURE

## 1. Architecture objective

Implement the smallest credible governed autonomous execution loop for the hackathon.

## 2. Required Google technologies

### Google ADK
Primary orchestration framework.

### Gemini 3.5 or later
Used for bounded planning, worker reasoning, checker assistance, and/or correction guidance where appropriate.

### Google Cloud
At least one real service must be used and evidenced.

Target minimal deployment:

- Cloud Run — API/orchestrator or worker runtime;
- Firestore — task/run/evidence/approval state.

Pub/Sub or Cloud Tasks should only be added if background execution is actually necessary.

## 3. Logical components

### UI
Existing BuildLoop web interface.

Responsibilities:
- task input;
- contract review;
- run status;
- evidence presentation;
- approval controls.

### Orchestrator
Owns lifecycle and state transitions.

Responsibilities:
- contract lifecycle;
- preflight;
- attempt limits;
- worker invocation;
- checker invocation;
- decision engine;
- approval gate.

### Worker
Performs code changes within a bounded workspace.

### Checker
Read-only evaluator independent from worker verdict authority.

### Policy / Preflight engine
Deterministic rules for protected paths, sensitive files, credentials, dependencies, and disallowed actions.

### Decision engine
Maps evidence into PASS, FAILED, BLOCKED, or correction.

### Evidence store
Persists task/run/attempt/check/approval data.

## 4. Separation of authority

Worker:
- may produce changes;
- may report what it did;
- may not determine final PASS.

Checker:
- reads outputs;
- reports compliance;
- should not mutate task output.

Decision engine:
- enforces status logic;
- deterministic hard rules outrank model suggestions.

Human:
- retains authority over irreversible/sensitive actions.

## 5. Execution algorithm

1. Receive task.
2. Generate/validate contract.
3. Freeze contract version for run.
4. Run preflight.
5. If hard rule violated → BLOCKED.
6. Invoke worker.
7. Capture worker report and artifacts.
8. Invoke checker.
9. Apply decision rules.
10. If correction allowed and attempt count < 2 → focused correction.
11. Re-check.
12. Emit PASS, FAILED, or BLOCKED.
13. If subsequent sensitive action requested → create approval request.

## 6. Recommended module boundaries

Illustrative structure:

- `src/orchestrator/contracts`
- `src/orchestrator/preflight`
- `src/orchestrator/worker`
- `src/orchestrator/checker`
- `src/orchestrator/decision`
- `src/orchestrator/evidence`
- `src/orchestrator/approval`
- `src/adk`
- `src/cloud`
- `src/ui` or existing app structure

Actual repository conventions should win over this suggestion.

## 7. Model usage rules

Gemini should receive bounded context.

Do not rely on Gemini for:

- secret detection as the only control;
- protected-path enforcement as the only control;
- attempt counters;
- authorization;
- final irreversible-action approval.

Use deterministic code for those.

## 8. Local-first development

Prefer:

- local sandbox;
- mock worker where useful;
- Firestore emulator when suitable;
- deterministic fixtures;
- local verification.

Use real Google Cloud only where needed to prove integration/deployment evidence.

## 9. Observability

Every run should have structured logs for:

- task ID;
- run ID;
- contract version;
- current state;
- attempt number;
- checker result;
- final decision;
- block reason;
- approval event.

Never log secrets or raw credentials.

## 10. Cost controls

- no unnecessary always-on infrastructure;
- Cloud Run scale-to-zero where applicable;
- avoid background queues until needed;
- cap attempts;
- cap model context/output;
- reuse deterministic checks instead of model calls where possible.

## 11. Dependency discipline

New dependencies require justification and explicit permission when sensitive.

Avoid adding infrastructure libraries solely for demo polish.

## 12. Deployment boundary

Deployment itself is an approval-protected action.

The prototype may demonstrate a hosted Cloud Run backend, but an autonomous agent should not redeploy production without explicit approval.

## 13. Current evidence note

The connected GitHub `main` currently contains the older `.buildloop` governance workflow and tools, while the latest hackathon implementation progress has been reported separately. Before treating this document as implementation-complete, reconcile it with the latest working repository tree.
