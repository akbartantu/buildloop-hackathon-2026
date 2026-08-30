# DESIGN.md — BuildLoop UI/UX System

## 1. Design goal

BuildLoop should feel like a calm developer tool: minimal, structured, trustworthy, and evidence-first.

The interface should communicate control rather than autonomous spectacle.

## 2. Visual direction

Current direction:

- warm neutral background;
- restrained developer-tool aesthetic;
- minimal dashboard;
- clear hierarchy;
- familiar interaction patterns inspired by modern coding tools, without copying any single product;
- low visual noise;
- status colors used sparingly.

## 3. Core principles

### Consistency over novelty
Reuse the same app shell, spacing, cards, status components, typography scale, and action hierarchy across screens.

### Evidence over decoration
Give screen space to task scope, checks, diffs, attempts, reasons, and approvals.

### Plain language first
Technical terms may appear, but user-facing copy should explain consequences.

### Progressive disclosure
Common actions stay simple. Advanced model/security configuration belongs in advanced settings.

## 4. Application structure

Recommended main navigation:

- Tasks
- Projects
- Activity / Evidence
- Settings

For hackathon scope, Tasks can remain the dominant view.

## 5. Task detail layout

A task should make these sections easy to locate:

1. Task goal
2. Contract
3. Current execution state
4. Attempt timeline
5. Checks/evidence
6. Final decision
7. Approval action, if required

## 6. Status presentation

### PASS
Meaning: required contract criteria are evidenced.

### FAILED
Meaning: work did not meet the contract within allowed attempts.

### BLOCKED
Meaning: BuildLoop intentionally stopped because a hard boundary was reached.

Do not represent BLOCKED as a generic failure. It is a governance success: the system prevented unauthorized continuation.

## 7. Contract editor

Contract fields should be editable before execution where safe.

Use clear field labels such as:

- Goal
- Allowed changes
- Do not change
- Done when
- Required checks
- Approval required for

Avoid exposing raw internal schemas as the default experience.

## 8. Execution timeline

Show events in chronological order:

- Contract created
- Preflight completed
- Worker attempt 1
- Checker result
- Correction attempt 1
- Checker result
- Final decision
- Approval requested

Each event may expand to show evidence.

## 9. BLOCKED screen

Must answer:

- What was detected?
- Why is it protected?
- What did BuildLoop stop?
- What was not executed?
- What can the user safely do next?

Example:

“BuildLoop stopped before modifying `.github/workflows/deploy.yml` because deployment configuration is protected for this task.”

## 10. PASS screen

Must show:

- criteria satisfied;
- checks passed;
- files affected;
- attempt count;
- whether any action still needs approval.

PASS does not automatically imply deploy/merge permission.

## 11. Development auth mode

If a development bypass exists, show an unambiguous development-only banner. It must not visually resemble production authentication.

## 12. Design consistency rules

Do not:

- create a new visual language per page;
- introduce arbitrary one-off colors;
- use different radii/spacing without reason;
- use status terms inconsistently;
- hide critical governance events inside generic chat bubbles.

## 13. Responsive behavior

Desktop is the primary hackathon demo target.

Mobile/tablet should preserve information hierarchy, but full mobile optimization is secondary to submission reliability.

## 14. Accessibility

Minimum:

- keyboard reachable primary controls;
- visible focus;
- semantic status labels not dependent on color alone;
- readable contrast;
- form labels;
- error messages adjacent to affected controls.

## 15. Copy style

Use short, direct wording.

Prefer:
- “2 checks failed”
- “Protected file detected”
- “Approval required before push”

Avoid:
- “Something went wrong”
- “AI confidence: 87%”
- “Everything looks safe” without evidence.
