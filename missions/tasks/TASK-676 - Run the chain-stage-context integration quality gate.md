---
id: TASK-676
title: Run the chain-stage-context integration quality gate
status: To Do
priority: high
labels:
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-675
createdAt: '2026-09-10T02:15:51.205Z'
updatedAt: '2026-09-10T18:00:00.000Z'
---

## Description

Implementation Order step 9 and final integration gate. This verification task owns no B-### behavior; TASK-668 through TASK-675 exclusively own B-001 through B-013 and their implementation constraints. Verify the integrated result against all six plan-specific Quality Contract criteria and the bound gate ladder without taking ownership away from implementing tasks.

The spec acceptance criteria and scope exclusions are ratified. Any failure that suggests changing expected behavior or excluded surfaces must be classified and halted/escalated; derived plan collisions must be amended on record before further work. Unbound analysis gates are degraded evidence, never silent passes.

<!-- AC:BEGIN -->
- [ ] #1 Quality Contract criterion 1 passes: focused evidence shows inline and durable prompts are exact-string equivalent at first/middle/terminal positions while the first planner prompt remains current.
- [ ] #2 Quality Contract criterion 2 passes: negative topology/identity evidence keeps cross-domain same names, reviewer lookalikes, unordered siblings, non-review chains, shipped `implement`/`verify`/`adapt`, and every single-stage chain unchanged.
- [ ] #3 Quality Contract criterion 3 passes: expected/fallback identity, active status, terminal report grammar, safe contiguous rounds, findings-section recognition, real non-code references, unsafe entries, and I/O failures all follow D-005/D-006.
- [ ] #4 Quality Contract criterion 4 passes: sequential no-reviser and both scheduler orders for parallel review/revision/task-manager shapes produce zero task-manager spawns and unsuccessful stage/group/chain results with typed nonempty errors.
- [ ] #5 Quality Contract criterion 5 passes: target/addressed-index/block `run_activity` gates durable backend starts, survives partial persistence without authorizing dependents, projects to chain events, and renders correctly on CLI and agent-tool progress surfaces.
- [ ] #6 Quality Contract criterion 6 passes by diff inspection: no changes touch coding personas, `bundled/coding/chains.ts`, `behaviorsReviewPending` persistence/tool surfaces, `lib/domains/prompt-assembly.ts`, `/spec-to-backlog`, `runStart`, scheduler, or generic `lib/durable-runtime/*` contracts, and no project-controlled code is executed.
- [ ] #7 The bound correctness gate row 1 passes all B-001 through B-013 focused tests and project-native full test, lint/static, and type checks; D-012's review-round import-direction and inline/durable prompt-parity assertions pass as correctness tests; artifact-conformance verifies every exact behavior marker.
- [ ] #8 The three bound analysis gates (rows 4, 5, 7) pass as a **changed-scope regression check**, not a whole-repo scan, run exactly as: `fallow audit --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json`, exiting 0. Whole-repo `fallow dead-code` and `fallow health` exit 1 on pre-existing debt measured 2026-09-10 and are NOT the gate; using them would fail for reasons unrelated to this change. If the work legitimately alters findings in a baselined file, the affected baseline is re-saved in the same commit with the reason stated in the commit message — never silently.
- [ ] #9 Rows 3 (`mutation`) and 6 (`boundary-conformance`) are explicitly recorded as unbound with their true reasons — no provider supplies mutation, and `boundary-conformance` reports `provider-not-configured` because `fallow.toml` declares no boundary rules — rather than reported as passed or attributed to `execution-not-consented`.
- [ ] #10 The D-013 amendments are proven end to end, not only unit-wise: a bound target reaches revision and guarded task-decomposition prompts in both paths (D-013.1); a newer assessable round written between revision finalization and the guard blocks as `stale-addressed-evidence` in both paths (D-013.2); durable addressed activity failing producer correlation or shape validation blocks (D-013.3); a plan with absent or unrecognized frontmatter status blocks as `plan-status-indeterminate` rather than binding (D-013.4); and the exact-plan-reviewer precedence, same-index ambiguity, and plan-directory containment cases all block or resolve as recorded (D-013.5).
- [ ] #11 Decision Log citation form is verified mechanically before this gate closes: every high/medium `PR-###` reference in `plan.md` sits in non-code text, with backticks around the filename only (`` `review-3.md` PR-001 ``), never wrapping the whole citation. The plan's own review-round assessor is run against its own plan directory and must find every high/medium finding of the latest assessable round properly referenced — this feature must pass the gate it ships.
<!-- AC:END -->
