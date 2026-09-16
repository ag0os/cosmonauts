---
id: TASK-699
title: Run copy-only graph-identified targeted probes
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-698
createdAt: '2026-09-16T18:36:30.951Z'
updatedAt: '2026-09-16T18:36:30.951Z'
---

## Description

Stage 7b — Targeted probes.

Owned behavior: **B-008** (sole owner).

Implement and apply only targeted, explicitly confirmed probes. D-003/D-008/D-012/D-019/D-022/D-023 and AC-010 are settled ground: the queue is the unconditional union of all five spec triggers; probes are copy-only and never suite-wide mutation; `git checkout` is forbidden; objective and human-reviewed lanes remain separate. Any unprovable graph/containment degrades to visible `reasoned`/`unassessed` and cannot count for the queued defect. Halt and escalate rather than probing in place or weakening the queue.

<!-- AC:BEGIN -->
- [ ] #1 B-008 is proved at `scripts/test-health-audit/probe.ts` and current-epoch `probes.jsonl` by `tests/scripts/test-health-audit/probe.test.ts` > `rejects probes outside the sandbox or without copied import identity isolated outcome and restored green`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-008` near the executable test.
- [ ] #2 Queue membership is the unconditional disjunction of critical behaviors/risks, known historical false-confidence classes, consumer/adapter/alternate-path/persistence/composition-root-dependent claims, mock/fixture-maskable outcomes, and claims whose intended-fault detection cannot be established by reasoned inspection; the fifth trigger only adds claims.
- [ ] #3 Each execution requires exact probe-ID confirmation after printing the sandbox, target/import route, config/setup, test selection, guardrail, and mutation; no implicit project-controlled execution occurs.
- [ ] #4 Each sandbox is seeded from tracked files plus a recorded untracked allowlist, contains a working repository and source `node_modules` symlink, directs Vitest cache away from shared `node_modules/.vite`, and proves cwd/config/setup/test/target/import-route realpaths remain beneath the sandbox.
- [ ] #5 Quality Contract assertion 6 is satisfied for every executed required probe: one realistic defect/boundary, non-contributing doubles, pre-mutation green, expected red reason or explicit survival, restored target identity and green rerun, identical source-checkout status/digests, and no source mutation or `git checkout`; the recorded `test selection` is the narrowest declaration carrying the claim under probe (the named declaration, not its file or suite), and the record names the declaration(s) that turned red, so a red produced only by a sibling declaration in the same selection is recorded as `probe-survived` for the claimed guardrail.
- [ ] #6 A required but unsafe/unprovable probe remains `reasoned` or `unassessed` with an infeasibility limitation and cannot protect that defect; a queued claim with neither confirmation nor limitation, and every `probe-survived` claim, is rejected as protection.
- [ ] #7 Probe outcomes revalidate and write back the current profile’s fault-sensitivity and affected portfolio contributions; `probe-survived` opens a remediation-ledger row, while the generic mutation gate remains unbound and no suite-wide/CI mutation enforcement is introduced.
- [ ] #8 Each probe result re-derives and revalidates the current-epoch `behavior-risk-matrix.md` and `gap-register.md` cells whose portfolio conclusion, probe reference, or gap text it changes — upgrading a cell to `protected` only on `probe-confirmed` evidence and demoting any cell a `probe-survived` result or infeasibility limitation touches — so no cell certified at F1 predates its probe evidence.
<!-- AC:END -->
