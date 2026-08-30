# PRD — Product Requirements Document

## 1. Product overview

BuildLoop is a governed autonomous software-delivery orchestrator. A user provides a bounded coding goal. BuildLoop converts that goal into a task contract, performs preflight checks, runs a worker, checks the result independently, performs limited self-correction when appropriate, and returns a final decision with evidence.

## 2. Primary workflow

1. User enters a coding task.
2. BuildLoop creates a task contract.
3. User reviews/edits the contract when required.
4. Preflight checks validate the task and policy boundaries.
5. Worker attempts the implementation.
6. Checker evaluates actual output against the contract.
7. If fixable and permitted, BuildLoop performs a correction attempt.
8. Maximum correction attempts: two.
9. BuildLoop ends in PASS, FAILED, or BLOCKED.
10. Sensitive or irreversible actions require explicit human approval.

## 3. Public statuses

### PASS
All required checks and acceptance criteria have sufficient evidence.

### FAILED
The task did not satisfy the contract after allowed correction attempts, without triggering a hard safety boundary.

### BLOCKED
A hard guardrail, protected path, credential boundary, sensitive dependency change, or disallowed action prevents autonomous continuation.

These statuses must be derived from evidence, not from worker self-report.

## 4. Core product requirements

### PR-01 Task input
The user can submit a bounded software-development task using plain language.

### PR-02 Contract generation
BuildLoop creates a structured contract containing at least:

- goal;
- scope;
- out-of-scope items;
- acceptance criteria;
- protected areas;
- required checks;
- approval-required actions.

### PR-03 Contract review
The contract can be inspected before execution. Material assumptions should be visible rather than silently invented.

### PR-04 Preflight
BuildLoop evaluates whether the task is safe and sufficiently bounded to start.

### PR-05 Worker execution
A worker may implement the task but has no authority to declare final PASS.

### PR-06 Independent checker
A checker separately evaluates artifacts, changes, tests, and contract compliance.

### PR-07 Limited self-correction
A failed-but-correctable result may be returned to the worker with focused correction guidance. Maximum two correction attempts.

### PR-08 Hard blocking
BuildLoop must stop autonomous execution when a protected or security-sensitive condition is detected.

### PR-09 Evidence
Each decision must reference evidence such as changed files, test output, checker findings, or policy violations.

### PR-10 Human approval
Commit, push, merge, deploy, credential use, or similarly sensitive irreversible actions may not be performed without explicit approval.

## 5. PASS demo scenario

Recommended scenario:

> Add or modify a small safe UI/logic feature confined to approved files, with deterministic acceptance criteria and tests.

Expected flow:

Task → Contract → Preflight PASS → Worker → Checker → optional correction → PASS → approval boundary shown.

## 6. BLOCKED demo scenario

Recommended scenario:

> Task attempts to modify a protected path, credential file, deployment configuration, or unapproved dependency boundary.

Expected flow:

Task → Contract/Preflight or execution evidence → protected condition detected → BLOCKED → no prohibited action executed.

## 7. UX requirements

The user must be able to understand:

- what BuildLoop is doing now;
- what it was allowed to do;
- what changed;
- what passed or failed;
- why something was blocked;
- whether human action is required.

The interface should avoid fake certainty, generic “AI magic” language, or unexplained scores.

## 8. Advanced settings

Advanced configuration may include:

- model selection;
- API/provider configuration;
- project-specific protected paths;
- allowed dependency rules;
- maximum attempts;
- required checks.

For the hackathon, only settings needed by the vertical slice should be surfaced.

## 9. Repository/project model

A BuildLoop project represents an execution boundary around a codebase or controlled sandbox.

A user may eventually have multiple projects and multiple task contracts, but the hackathon prototype only needs to prove one active project/task flow reliably.

## 10. Authentication

Authentication should not be treated as the core innovation. Local/dev access may use a safe development bypass if clearly isolated from production behavior.

Google sign-in may be supported for the hosted experience, but auth failure must not prevent local testing of the core orchestration flow.

## 11. Acceptance criteria for the product slice

The hackathon core is acceptable when:

- a task contract is generated and visible;
- worker and checker are separated;
- the worker cannot self-award PASS;
- up to two correction attempts are enforced;
- PASS and BLOCKED scenarios run predictably;
- protected-path behavior is demonstrable;
- sensitive actions stop at approval;
- evidence is retained;
- Gemini and Google ADK are visibly part of the architecture;
- at least one backend execution is evidenced on Google Cloud.
