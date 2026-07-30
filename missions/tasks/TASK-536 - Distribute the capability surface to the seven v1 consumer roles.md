---
id: TASK-536
title: Distribute the capability surface to the seven v1 consumer roles
status: To Do
priority: high
labels:
  - 'plan:analysis-gate-rewiring'
  - backend
  - testing
dependencies: []
createdAt: '2026-07-30T16:29:02.082Z'
updatedAt: '2026-07-30T16:29:02.082Z'
---

## Description

Stage 2 of `missions/plans/analysis-gate-rewiring/plan.md`. Move the
analysis surface off the concrete provider skill and onto exactly seven
roles. Read Design section 3 and decisions D-011, D-021 first.

Today only `quality-manager` loads `project-tools`. After this task the set
of shipped agent definitions loading `project-tools` is exactly:
quality-manager, verifier, fixer, planner, plan-reviewer, worker,
refactorer. Planner, plan-reviewer, worker, and refactorer receive the
surface here even though their procedures ship in
`analysis-investigation-procedures` — do not write those procedures.

Ratified ground: D-021 fixes the consumer set at seven. Explorer is
dropped and B-020 stays withdrawn — do not resurrect or renumber it.
INV-1 governs every shipped generic surface. Do not reopen
D-013/D-024/D-025 without a human decision.

Scope note: documentation links to the deleted provider skill in
`docs/fallow*.md` are removed by the bridge-deletion task (stage 5), not
here. They are the only permitted remaining references at this task's
close.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail),
`dead-code` (bound). Deleting the provider skill tree is migration-shaped:
pair the bound capability with the explicit old-path search. Record the
commit HEAD at task start; that SHA is the changed-scope base for any
audit at task close.


<!-- AC:BEGIN -->
- [ ] #1 `B-024` — `tests/domains/coding-agents.test.ts` > `gives analysis consumers generic tools and shared skill under project filtering` asserts, by exhaustive enumeration over every shipped agent definition under an explicit project skill allowlist that omits analysis, that the set loading `project-tools` is exactly the seven v1 consumers; a new agent loading it fails the gate (`D-021`).
- [ ] #2 `domains/shared/skills/analysis/SKILL.md` exists and opens with the availability check: call `analysis_status` first; if the tool is not registered in this session, state that analysis is not part of this role's surface and proceed without it — no retries, no provider commands (`D-021`).
- [ ] #3 The shared analysis skill covers status, the completed/unbound/unsupported/failed outcomes, the explicit base requirement, trace-first, preview-only, and rerun-before-edit remediation, naming no provider, command, or apply operation (`INV-1`, `INV-5`).
- [ ] #4 The shared analysis skill resolves for all seven roles — including via the explicit skill allowlists of the roles that have them — and remains visible to wildcard agents that do not load the tools.
- [ ] #5 `bundled/coding/skills/fallow/` is deleted, and an explicit repository-wide search for the old skill path and its references finds no stale reference in runtime source or tests.
- [ ] #6 A repository-wide scan proves no shipped `bundled/` or `domains/` prompt, skill, or generic work-artifact reference contains the provider name or a provider command; provider documentation and provider runtime source are the only declared exclusions.
- [ ] #7 The test carries `@cosmo-behavior plan:analysis-gate-rewiring#B-024` near the executable test, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
