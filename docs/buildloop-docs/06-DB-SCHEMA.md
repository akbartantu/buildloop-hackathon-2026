# DB Schema — Logical Firestore Model

## 1. Purpose

Firestore stores orchestration state and evidence. It is not the authority for repository content itself.

## 2. Collections

### `projects/{projectId}`

Fields:
- `name`
- `workspace_type`
- `repository_ref` optional
- `default_branch` optional
- `protected_paths`
- `created_at`
- `updated_at`

### `tasks/{taskId}`

Fields:
- `project_id`
- `title`
- `input_text`
- `status`
- `active_contract_version`
- `created_by`
- `created_at`
- `updated_at`

### `tasks/{taskId}/contracts/{versionId}`

Fields:
- `version`
- `goal`
- `in_scope[]`
- `out_of_scope[]`
- `acceptance_criteria[]`
- `protected_paths[]`
- `required_checks[]`
- `approval_required_actions[]`
- `max_correction_attempts`
- `created_at`
- `frozen_at`

Contract versions should not be silently mutated after a run begins.

### `tasks/{taskId}/runs/{runId}`

Fields:
- `contract_version`
- `status`
- `started_at`
- `completed_at`
- `attempt_count`
- `final_decision`
- `block_reason` optional
- `error_code` optional

### `tasks/{taskId}/runs/{runId}/attempts/{attemptId}`

Fields:
- `attempt_number`
- `worker_type`
- `started_at`
- `completed_at`
- `worker_summary`
- `changed_files[]`
- `result`

### `tasks/{taskId}/runs/{runId}/checks/{checkId}`

Fields:
- `attempt_number`
- `checker_type`
- `hard_violations[]`
- `unmet_criteria[]`
- `correctable_findings[]`
- `required_check_results[]`
- `evidence_refs[]`
- `created_at`

### `tasks/{taskId}/runs/{runId}/evidence/{evidenceId}`

Fields:
- `type`
- `label`
- `summary`
- `artifact_ref` optional
- `sha256` optional
- `created_at`

Do not store raw credentials or unnecessary secret-bearing command output.

### `approval_requests/{approvalId}`

Fields:
- `task_id`
- `run_id`
- `action_type`
- `action_summary`
- `requested_at`
- `status` (`PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`)
- `decided_by` optional
- `decided_at` optional

### `decision_events/{eventId}`

Fields:
- `task_id`
- `run_id`
- `event_type`
- `previous_state`
- `new_state`
- `reason`
- `evidence_refs[]`
- `created_at`

This collection acts as an append-oriented audit trail.

## 3. Index considerations

Likely queries:

- tasks by project + updated date;
- runs by task + start date;
- pending approval requests;
- decision events by run.

Only create composite indexes demonstrated to be necessary.

## 4. Security model

Client should not be able to arbitrarily write final decisions or approval outcomes.

Sensitive state transitions should be performed by trusted backend logic.

## 5. Data retention

For the hackathon, retain enough evidence to reproduce demo runs.

Avoid storing full repository contents in Firestore.

## 6. Schema evolution

Prefer additive changes.

Do not destructively rewrite evidence or audit history during the hackathon.
