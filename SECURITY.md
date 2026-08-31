# Security

BuildLoop is a governed autonomous software-delivery orchestrator. This document summarizes security boundaries for the hackathon/demo release. It is not a certification statement.

## Reporting issues

Suspected vulnerabilities can be reported through the public GitHub repository issue tracker:

https://github.com/akbartantu/buildloop-hackathon-2026

Do not post live credentials, API keys, or production secrets in public issues. A dedicated security contact may be published before wider production use.

## Product boundaries

- **Human approval** is required for sensitive or irreversible actions (commit, push, merge, deploy).
- **Bounded contracts** define goal, acceptance criteria, scope, protected paths, and correction limits.
- **Independent checker** verifies worker output; the worker does not decide its own PASS result.
- **Sensitive goals** may be blocked at preflight instead of executed automatically.
- **Public GitHub only** in the current release — private repository OAuth is out of scope.

## Secret handling

- Server-side secrets (Supabase service role, Gemini API key) belong in environment/Secret Manager — not client bundles or UI.
- Do not upload passwords, API keys, tokens, or private keys in tasks or specification uploads.
- Operational logs should prefer safe metadata over full task/specification bodies or authorization headers.

## Data locations

- **Supabase** — authentication and relational product data (projects, tasks, specifications, approvals).
- **Firestore** (production) — orchestrator runtime and evidence records.
- **Browser storage** — session (Supabase-managed), language/workspace preferences, UI state. See `/cookies`.

## Public documentation

- Privacy Policy: `/privacy`
- Cookie & Local Storage Policy: `/cookies`
- Security Overview: `/security`

## Not claimed

BuildLoop does not claim SOC 2, ISO 27001, PCI, GDPR, UU PDP, or penetration-test certification on this release unless separately documented with evidence.
