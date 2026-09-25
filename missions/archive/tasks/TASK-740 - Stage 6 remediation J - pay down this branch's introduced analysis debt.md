---
id: TASK-740
title: Stage 6 remediation J - pay down this branch's introduced analysis debt
status: Done
priority: high
labels:
  - refactoring
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-739
createdAt: '2026-09-24T13:27:18.038Z'
updatedAt: '2026-09-24T13:59:48.004Z'
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
- [x] #1 (Rescoped 2026-09-24 by the coordinator after a partial first pass; the original whole-branch criteria moved to TASK-742) The changed-scope audit reports no complexity finding in `lib/orchestration/quality-review-run.ts`, `quality-review-launch.ts`, `quality-review-artifacts.ts`, `quality-review-workspace.ts`, `quality-review-report.ts`, `quality-review-seal.ts`, `quality-review-chain.ts`, `quality-review-command.ts` or `quality-review-checks.ts`.
- [x] #2 QM run orchestration is decomposed into focused, named phases (snapshot and export, runtime, assessment, seal, checks, finalization, lifecycle) in `lib/orchestration/quality-review-*` modules, each under the project complexity thresholds (cyclomatic 20, cognitive 15). D-026 ordering, D-025 guarantees, and all report, lifecycle and event output are unchanged. The pre-refactor test suite passes unchanged.
- [x] #3 No baseline changed, no suppression directive added (`bun run check:suppressions -- --base main` passes), typecheck and the full suite pass.
<!-- AC:END -->

## Implementation Notes

partial (first pass `661f98c`: introduced dead code removed, `quality-review-chain.ts` and `quality-review-seal.ts` extracted). The coordinator rescoped the task to the quality-review modules, with the rest in TASK-741 and TASK-742. Continue from `661f98c`.
