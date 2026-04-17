---
title: Quality Contracts from Planner
status: active
createdAt: 2026-04-01T00:00:00.000Z
updatedAt: 2026-04-01T00:00:00.000Z
---

## Overview

Have the planner produce a structured quality contract alongside each plan. The quality-manager evaluates implementation against this contract rather than doing open-ended assessment. This turns subjective "is it good?" review into deterministic "does it meet the agreed criteria?" verification — inspired by the GAN-style sprint contracts from Anthropic's harness design article.

## Current State

- The planner produces plans with an Implementation Order and Files to Change, but no explicit quality criteria.
- The quality-manager derives its own claims from project artifacts (lint, typecheck, test) and spawns a reviewer for open-ended code review.
- Task-level acceptance criteria exist but are per-task, not plan-wide. There is no mechanism for plan-level quality gates that span the entire body of work.
- The reviewer has its own qualification criteria (P0-P3, confidence, complexity) but these are generic — not tailored to the specific plan's goals.

## Design

### Quality Contract Format

A new optional section in `plan.md` called `## Quality Contract`. It contains plan-specific quality criteria the quality-manager must evaluate against. Each criterion has:

- **ID**: Short identifier (e.g., `QC-001`)
- **Category**: One of `correctness`, `architecture`, `integration`, `behavior`
- **Criterion**: A testable assertion about the final implementation
- **Verification method**: How to verify — `verifier` (run a command), `reviewer` (inspect code), or `manual` (human check)
- **Command** (optional): The specific command or check to run for `verifier` criteria

Example in a plan:

```markdown
## Quality Contract

- id: QC-001
  category: architecture
  criterion: "Domain modules do not import from infrastructure modules — dependency direction is inward only"
  verification: reviewer

- id: QC-002
  category: correctness
  criterion: "All new public functions have corresponding test cases that cover happy path and at least one error path"
  verification: reviewer

- id: QC-003
  category: integration
  criterion: "The new API endpoints return valid responses matching the OpenAPI schema"
  verification: verifier
  command: "bun run test -- --grep 'api schema'"

- id: QC-004
  category: behavior
  criterion: "Cache invalidation triggers on every write operation — no stale reads after writes"
  verification: verifier
  command: "bun run test -- --grep 'cache invalidation'"
```

### Planner Changes

Add a new step to the planner workflow (between "Design the architecture" and "Write the plan document") and a new section to the plan output format:

- **New workflow step: "Define quality criteria"** — After designing the architecture, the planner identifies plan-specific quality criteria. These should be concrete, testable assertions tied to the design decisions and requirements — not generic platitudes. Each criterion must be verifiable by either the verifier (command-based) or reviewer (code inspection).
- **New plan output section: "Quality Contract"** — Listed after Risks, before Implementation Order. Uses the format above.

Files affected:
- `bundled/coding/coding/prompts/planner.md` — Add the workflow step and output section

### Quality-Manager Changes

The quality-manager's step 3 (verifier claims) and step 4 (reviewer scope) incorporate the quality contract:

- **Step 2.5 (new): Load quality contract** — After establishing review context, check if the plan associated with the current tasks has a `## Quality Contract` section. Parse it into structured criteria.
- **Step 3 (verifier): Merge contract claims** — In addition to project-native checks (lint, typecheck, test), add `verifier`-type quality contract criteria as additional claims. Pass the contract criterion ID and command to the verifier.
- **Step 4 (reviewer): Pass contract criteria** — Include `reviewer`-type quality contract criteria in the reviewer spawn prompt. The reviewer evaluates these criteria in addition to its standard diff review, and reports pass/fail for each contract criterion ID in its findings.
- **Step 5 (remediation): Contract-aware routing** — Failed contract criteria are treated as high-priority findings. A failed `QC-*` criterion from the verifier is routed the same way as a failed check. A failed `QC-*` criterion from the reviewer is routed based on complexity (simple -> fixer, complex -> task).
- **Step 7 (final validation): Contract sign-off** — Merge-readiness requires all non-manual contract criteria to pass. Manual criteria are noted as "requires human verification" in the exit summary.

Files affected:
- `bundled/coding/coding/prompts/quality-manager.md` — Add contract loading, merge contract claims into verifier/reviewer steps, contract sign-off in final validation

### Plan Infrastructure Changes

The quality contract is plain markdown in the plan body — no schema changes or new file types needed. The quality-manager parses it at runtime from the plan file. This keeps the change minimal: the contract lives in the plan document, read by the quality-manager via `plan_view`.

To support this, the quality-manager needs to resolve the plan slug from task labels. It already reads tasks via `task_list` — it extracts the `plan:<slug>` label from the current tasks and calls `plan_view` to read the contract.

No changes to `lib/plans/` or plan tooling required.

## Approach

- The quality contract is a convention, not a schema enforcement — the planner is prompted to produce it, the quality-manager is prompted to consume it. No TypeBox types or runtime validation of the contract format itself.
- Contract criteria supplement but don't replace the existing quality flow. Project-native checks and open-ended review still run. The contract adds plan-specific criteria on top.
- The planner already has `thinkingLevel: "high"` and produces detailed architectural plans. Adding quality criteria is a natural extension of its design step — it's asking "how will we know this is done right?" after "how will we build this?"
- Keep criteria counts reasonable — 3-8 per plan. Too many criteria dilute focus. The planner prompt should guide toward fewer, higher-signal criteria.

## Files to Change

- `bundled/coding/coding/prompts/planner.md` — Add "Define quality criteria" workflow step (after step 3), add "Quality Contract" output section (after Risks)
- `bundled/coding/coding/prompts/quality-manager.md` — Add contract loading step (2.5), merge contract into verifier claims (step 3), pass contract to reviewer (step 4), contract-aware remediation (step 5), contract sign-off in final validation (step 7)

## Risks

- **Planner quality criteria quality**: If the planner produces vague or untestable criteria, the contract adds overhead without value. Mitigate with strong prompting — examples of good vs bad criteria, explicit "must be testable" guidance.
- **Contract parsing fragility**: The quality-manager parses markdown at runtime. If the planner produces malformed contract sections, parsing could fail silently. Mitigate by keeping the format simple (YAML-like list items) and having the quality-manager log warnings for unparseable entries.
- **Over-specification**: Too many criteria or overly prescriptive criteria could constrain workers unnecessarily. The criteria should validate outcomes, not dictate implementation. The planner prompt should emphasize this.

## Implementation Order

1. Planner prompt changes — Add the quality contract workflow step and output format section to `planner.md`. This is the foundation — everything downstream consumes what the planner produces.
2. Quality-manager prompt changes — Add contract loading, integration into verifier/reviewer steps, and contract sign-off to `quality-manager.md`. This is the consumption side.
