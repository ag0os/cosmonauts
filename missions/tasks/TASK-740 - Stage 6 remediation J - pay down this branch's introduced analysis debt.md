---
id: TASK-740
title: Stage 6 remediation J - pay down this branch's introduced analysis debt
status: To Do
priority: high
labels:
  - refactoring
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-739
createdAt: '2026-09-24T13:27:18.038Z'
updatedAt: '2026-09-24T13:27:18.038Z'
---

## Description

After the D-029 baseline re-anchoring, the changed-scope gate reports only this branch's introduced debt:

```
fallow audit --base main \
  --dead-code-baseline .fallow-baselines/dead-code.json \
  --health-baseline .fallow-baselines/health.json \
  --dupes-baseline .fallow-baselines/dupes.json
```

It fails with 31 complexity findings, 8 dead-code issues and 10 duplication clone groups. The worst complexity findings:

| File | Function | Cyclomatic |
|---|---|---|
| `lib/orchestration/quality-review-run.ts` | `execute` | 209 |
| `lib/orchestration/quality-review-launch.ts` | `validateQualityReviewAnalysisCalls` | 56 |
| `domains/shared/extensions/orchestration/spawn-tool.ts` | `execute` | 39 |
| `lib/orchestration/session-factory.ts` | `createAgentSessionFromDefinition` | 36 |
| `lib/config/loader.ts` | `parseQualityReviewConfig` | 27 |
| `lib/orchestration/quality-review-artifacts.ts` | `write` | 24 |

INV-005 makes this branch's own gate fail on introduced findings. Plan R-014 says to keep QM policy out of the named complexity hotspots, in focused modules.

This is a behavior-preserving refactor. Use the refactoring and tdd skills:
- Keep every existing test green without weakening it.
- Add characterization tests where a split seam lacks coverage.
- Change no observable behavior, report text or event order.

Do not re-save any baseline, and do not add suppression directives (INV-005, D-009). Binding ratified ground is INV-001..INV-005 and D-018..D-030.

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 The changed-scope audit above against `main` returns verdict `pass` with zero introduced dead-code, complexity and duplication findings; no baseline file changed and no suppression directive added (`bun run check:suppressions -- --base main` passes).
- [ ] #2 QM run orchestration is decomposed into focused, named phases (snapshot and export, runtime, assessment, seal, checks, finalization, lifecycle) in `lib/orchestration/quality-review-*` modules, each under the project complexity thresholds, without changing D-026 ordering, D-025 guarantees, or any report, lifecycle or event output; the pre-refactor test suite passes unchanged.
- [ ] #3 Dead code introduced on this branch is removed or wired (no unused exports or types left); duplicated blocks are consolidated into shared helpers.
- [ ] #4 Typecheck, lint (on tracked files) and the full suite pass.
<!-- AC:END -->

## Implementation Notes

Coordinator note, 2026-09-24: `bun run lint` currently reports one error, in `.shepherd/backups/cosmonauts-packages-coding-2026-09-23/.cosmonauts-meta.json`. That is Shepherd's gitignored backup of a stray package, not project code. Do not edit or delete anything under `.shepherd/`, and do not change the Biome config to hide it. Judge lint as passing when that is its only error.
