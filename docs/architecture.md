# BuildLoop Architecture

```mermaid
flowchart TB
  User[Human Project Owner]
  UI[BuildLoop UI]
  Supabase[(Supabase Auth + Tasks)]
  Bootstrap[Bootstrap / Product Orchestrator]
  Preflight[Policy Preflight]
  Worker[Coding Worker]
  Checker[Independent Checker]
  Decision[Decision Engine]
  Evidence[Evidence + Decision Log]
  Approval[Human Approval Gates]
  Firestore[(Firestore Runtime — planned)]
  CloudRun[Cloud Run Orchestrator — planned]

  User --> UI
  UI --> Supabase
  UI --> Bootstrap
  Bootstrap --> Preflight
  Preflight -->|safe| Worker
  Preflight -->|blocked| Decision
  Worker --> Checker
  Checker --> Decision
  Decision -->|correction| Worker
  Decision --> Evidence
  Decision --> Approval
  Evidence --> UI
  Bootstrap -.-> Firestore
  Bootstrap -.-> CloudRun
```

## Role separation

| Component | Responsibility |
|-----------|----------------|
| Orchestrator | State machine, preflight, verdict from evidence |
| Coding Worker | Patches in sandbox (`demo-worker`, future `gemini-worker`) |
| Independent Checker | Read-only deterministic checks |
| Human | Execute / commit / push / merge / deploy approval |

## Persistence boundaries

- **Supabase**: authentication, tasks, contracts, execution approval log
- **Local `.buildloop/`**: sandbox runs, manifest revisions (dev)
- **Firestore** (planned): runs, attempts, checker evidence, decision logs

## Demo scenarios

- **PASS**: workspace copy task with one correction → `AWAITING_APPROVAL`
- **BLOCKED**: credential/deployment/main branch goal → preflight, worker calls = 0
