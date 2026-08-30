# Safe Personal Mode — Architecture & Deployment Topology

Last verified: 2026-08-29

## Execution Modes

### Local Safe Personal Mode (primary)

- User machine runs BuildLoop orchestrator with access to local Git repository.
- Git worktree isolation under `.buildloop/worktrees/{runId}/`.
- Worker path:
  - **Demo/test goals** → `DemoPassWorker` (explicit demo configuration only).
  - **Real-project goals** → `AdkGeminiWorker` via official `@google/adk` (`LlmAgent` + `InMemoryRunner`) and Gemini (`GEMINI_API_KEY`).
- No silent fallback from real mode to demo worker.
- Checker runs required commands with exit-code evidence (`bun run typecheck`, `bun test`, etc.).
- Persistence: `BUILDLOOP_PERSISTENCE=local` (default) → `.buildloop/runs/` + checkpoints.

### Hosted Control Plane (Cloud Run)

- Serves UI/API and optional Firestore-backed state.
- **Does not** claim direct access to user's local filesystem or arbitrary local Git repos.
- Repository execution remains on local agent / user's machine.
- Requires: `SUPABASE_*`, `FIRESTORE_PROJECT_ID`, `FIRESTORE_SERVICE_ACCOUNT_JSON` (or emulator), `GEMINI_API_KEY`.

## Worker Routing

| Goal type | Worker | Mode |
|-----------|--------|------|
| PASS demo goal (sandbox+approval keywords) | `demo-worker` | demo |
| Sensitive/blocked intent | preflight block | — |
| All other real tasks | `adk-gemini-worker` | real |

If `GEMINI_API_KEY` missing in real mode:

> Real AI worker belum dapat dijalankan karena konfigurasi Gemini belum tersedia.

## Google ADK

BuildLoop uses **official `@google/adk` v2** in the real worker path (`AdkGeminiWorker`):

- Package: `@google/adk@2.0.0` (Google-published, `google/adk-js`).
- Runtime: `LlmAgent` + `InMemoryRunner.runEphemeral()` + `Gemini` model class from ADK.
- BuildLoop adapter: `src/orchestrator/adk/runner.ts` → invoked by `AdkGeminiWorker`.
- Model: `gemini-3.6-flash` (live-verified).
- Structured JSON output validated by BuildLoop schema before patch application.
- BuildLoop orchestrator retains lifecycle authority; ADK does **not** self-award PASS.

## Gemini Operational Retry (separate from correction)

- Retryable: HTTP 429, 5xx, timeout, transient network errors.
- Non-retryable: invalid key (401/403), malformed output, missing config.
- Policy: initial call + up to 3 operational retries (~1s/2s/4s exponential + jitter, cap 20s total).
- Honors `Retry-After` when present (capped at 30s).
- Operational failures use decision rule `OPERATIONAL_FAILURE` — **does not consume `correctionCount`**.
- Quota exhausted message: *Gemini sedang mencapai batas penggunaan...*

## Checker Command Evidence

For each required command, checker captures:

- command name
- started_at / finished_at (via evidence timestamp)
- exit_code
- stdout/stderr summary (redacted)
- timeout status

Worker claims of "tests passed" are insufficient — exit code must be 0.

## Persistence

| Mode | Env | Storage |
|------|-----|---------|
| local | `BUILDLOOP_PERSISTENCE=local` (default) | `.buildloop/runs/`, `.buildloop/checkpoints/` |
| firestore | `BUILDLOOP_PERSISTENCE=firestore` | Firestore REST or `.buildloop/firestore/` emulator |

Mid-run checkpoints persisted at: preflight, worker complete, checker complete.

## Environment Variables (names only)

- `GEMINI_API_KEY` — Gemini worker
- `GOOGLE_ADK_ENABLED` — ADK mode flag
- `BUILDLOOP_PERSISTENCE` — `local` | `firestore`
- `FIRESTORE_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT`
- `FIRESTORE_SERVICE_ACCOUNT_JSON` — inline service account JSON
- `BUILDLOOP_FIRESTORE_EMULATOR=1` — local Firestore-compatible storage
- `DEV_AUTH_BYPASS` — development only
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`

## Health Endpoints

- `GET /health` — process alive
- `GET /ready` — env validation + persistence + Gemini config status

## Known Limitations

1. Cloud Run cannot mutate user's local Git repository — local execution required.
2. Live Gemini dogfooding requires `GEMINI_API_KEY`.
3. Firestore production mode requires service account credentials.
4. Official Google ADK SDK not bundled — ADK-compatible shell used instead.

## Risk Register

See table in this file — key open items:

- **R11**: Live Gemini verification requires API key (code path wired).
- **R12**: Cloud/local Git — architecture boundary, not bug.
- **R13**: Firestore production requires credentials; emulator available locally.
