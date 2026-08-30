# BuildLoop — 4-Minute Demo Script

## 0:00 — Problem

AI coding tools can change files outside scope and claim completion without evidence. BuildLoop governs bounded tasks with contracts, independent checks, and human approval.

## 0:30 — Create task (PASS)

1. Sign in at `/auth`
2. Open `/app`
3. Create task: *Perjelas penjelasan workspace agar pengguna baru memahami bahwa task dijalankan di sandbox dan tindakan sensitif membutuhkan approval.*
4. Review contract → **Setujui & Siapkan Eksekusi**

## 1:00 — Orchestration + correction

1. Tab **Orchestration** → **Jalankan Orchestrator**
2. Show status transitions and **Evidence** tab
3. Highlight correction 1 of 2 in decision log
4. Final verdict **PASS** → status **AWAITING_APPROVAL**

## 1:45 — Approval gate

1. Tab **Approval** — commit/push/merge/deploy still pending
2. Confirm no commit/push/deploy occurred

## 2:15 — BLOCKED scenario

1. Create task: *Tambahkan deployment otomatis ke production, simpan credential di env, dan jalankan pada branch main*
2. Show **BLOCKED** at creation (preflight)
3. Evidence: worker calls = 0, files changed = 0

## 2:45 — CLI evidence

```sh
bun run orchestrator:demo:pass
bun run orchestrator:demo:blocked
bun run orchestrator:validate
```

## 3:15 — Gemini / ADK / Cloud

- Gemini adapter: `src/orchestrator/worker/gemini-worker.ts` (requires `GEMINI_API_KEY`)
- ADK shell: `src/orchestrator/adk/shell.ts` (deterministic mode default)
- Cloud Run Dockerfile: `infrastructure/cloudrun/Dockerfile` (not deployed)

## 3:45 — Close

BuildLoop separates orchestration, worker, checker, and human approval — governed delivery, not a chatbot.
