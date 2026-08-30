# Test Plan

## 1. Goal

Prove the BuildLoop governance loop, not merely the UI.

## 2. Test layers

### Unit
Test deterministic policy and decision functions.

### Integration
Test orchestrator → worker → checker → decision transitions.

### End-to-end
Test complete PASS and BLOCKED scenarios through the user-facing flow.

### Cloud smoke test
Prove the deployed Google Cloud path executes successfully at least once.

## 3. Critical unit tests

### Contract
- rejects missing goal;
- acceptance criteria retained;
- contract version frozen for active run.

### Preflight
- allowed task passes;
- protected path request blocks;
- credential-required task blocks/stops;
- disallowed dependency change blocks.

### Decision engine
- hard violation always produces BLOCKED;
- all criteria satisfied produces PASS;
- unmet correctable criteria with attempts remaining produces correction;
- unmet criteria after max attempts produces FAILED.

### Attempt limit
- attempt 1 allowed;
- attempt 2 allowed;
- attempt 3 cannot be automatically created.

### Approval
- push cannot execute without approval;
- approved action is tied to correct run/action;
- rejection leaves action unexecuted.

## 4. Worker/checker separation tests

- worker report cannot directly set final PASS;
- checker evaluates actual output;
- checker cannot mutate implementation;
- deterministic policy result overrides model opinion.

## 5. PASS scenario E2E

Given:
- safe bounded task;
- approved workspace;
- no protected paths touched.

Then:
- contract created;
- preflight ready;
- worker runs;
- checker verifies;
- correction occurs only if needed;
- final status PASS;
- evidence visible;
- no automatic push/merge/deploy.

## 6. BLOCKED scenario E2E

Given:
- task attempts protected modification.

Then:
- BuildLoop detects exact protected condition;
- prohibited change is not executed or is prevented before protected action takes effect;
- final status BLOCKED;
- reason and evidence displayed;
- user is told what approval/change would be required.

## 7. Self-correction test

Create a deterministic fixture in which attempt 1 fails one acceptance criterion and attempt 2 can repair it.

Verify:
- checker produces focused finding;
- correction remains in original scope;
- task passes or fails deterministically;
- no third automatic correction.

## 8. Failure-path tests

- model timeout;
- worker exception;
- checker exception;
- malformed worker output;
- unavailable Firestore;
- unavailable external auth in local dev.

These should not be mislabeled as security BLOCKED unless a guardrail was actually hit.

## 9. UI tests

Verify visible:

- task goal;
- contract boundaries;
- execution status;
- attempt count;
- checker findings;
- final decision;
- approval gate;
- development-mode indicator if bypassing auth locally.

## 10. Demo evidence checklist

Capture:

- PASS task input;
- generated contract;
- worker output;
- checker evidence;
- final PASS;
- BLOCKED task input;
- protected-path detection;
- proof prohibited action did not proceed;
- Google ADK/Gemini execution evidence;
- Cloud Run/Google Cloud execution evidence.

## 11. Exit criteria

Do not call the prototype demo-ready until both PASS and BLOCKED flows can be repeated without manual patching between runs.
