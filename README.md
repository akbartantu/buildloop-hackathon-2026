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

- Public landing page, docs, privacy, cookies, security, and terms routes
- Pilot waitlist form with server-side validation
- Google OAuth sign-in and protected workspace (`/app`)
- Multi-workspace projects with active workspace switching and project-scoped tasks
- Task creation with deterministic, task-specific contract scope (not broad `src/**` defaults)
- User acceptance criteria preserved through contract and checker paths
- English default UI with Bahasa Indonesia toggle
- Orchestrator runtime with coding worker (Google ADK + Gemini), independent checker, bounded correction loop (max 2)
- PASS / FAILED / BLOCKED verdicts with structured evidence
- **BLOCKED preflight** for sensitive goals (credential, deployment, protected paths)
- Contract review, lock, and execution against stored contract
- Human approval gate for commit (copy and UI boundary visible)
- Public GitHub repository connection, clone, and baseline capture
- Cloud Run deployment with Firestore runtime persistence and `/ready` health check

## Known limitations

- Commit / push / merge / deploy execution remains approval-gated; automatic Git commit is not enabled in this release
- Semantic scope planning uses deterministic repository inspection; full Gemini scope reasoning is a future enhancement when confidence is low
- Private GitHub OAuth is out of hackathon scope (public repos only)
- Production Supabase `projects` migration may still need to be applied on hosted environment (see deployment notes)

## Current architecture

```
Browser UI (TanStack Start + React, EN/ID)
  → Server functions (tasks, projects, orchestration)
  → Supabase Auth + Postgres (users, projects, tasks, approvals)
  → BuildLoop Orchestrator (Cloud Run)
      → Policy preflight + contract lock
      → Repository-aware scope planning
      → Google ADK + Gemini coding worker
      → Independent deterministic checker
      → Bounded correction loop (max 2)
      → Firestore (runs, evidence, decisions)
  → Human approval gate (commit / push / merge / deploy)
```

Supabase holds relational product state. Firestore holds orchestrator runtime/evidence only.

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

**Build-time public (Vite client bundle):**

Required when running `bun run build` or building the Cloud Run Docker image. These values are embedded in the browser bundle and are safe to expose publicly (Supabase publishable key).

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

**Runtime server (Node / Cloud Run):**

Set on the Cloud Run service at deploy time. Not injected into the browser bundle after the image is built.

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL` — canonical origin for sitemap and OAuth redirects
- `GEMINI_API_KEY` — server-only (Secret Manager on Cloud Run)
- `BUILDLOOP_CRON_SECRET` — cron auth (internal, if used)
- `BUILDLOOP_CRON_SECRET_PREVIOUS` — cron auth rotation (internal, if used)

For Cloud Run, pass `VITE_SUPABASE_*` as Docker build args (see `cloudbuild.yaml`). Keep `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` as runtime secrets only.

## Routes

| Route                                      | Access                               |
| ------------------------------------------ | ------------------------------------ |
| `/`                                        | Public landing                       |
| `/auth`, `/auth/callback`                  | Sign-in                              |
| `/app`                                     | Authenticated workspace              |
| `/docs`, `/privacy`, `/cookies`, `/security`, `/terms` | Public legal & docs pages          |
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

See also [SECURITY.md](SECURITY.md) and the in-app Privacy, Cookie, and Security pages (`/privacy`, `/cookies`, `/security`).

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
