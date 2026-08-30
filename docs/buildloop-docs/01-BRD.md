# BRD — Business Requirements Document

## 1. Purpose

BuildLoop addresses a governance problem created by autonomous coding agents: they can work quickly, but may exceed intended scope, modify sensitive files, add dependencies, or claim completion without sufficient evidence.

BuildLoop provides a governed execution loop around software-development tasks.

## 2. Product statement

**BuildLoop completes bounded software-development tasks autonomously while preserving human control over security-sensitive and irreversible actions.**

## 3. Business problem

Teams using coding agents need to answer four questions reliably:

1. What exactly was the agent allowed to do?
2. What did it actually change?
3. Did the result meet observable acceptance criteria?
4. Did the agent attempt anything that required human approval?

Without this structure, the operator must manually inspect prompts, diffs, logs, and agent claims.

## 4. Target users

### Primary user
Developer or technical builder using AI coding agents.

### Secondary user
Technical lead, agency owner, or engineering manager who wants evidence that autonomous work stayed within agreed boundaries.

### Hackathon user
A judge should be able to understand the governance loop through two short scenarios without needing deep infrastructure knowledge.

## 5. User needs

Users need BuildLoop to:

- turn an informal task into an explicit bounded contract;
- distinguish allowed work from protected or sensitive actions;
- execute coding work without constant supervision;
- check work independently from the worker;
- retry bounded corrections automatically;
- stop rather than improvise when hard guardrails are hit;
- provide evidence for the final decision;
- preserve human control over irreversible actions.

## 6. Business value

BuildLoop aims to reduce:

- accidental scope expansion;
- unsafe autonomous actions;
- manual verification effort;
- false “done” claims;
- repeated prompting after ordinary implementation mistakes.

Its value is not “more code generated.” Its value is **more trustworthy autonomous execution**.

## 7. Hackathon objective

Demonstrate one reliable vertical slice for the Taskmaster category.

### Required demo scenarios

**PASS scenario**
A safe bounded task is executed, checked, optionally corrected, and reaches PASS with evidence.

**BLOCKED scenario**
A task or attempted change touches a protected/sensitive boundary and BuildLoop stops without executing the prohibited action.

## 8. Success criteria

Hackathon success requires:

- working prototype;
- Gemini 3.5+ usage;
- Google ADK usage;
- at least one Google Cloud service;
- reliable PASS scenario;
- reliable BLOCKED scenario;
- visible evidence trail;
- human approval boundary;
- reproducible setup;
- demo video;
- architecture explanation.

## 9. Non-goals

Before the hackathon submission, BuildLoop is not required to provide:

- autonomous merge or production deployment;
- enterprise organization management;
- billing;
- marketplace;
- multi-tenant SaaS architecture;
- mobile app;
- general-purpose project management;
- complete semantic code review;
- support for every coding agent;
- arbitrary long-running autonomous development.

## 10. Business risks

### Risk: governance adds friction
Mitigation: contracts should be concise, partially generated, editable, and focused on material constraints.

### Risk: product looks like a wrapper around another coding agent
Mitigation: demonstrate independent checker, deterministic blocking, evidence, limited correction, and human approval.

### Risk: AI judgment is treated as security enforcement
Mitigation: hard security boundaries must use deterministic rules wherever possible.

### Risk: demo is broader than it is reliable
Mitigation: prioritize one vertical slice and two deterministic scenarios.

## 11. Key business principle

BuildLoop should earn trust by showing evidence, not by claiming confidence.
