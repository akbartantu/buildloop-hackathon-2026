# BuildLoop Task Contract Template

## Metadata

- Task ID:
- Contract Version:
- Project:
- Created At:
- Maximum Automatic Correction Attempts: 2

## 1. Goal

Describe one observable software-development outcome.

## 2. Current State

State only facts verified from the repository or runtime.

## 3. In Scope

- 
- 
- 

## 4. Out of Scope

- 
- 
- 

## 5. Acceptance Criteria

Use observable conditions.

1. 
2. 
3. 

## 6. Allowed Areas

Files, folders, services, or modules that may be changed.

- 

## 7. Protected Areas

Files, folders, services, secrets, or configuration that may not be changed without explicit approval.

- 

## 8. Dependency Policy

- New dependencies allowed? Yes / No / Approval required
- Dependency-system files protected? Yes / No

## 9. Required Checks

- 
- 
- 

Examples: targeted unit tests, typecheck, lint, build, deterministic checker.

## 10. Worker Instructions

- inspect before writing;
- make the smallest change satisfying the contract;
- do not expand scope;
- do not claim final PASS;
- report changed files and checks;
- stop on protected/sensitive action.

## 11. Checker Instructions

Evaluate independently:

- actual changed files;
- acceptance criteria;
- protected-path compliance;
- dependency changes;
- required check results;
- evidence quality.

## 12. Correction Policy

Automatic correction may occur only when:

- no hard guardrail has been triggered;
- the original scope remains valid;
- the issue is specifically identified;
- fewer than two correction attempts have occurred.

## 13. Approval-Required Actions

Always require explicit human approval for applicable actions:

- commit;
- push;
- merge;
- deploy;
- protected-path override;
- sensitive dependency change;
- credential-dependent action.

## 14. Stop Conditions

Immediately stop autonomous execution when:

- protected path is required/touched;
- credential or permission is missing;
- requested work exceeds contract materially;
- irreversible action is reached without approval;
- safety policy cannot determine authorization.

## 15. Required Evidence at Completion

- changed files;
- checker findings;
- check/test output summary;
- attempt count;
- final status;
- reason for BLOCKED/FAILED if applicable;
- outstanding human approval.

## 16. Final Decision Rules

- Hard guardrail violation → BLOCKED
- All required criteria evidenced → PASS
- Criteria unmet after allowed attempts → FAILED
