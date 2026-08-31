# BuildLoop

BuildLoop is a governed autonomous software-delivery orchestrator. It completes bounded software-development tasks autonomously while preserving human control over security-sensitive and irreversible actions.

BuildLoop is **not** a coding chatbot. It coordinates a coding worker, an independent checker, a bounded correction loop, structured evidence, verdicts, and human approval gates.

## Problem

AI coding tools can change files outside scope, add dependencies without review, and claim completion without verifiable evidence. BuildLoop addresses this by locking a task contract before execution, running deterministic policy checks, and requiring explicit human approval before irreversible actions.

## How BuildLoop works

1. **Task → contract** — Goal, scope, acceptance criteria, and allowed paths are locked before execution.
2. **Policy preflight** — Deterministic rules block credential handling, deployment, protected paths, and other sensitive intent before any worker runs.
3. **Coding worker** — Produces patches inside an isolated sandbox/worktree within contract scope.
4. **Independent checker** — Read-only deterministic checks produce structured evidence; the checker never mutates code.
5. **Bounded self-correction** — Up to two automatic correction attempts when checks fail for fixable reasons.
6. **Verdict** — `PASS`, `FAILED`, or `BLOCKED` with evidence and a decision log.
7. **Human approval** — Commit, push, merge, and deploy remain explicitly approval-gated.

## Role separation

| Role                       | Responsibility                                                             |
| -------------------------- | -------------------------------------------------------------------------- |
| **BuildLoop Orchestrator** | State machine, policy preflight, run lifecycle, verdict decisions          |
| **Coding Worker**          | Produces patches within locked contract scope                              |
| **Independent Checker**    | Deterministic checks and structured evidence; never mutates code           |
| **Human Approval**         | Explicit gates for execute, commit, push, merge, deploy                    |

## What works today

- Public landing page, docs, privacy, cookies, security, and terms routes
- Pilot waitlist form with server-side validation
- Google OAuth sign-in and protected workspace (`/app`)
- Multi-workspace projects with active workspace switching and project-scoped tasks
- Task creation with deterministic, task-specific contract scope (not broad `src/**` defaults)
- User acceptance criteria preserved through contract and checker paths
- English default UI with Bahasa Indonesia toggle
- Orchestrator runtime with coding worker (Google ADK + Gemini for real tasks; deterministic demo worker for CLI demos), independent checker, bounded correction loop (max 2)
- PASS / FAILED / BLOCKED verdicts with structured evidence
- **BLOCKED preflight** for sensitive goals (credential, deployment, protected paths)
- Contract review, lock, and execution against stored contract
- Edit Plan preserves task identity; `contractVersion` increments (v1 → v2 → v3) with prior summaries in `contractHistory` inside the task's `contract` JSON (Supabase JSONB and dev store)
- Protected-path approval flow (runtime stop + human approve/reject/resume in UI)
- Human approval gate for commit (copy and UI boundary visible)
- Public GitHub repository connection, clone, and baseline capture
- Cloud Run + Firestore orchestrator persistence **implemented in repository**; hosted service documented in [AGENTS.md](AGENTS.md) (live `/ready` verified: `ready: true`, `persistence: firestore`)

## Architecture

```
Browser UI (TanStack Start + React, EN/ID)
  → Server functions (tasks, projects, orchestration)
  → Supabase Auth + Postgres (users, projects, tasks, approvals)
  → BuildLoop Orchestrator (Cloud Run)
      → Policy preflight + contract lock
      → Repository-aware scope planning
      → Google ADK + Gemini coding worker (real tasks)
      → Independent deterministic checker
      → Bounded correction loop (max 2)
      → Firestore (runs, evidence, decisions)
  → Human approval gate (commit / push / merge / deploy)
```

**Persistence boundaries**

| Store | Purpose |
| ----- | ------- |
| **Supabase** | Authentication and relational product state (users, projects, tasks, approvals). Task contracts include `contractVersion` and optional `contractHistory[]` snapshots after Edit Plan revisions (stored in `tasks.contract` JSONB — not a separate contracts table). |
| **Firestore** | Orchestrator runtime state and evidence when `BUILDLOOP_PERSISTENCE=firestore` (collection `buildloopRuns`; each run records the `contractVersion` at execution time) |
| **Local `.buildloop/`** | Development checkpoints, sandbox copies, dev task store, and local persistence when `BUILDLOOP_PERSISTENCE=local` (default for CLI demos) |

See also [docs/architecture.md](docs/architecture.md) and [AGENTS.md](AGENTS.md) for deployment details.

## Tech stack

- Bun, TypeScript, TanStack Start, TanStack Router, React 19
- Tailwind CSS v4, shadcn/ui
- Supabase (Auth + Postgres)
- Google Agent Development Kit (ADK) + Gemini (`gemini-3.6-flash`)
- Google Cloud Run (hosted runtime — deployed per [AGENTS.md](AGENTS.md))
- Firestore (orchestrator runtime persistence when `BUILDLOOP_PERSISTENCE=firestore`)

## Reproducible Testing

This section documents how judges and reviewers can reproduce BuildLoop's core demo scenarios from the repository **without production secrets**, plus optional live verification paths.

### Prerequisites

- [Bun](https://bun.sh) **1.3+**
- Git (orchestrator demos capture a workspace baseline from the cloned repository)
- For CLI **PASS** demo: a **clean Git working tree** (no uncommitted changes). The CLI does not enable `allowDirtyWorkspace`; uncommitted changes cause preflight to stop the run before the worker executes.
- For the full web UI with OAuth: a Supabase project (public URL and publishable key only — see environment variables below)
- For live Gemini execution: `GEMINI_API_KEY` (not required for deterministic CLI demos)
- For hosted Cloud Run verification: no local credentials required beyond `curl` to public endpoints

### Installation

```sh
git clone git@github.com:akbartantu/buildloop-hackathon-2026.git
cd buildloop-hackathon-2026
bun install
```

### Environment variables

Names only — never commit real values.

**Deterministic CLI demos (`orchestrator:demo:*`, `orchestrator:validate`)**

No API keys or cloud credentials required. Demos use the deterministic `demo-worker` and local persistence (`.buildloop/`).

**Local web UI (`bun run dev`)**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- Optional local-only: `DEV_AUTH_BYPASS=true` (development auth bypass; must not be used in production)

**Runtime server (full app / production)**

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL` — canonical origin for sitemap and OAuth redirects
- `GEMINI_API_KEY` — server-only; required for live ADK/Gemini worker on real tasks
- `BUILDLOOP_PERSISTENCE` — `local` (default) or `firestore`
- `FIRESTORE_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT` — required when `BUILDLOOP_PERSISTENCE=firestore`
- `BUILDLOOP_FIRESTORE_EMULATOR` — set to `1` for local Firestore emulator testing
- `NODE_ENV` — `production` on Cloud Run
- `BUILDLOOP_CRON_SECRET`, `BUILDLOOP_CRON_SECRET_PREVIOUS` — internal cron auth (if used)

For Cloud Run, pass `VITE_SUPABASE_*` as Docker build args (see `cloudbuild.yaml`). Keep `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` as runtime secrets only.

**Production build (`bun run build`)**

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time (placeholder values are sufficient for a compile-only verification).

### Run locally

```sh
bun run dev
```

Dev server listens on **http://localhost:8080** (see `vite.config.ts`).

Verify readiness:

```sh
bun run dev:status
```

### Reproduce the PASS scenario

```sh
bun run orchestrator:demo:pass
```

**What this runs**

- **Task goal:** Clarify workspace copy in `src/components/site/app-shell.tsx` so new users understand tasks run in a controlled sandbox and sensitive actions require human approval (Indonesian demo goal in `src/orchestrator/scenarios/pass.ts`).
- **Worker:** Deterministic `DemoPassWorker` (`workerId: "demo-worker"`) — **not** live Gemini. No `GEMINI_API_KEY` required.
- **Sandbox:** Isolated copy under `.buildloop/sandbox/<runId>/` (Git worktree when the workspace is a Git repository).
- **Checker:** `DeterministicChecker` with command execution skipped for demo scenarios.
- **Correction loop:** Attempt 1 applies partial workspace copy; checker fails because approval guidance is missing. Attempt 2 applies the full copy with approval guidance and passes checks.
- **Expected counters (clean working tree):** `verdict: "PASS"`, `status: "AWAITING_APPROVAL"`, `workerCalls: 2`, `correctionCount: 1`, `filesChanged > 0` in the sandbox only.
- **Evidence:** Structured preflight, worker, checker, and decision-log entries printed as JSON. Source repository files are not modified outside the sandbox/worktree.

**Terminal verdict vs UI status:** The orchestrator may report `status: "AWAITING_APPROVAL"` while `verdict: "PASS"`. PASS means checks passed inside the bounded run; it does **not** auto-commit, push, merge, or deploy.

**If the working tree is dirty:** Preflight stops with `verdict: "BLOCKED"`, `rule: "PREFLIGHT_BLOCKED"`, and `workerCalls: 0`. Stash or commit local changes first, or run the equivalent automated test (which allows a dirty tree in CI/dev):

```sh
bun test src/orchestrator/scenario-validation.test.ts -t "Scenario B"
```

Exit code **0** when `verdict === "PASS"`.

### Reproduce the BLOCKED scenario

```sh
bun run orchestrator:demo:blocked
```

**What this runs**

- **Task goal:** Automatic production deployment, storing credentials in env, running on the `main` branch (`BLOCKED_DEMO_GOAL` in `src/orchestrator/scenarios/pass.ts`).
- **Governance rule:** `detectSensitiveIntent` in `src/lib/sensitive-intent.ts` matches deployment, credential, and main-branch patterns during **policy preflight** (`runPreflight`).
- **Worker:** Must **not** execute. Expect `workerCalls: 0`, `checkerCalls: 0`, `filesChanged: 0`.
- **Expected result:** `verdict: "BLOCKED"`, `status: "BLOCKED"`, `rule: "PREFLIGHT_BLOCKED"`, `verdictReason: "Preflight policy detected forbidden intent."`, plus preflight evidence naming the matched rules (for example `CREDENTIAL_HANDLING`, `PRODUCTION_DEPLOYMENT`, `MAIN_BRANCH_WRITE`).

This scenario works even when the Git working tree is dirty.

Exit code **0** when blocked preflight succeeds with zero worker activity.

### Automated validation

Compact repository validation sequence:

```sh
bun run typecheck
bun test
bun run build    # requires VITE_SUPABASE_* at build time
```

Orchestrator scenario gate (both demos; PASS portion requires a clean working tree):

```sh
bun run orchestrator:validate
```

On success, prints `{"passOk":true,"blockedOk":true}` and exits **0**.

Optional:

```sh
bun run lint
```

Do **not** use `bun run format` as a test prerequisite — it rewrites files.

Focused orchestrator tests:

```sh
bun test src/orchestrator/scenario-validation.test.ts
```

### Live Gemini and Google ADK verification

| Path | Worker | Model | Secrets |
| ---- | ------ | ----- | ------- |
| CLI demos (`orchestrator:demo:pass`) | `demo-worker` (deterministic) | N/A | None |
| Real repository tasks (UI / product orchestrator) | `adk-gemini-worker` via Google ADK | `gemini-3.6-flash` | `GEMINI_API_KEY` |

Live worker implementation: `src/orchestrator/adk/gemini-agent.ts` (`AdkGeminiWorker`), Gemini client default model in `src/orchestrator/gemini/client.ts`.

Operational failures (HTTP 429 quota, timeouts, network errors) are classified separately from semantic coding failures and may surface as `GEMINI_QUOTA_EXHAUSTED` or `GEMINI_OPERATIONAL_FAILURE` rather than a normal checker FAIL/PASS cycle. Quota exhaustion is an external limitation, not evidence that governance or the checker failed.

Hosted readiness exposes whether Gemini is configured:

```sh
curl -s https://buildloop-151062816499.asia-southeast1.run.app/ready
```

Expected shape: `ready`, `persistence`, `geminiConfigured`, `errors`, `warnings`.

### Google Cloud deployment

- **Runtime:** Google Cloud Run (`buildloop` service, `asia-southeast1`, project `buildloop-hackathon-2026`)
- **Public app URL:** https://buildloop-151062816499.asia-southeast1.run.app
- **Health:** `/health` (liveness), `/ready` (environment + persistence + Gemini configuration)
- **Firestore:** When `BUILDLOOP_PERSISTENCE=firestore`, orchestrator runs and evidence persist in collection **`buildloopRuns`**
- **Deploy flow:** Canonical commands in [AGENTS.md](AGENTS.md) (`cloudbuild.yaml`, Secret Manager for `supabase-service-role` and `gemini-api-key`)
- **Verified live (Aug 2026):** `/ready` returned `ready: true`, `persistence: "firestore"`, `geminiConfigured: true`, `errors: []`

## Routes

| Route                                      | Access                               |
| ------------------------------------------ | ------------------------------------ |
| `/`                                        | Public landing                       |
| `/auth`, `/auth/callback`                  | Sign-in                              |
| `/app`                                     | Authenticated workspace              |
| `/docs`, `/privacy`, `/cookies`, `/security`, `/terms` | Public legal & docs pages          |
| `/sitemap.xml`                             | Public sitemap (uses `APP_BASE_URL`) |

## Safety principles

- Locked contracts are immutable at execution time
- Maximum automatic corrections default to **2**
- **BLOCKED** for policy violations; **FAILED** only after correction limit or system failure
- PASS does not auto-commit, push, merge, or deploy
- Protected paths include `.env*`, CI workflows, migrations, Supabase integration, and lockfiles
- Secrets are never stored in evidence or client bundles

See also [SECURITY.md](SECURITY.md) and the in-app Privacy, Cookie, and Security pages (`/privacy`, `/cookies`, `/security`).

## Known limitations

- Commit / push / merge / deploy execution remains approval-gated; automatic Git commit is not enabled in this release
- CLI PASS demo requires a clean Git working tree; dirty-tree reproduction uses `bun test src/orchestrator/scenario-validation.test.ts` (Scenario B)
- Semantic scope planning uses deterministic repository inspection; full Gemini scope reasoning is a future enhancement when confidence is low
- Private GitHub OAuth is out of hackathon scope (public repos only)
- Live Gemini calls are quota-dependent; HTTP 429 and similar operational errors are classified separately from semantic coding failures
- Production Supabase `projects` migration may still need to be applied on the hosted environment (see deployment notes in [AGENTS.md](AGENTS.md))
- Contract history stores summary snapshots inside `contractHistory` (goal, criteria, inScope per version), not full immutable contract documents in a separate table; orchestrator run history lives separately in Firestore when enabled

## Hackathon requirements (verified in repository)

| Requirement | Evidence | Verified by |
| ----------- | -------- | ----------- |
| Gemini coding worker | `src/orchestrator/adk/gemini-agent.ts`, model `gemini-3.6-flash` | Code + live `/ready` (`geminiConfigured: true`) |
| Google ADK | `@google/adk` dependency, ADK runner in `src/orchestrator/adk/` | Code + ADK integration tests |
| Cloud Run | `Dockerfile`, `cloudbuild.yaml`, [AGENTS.md](AGENTS.md) deploy flow | Code + live `/ready` on public URL |
| Firestore runtime store | `src/orchestrator/persistence/firestore-store.ts`, collection `buildloopRuns` | Code + tests + live `/ready` (`persistence: firestore`) |
| PASS scenario with correction loop | `bun run orchestrator:demo:pass`, Scenario B in `scenario-validation.test.ts` | Automated tests (CLI requires clean Git tree) |
| BLOCKED scenario (preflight) | `bun run orchestrator:demo:blocked`, Scenario E in `scenario-validation.test.ts` | CLI demo + automated tests |
| Deterministic checker + max 2 corrections | `DeterministicChecker`, `MAX_ATTEMPTS = 2` in contract schema | Scenario B + governance tests |
| Protected-path approval | `protected-path-approval-flow.ts`, UI panel | Code + flow tests |
| Human-gated commit/push/merge/deploy | `human-approval.ts`, orchestrator decision engine | Code + UI copy; no auto-commit in release |
| Architecture & demo docs | [docs/architecture.md](docs/architecture.md), [docs/demo-script.md](docs/demo-script.md) | This reconciliation |

## Additional documentation

- [docs/demo-script.md](docs/demo-script.md) — recorded demo script
- [docs/submission-checklist.md](docs/submission-checklist.md) — submission checklist
- [docs/buildloop-docs/](docs/buildloop-docs/) — product and technical specifications
- UI mockups: `docs/mockups/` (26 screens)

## License

See repository license file when published.
