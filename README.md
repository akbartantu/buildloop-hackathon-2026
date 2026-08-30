# BuildLoop

BuildLoop is a governed autonomous software-delivery orchestrator. It completes bounded software-development tasks autonomously while preserving human control over security-sensitive and irreversible actions.

BuildLoop is **not** a coding chatbot. It coordinates a coding worker, an independent checker, a bounded correction loop, structured evidence, verdicts, and human approval gates.

## Problem

AI coding tools can change files outside scope, add dependencies without review, and claim completion without verifiable evidence. BuildLoop addresses this by locking a task contract before execution, running deterministic policy checks, and requiring explicit human approval before irreversible actions.

## Role separation

| Role                       | Responsibility                                                             |
| -------------------------- | -------------------------------------------------------------------------- |
| **BuildLoop Orchestrator** | State machine, policy preflight, run lifecycle, verdict decisions          |
| **Coding Worker**          | Produces patches within locked contract scope (planned)                    |
| **Independent Checker**    | Deterministic checks and structured evidence; never mutates code (planned) |
| **Human Approval**         | Explicit gates for execute, commit, push, merge, deploy                    |

## What works today

- Public landing page, docs, security, privacy, and terms routes
- Pilot waitlist form with server-side validation
- Google OAuth sign-in and protected workspace (`/app`)
- Task creation with deterministic contract generation
- **BLOCKED preflight** for sensitive goals (credential, deployment, protected branch, etc.)
- Contract review and execution approval (`lockContract`)
- Structured blocked reasons and zero-change runner evidence in the UI

## Not yet implemented

The following are **submission targets** and are not claimed as working in this checkpoint:

- BuildLoop Orchestrator state machine (runtime)
- Coding worker (Gemini or demo adapter)
- Independent checker and correction loop
- PASS / FAILED / AWAITING_APPROVAL runtime transitions
- Contract versioning
- Task detail tabs (Overview, Contract, Orchestration, Evidence, Approval)
- Gemini integration
- Google ADK orchestration
- Cloud Run orchestrator service
- Firestore runtime store (runs, evidence, decisions)
- PASS and BLOCKED end-to-end demo scenarios with worker execution
- Commit / push / merge / deploy approval gates (beyond copy)

## Current architecture

```
Browser UI (TanStack Start + React)
  → Server functions (tasks, waitlist)
  → Supabase Auth + Postgres (tasks, approvals, waitlist)
  → Deterministic preflight policy (sensitive-intent)
```

Planned submission architecture:

```
UI → ADK Orchestrator (Cloud Run) → Policy → Worker → Checker → Evidence (Firestore) → Human Approval
```

Supabase remains the store for authentication and task/contract persistence. Firestore will hold orchestrator runtime state only — not duplicate entities.

## Tech stack

- Bun, TypeScript, TanStack Start, TanStack Router, React 19
- Tailwind CSS v4, shadcn/ui
- Supabase (Auth + Postgres)

## Local setup

Requires [Bun](https://bun.sh) 1.3+.

```sh
bun install
bun run dev
```

### Environment variables (names only)

**Client (Vite):**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

**Server:**

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL` — canonical origin for sitemap and absolute URLs (defaults to `http://localhost:5173`)
- `BUILDLOOP_CRON_SECRET` — cron auth (internal, if used)
- `BUILDLOOP_CRON_SECRET_PREVIOUS` — cron auth rotation (internal, if used)

Gemini and GCP variables will be documented when integration is implemented.

## Routes

| Route                                      | Access                               |
| ------------------------------------------ | ------------------------------------ |
| `/`                                        | Public landing                       |
| `/auth`, `/auth/callback`                  | Sign-in                              |
| `/app`                                     | Authenticated workspace              |
| `/docs`, `/security`, `/privacy`, `/terms` | Public                               |
| `/sitemap.xml`                             | Public sitemap (uses `APP_BASE_URL`) |

## Validation commands

```sh
bun run format
bun run lint
bun run typecheck
bun test
bun run build
```

## Safety principles

- Locked contracts are immutable at execution time
- Maximum automatic corrections default to **2**
- **BLOCKED** for policy violations; **FAILED** only after correction limit or system failure
- PASS does not auto-commit, push, merge, or deploy
- Protected paths include `.env*`, CI workflows, migrations, Supabase integration, and lockfiles
- Secrets are never stored in evidence or client bundles

## Known limitations

- Runner/orchestrator not connected; approved tasks stop at “waiting for runner”
- Contract is embedded in the task row without version history
- Production domain not finalized; configure `APP_BASE_URL` at deploy time
- No live Gemini, ADK, or GCP integration yet

## Hackathon / submission targets

- [ ] Gemini coding worker (server-side)
- [ ] Google ADK root orchestrator agent
- [ ] Cloud Run orchestrator service
- [ ] Firestore runtime store
- [ ] PASS scenario with correction loop
- [ ] BLOCKED scenario (preflight exists; full demo pending orchestrator)
- [ ] Architecture diagram and demo script
- [ ] Submission checklist and hosted URL

## Design reference

UI mockups live in `docs/mockups/` (26 screens). Checkpoint 1 aligned global design tokens only; full screen implementation is planned.

## License

See repository license file when published.
