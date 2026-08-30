# BuildLoop Documentation Pack

Version: Hackathon 2026 baseline — 29 August 2026

This documentation pack defines the product, functional behavior, design rules, technical architecture, data model, security guardrails, test strategy, and task-contract format for BuildLoop.

## Canonical positioning

**BuildLoop completes bounded software-development tasks autonomously while preserving human control over security-sensitive and irreversible actions.**

BuildLoop is not positioned as a chatbot, generic code generator, or replacement for developers. It is a governed autonomous software-delivery orchestrator.

## Core workflow

Task → Contract → Preflight → Worker → Checker → Limited self-correction → PASS / FAILED / BLOCKED → Human approval for sensitive actions

## Documents

1. `01-BRD.md` — business purpose, users, scope, success measures.
2. `02-PRD.md` — product behavior and user-facing requirements.
3. `03-FRD.md` — detailed functional rules and state transitions.
4. `04-DESIGN.md` — UI/UX principles and interface consistency rules.
5. `05-TECH-SPEC.md` — architecture, stack, services, modules, and execution model.
6. `06-DB-SCHEMA.md` — Firestore-oriented logical data model.
7. `07-SECURITY-GUARDRAILS.md` — protected actions, approval boundaries, and security rules.
8. `08-TEST-PLAN.md` — required tests and demo evidence.
9. `09-TASK-CONTRACT-TEMPLATE.md` — reusable bounded task contract.
10. `10-SOURCE-OF-TRUTH.md` — evidence status and known documentation drift.

## Hackathon scope

The submission vertical slice is intentionally narrow:

- accept one bounded coding task;
- create a contract and acceptance criteria;
- run a worker;
- independently check the result;
- allow at most two self-correction attempts;
- produce PASS, FAILED, or BLOCKED;
- stop on protected or sensitive actions;
- require human approval before commit, push, merge, or deploy.

Out of scope until the submission core is reliable: marketplace, billing, multi-tenant enterprise fleet, full GitHub automation, mobile app, and broad autonomous DevOps.
