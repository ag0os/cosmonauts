---
id: TASK-783
title: 'Stage 16: Refresh floors and publish closeout'
status: To Do
priority: high
labels:
  - backend
  - testing
  - devops
  - 'plan:project-health-audit'
dependencies:
  - TASK-782
createdAt: '2026-09-28T15:27:29.964Z'
updatedAt: '2026-09-28T15:27:29.964Z'
---

## Description

Freeze the analyzed source commit, refresh all changed-scope floors, reproduce the audit, and publish the artifact-only closeout. This task is the primary owner of B-008 and verifies B-001, B-007, B-009, and B-010.

<!-- AC:BEGIN -->
- [ ] #1 Owned behavior B-008 — observer: Quality Manager or later change author; entry point: existing changed-scope analysis capability and baseline manifest; outcome: each floor has one category-specific reason tied to the final analyzed source commit, manifest digests match files, and changed-scope audit from `main` passes, while failed/unavailable audit blocks completion. Verification: B-001 retains all seven binding rows/four project runs with non-passing states visible; B-007 retains non-growing inline/registered suppression counts and zero stale suppressions; B-009 reproduces same-commit normalized identities/counts/result and analysisConfiguration digests and supports later mechanical diffs; B-010 closes through the gate/freeze check without regression.
- [ ] #2 D-010 commit shape and owned Files to Change are exact: final source/test state is frozen as `analyzedCommit`; refresh runs separately for `dead-code`, `dupes`, and `health` against it; the final coordinator-owned closeout commit contains only `.fallow-baselines/{dead-code,dupes,health,manifest}.json`, `docs/fallow-exceptions.md`, and `missions/reviews/project-health-audit.{md,json}`. The record proves tip differs from analyzed source only by those artifacts. Dead-code reason states zero or names the evidence-backed false-positive; duplication reason names both retained three-file families; health reason names `### Baselined complexity (project-health-audit)` and the JSON digest. Manual floor edits/direct fixes are not substitutes.
- [ ] #3 Design §1/D-004–D-006 record contract is complete and validated: canonical schema-v1 JSON is UTF-8/LF/two-space/deterministically sorted with `schemaVersion`, `generatedFor`, `identityAlgorithm`, complete `before`/`after` snapshots, `reproduction`, `closeout`, and `downstream`; snapshots contain commit, hashed execution-root consent, provider, object-store configuration digests, binding/invocation/outcome records, closed finding dispositions, and suppressions with no absolute/secret/transient data. D-005 file/bundle/result/identity hashing is reproduced from git objects at `analyzedCommit`; closeout floor digest is from the closeout tree. Markdown summarizes JSON and names its SHA-256. Same-commit reruns match identities/counts/result digests/analysisConfiguration; D-012 keeps duplication surface and verbatim diagnostic pair distinct; unbound boundary state stays non-passing.
- [ ] #4 D-014/R-013/R-014 closeout content is checkable: `docs/fallow-exceptions.md` and JSON contain identical stable complexity identities and justification text; manifest provenance uses one reason/category. The sign-off packet lists every changed gate-owned baseline/provider/suppression path with justification and completion is reported exactly as “QM human-decision items pending sign-off”. The Markdown downstream section lists, per affected execution-liveness file, new modules/exported names, moved/split functions, and shared lock/scheduler/finalization code and flags re-validation before TASK-712; no execution-liveness artifact is edited.
- [ ] #5 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 escalation/false-positive evidence stays explicit. Before every edit the Pi-hosted worker runs `analysis_status`, uses the analysis surface tools, and stops/reports if unavailable (D-017). Failed/unbound capabilities remain non-passing; any regression returns to its owning stage rather than being absorbed into a baseline.
- [ ] #6 D-015 records slice-start `S` and exact outputs of `git diff --name-status --diff-filter=MDR S HEAD -- tests/` and `git diff -U0 S HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; no test modification/deletion/rename or skip/only/todo is allowed without cited finding and blocked human review. Final rows are copied to this task’s `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns the artifact-only closeout commit and verifies its path diff. Explicitly unchanged remain `fallow.toml`, `missions/architecture/staged-code.toml`, `.cosmonauts/config.json`, `qualityReview`, dependencies, and execution-liveness artifacts.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; after-snapshot dead-code, duplication (with D-012 diagnostic pair), all complexity metrics, boundary conformance, suppression evidence, and changed-scope audit from `main` are re-run and recorded at the required commits, and all capability/digest/floor states satisfy the plan before closeout is published.
<!-- AC:END -->
