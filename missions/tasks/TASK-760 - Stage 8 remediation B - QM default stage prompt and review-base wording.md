---
id: TASK-760
title: Stage 8 remediation B - QM default stage prompt and review-base wording
status: Done
priority: medium
labels:
  - backend
  - docs
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-759
createdAt: '2026-09-24T21:09:48.870Z'
updatedAt: '2026-09-24T21:14:21.747Z'
---

## Description

Close the two LOWs in `missions/plans/qm-chain-safety/stage8-review-2-claude.md`.

LOW-A: the default stage prompt for `quality-manager` in `lib/orchestration/stage-prompts.ts` still reads "…orchestrate fixes until merge-ready." The durable compiler bakes it into every durable QM step's recorded input (`graph.json`, `step.json`). Reword it to the review-only contract: produce the durable findings report; no fixes, commits or plan completion. Update the byte-identical defaults test in `tests/orchestration/chain-steps.test.ts` to the new text.

LOW-B: `external-commands/implement-plan.md` should say that the host takes the merge-base of the captured HEAD and the first ref found (`main`, then `master`, then `origin/main`). `range.txt` records that merge-base.

Keep the changed-scope audit against `main` passing. Lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 The `quality-manager` default stage prompt describes the review-only findings-report contract and contains no instruction to fix, orchestrate fixes, commit or reach merge-ready; the defaults test pins the new text.
- [x] #2 `external-commands/implement-plan.md` states that the reviewed range starts at the merge-base of the captured HEAD and the first found ref of `main`, `master`, `origin/main`, as recorded in `range.txt`.
- [x] #3 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->

## Implementation Notes

spawn failed with exit code 1

Coordinator, 2026-09-24: the codex worker process exited 1 after about 40 seconds (Drive run-0fb98298, spawn_failed, no stderr captured). It had already written complete edits. The coordinator verified them against every acceptance criterion: typecheck, tracked lint, suppressions and the audit vs main all pass; the full suite is 3407/3408, and the one failure is the known validate-harness-exports timeout flake, which passes in isolation (63/63 with chain-steps). The coordinator committed the edits.
