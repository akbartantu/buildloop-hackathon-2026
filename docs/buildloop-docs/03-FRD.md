# FRD — Functional Requirements Document

## 1. Functional model

BuildLoop operates as a state machine. Each transition must be attributable to a rule, execution result, checker result, or human decision.

## 2. Suggested state lifecycle

`DRAFT → CONTRACT_READY → PREFLIGHT → RUNNING → CHECKING → CORRECTING → PASS | FAILED | BLOCKED → AWAITING_APPROVAL | CLOSED`

Not every implementation must expose every internal state in the UI.

## 3. Task creation

Input:
- project/workspace;
- task description;
- optional constraints.

System behavior:
1. normalize task description;
2. generate bounded contract;
3. identify assumptions;
4. identify sensitive areas;
5. refuse to silently broaden scope.

## 4. Contract fields

Required:

- `task_id`
- `title`
- `goal`
- `in_scope`
- `out_of_scope`
- `acceptance_criteria`
- `protected_paths`
- `required_checks`
- `approval_required_actions`
- `max_correction_attempts`
- `contract_version`

Contracts must be versioned or treated immutably once execution begins.

## 5. Preflight

Preflight must evaluate:

- required contract fields exist;
- task is bounded enough to run;
- requested path is not already disallowed;
- no credential is required;
- no unauthorized irreversible action is required;
- dependency changes are either explicitly allowed or blocked;
- configured protected paths are understood.

Possible results:

- READY
- BLOCKED
- NEEDS_INPUT / FAILED_VALIDATION (internal naming may vary)

## 6. Worker

The worker receives only the information necessary to perform the task.

Worker responsibilities:

- inspect before modifying;
- make the smallest reasonable change;
- run requested local checks;
- produce structured evidence/report.

Worker restrictions:

- cannot assign final decision;
- cannot override protected paths;
- cannot expand contract scope;
- cannot commit/push/merge/deploy without approval.

## 7. Checker

Checker responsibilities:

- independently inspect worker output;
- compare actual changes with contract;
- verify acceptance criteria;
- inspect required checks;
- detect hard policy violations;
- produce structured findings.

Checker output should separate:

- hard violations;
- unmet acceptance criteria;
- correctable defects;
- evidence;
- informational notes.

## 8. Decision engine

Priority:

1. Hard guardrail violation → BLOCKED.
2. Required criteria satisfied → PASS.
3. Correctable and attempts remain → CORRECTING.
4. Criteria unsatisfied and no attempts remain → FAILED.

A language model must not override deterministic hard-rule results.

## 9. Self-correction

Maximum: two attempts.

A correction prompt should include only:

- failed criteria;
- relevant evidence;
- allowed scope;
- prohibited changes;
- required checks.

Correction must not silently modify the original contract.

## 10. Protected paths

If changed or requested without approval:

- record exact protected path;
- stop further autonomous modification;
- mark BLOCKED;
- preserve evidence;
- present safe next action to user.

## 11. Dependency rule

New or changed dependencies require one of:

- explicit contract permission; or
- human approval.

If the repository policy marks dependency system files as protected, modifications are treated accordingly.

## 12. Credential rule

BuildLoop must not:

- print secrets;
- ask the worker to expose secrets;
- persist raw credentials in evidence;
- modify credential files without explicit authority.

Missing credentials required for a sensitive action should produce a stop/blocked condition, not workaround behavior.

## 13. Approval gate

Approval is mandatory before:

- commit, when configured as protected;
- push;
- merge;
- deploy;
- production resource creation;
- sensitive dependency changes;
- protected-path overrides.

Approval must refer to a specific task/run and action.

## 14. Evidence record

Evidence should include:

- run ID;
- contract version;
- worker attempt number;
- changed file list;
- checker findings;
- test/check results;
- block reason if any;
- human approval event if any.

## 15. Failure handling

Operational errors such as model timeout should not be mislabeled as BLOCKED unless a safety boundary was actually triggered.

Use FAILED or an internal operational-error state depending on implementation.

## 16. Demo determinism

Both hackathon scenarios should rely on predictable inputs and deterministic policy checks wherever possible.

The demo must not depend solely on the model “choosing” to behave safely.
