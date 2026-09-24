You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive. Put probes in a scratch directory outside the repository.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

This is a NARROW confirmation review (Stage 7 review 13) of TASK-758 (`9a45d1c`, diff `2af1dfc..HEAD`). Read `missions/tasks/TASK-758*.md` and `missions/plans/qm-chain-safety/stage7-review-12-{codex,claude}.md`. In review 12 the Claude channel said SHIP; codex found that the `^Reason:\s*.*$` rewrite crosses newlines when `Reason:` is empty.

TASK-758 makes two changes:
- Every `Verdict:` and `Reason:` line match is restricted to its own line (`[ \t]*`).
- The marker-start and malformed-marker rules accept leading spaces and tabs.

Check:
1. Are the review-12 codex MEDIUM and Claude LOW-1 RESOLVED? Give file:line evidence, and state whether each new test fails on `2af1dfc`.
2. Regressions from the tightened `Verdict:` match. A QM `Verdict:` line split across lines, or otherwise shaped differently, must fail safe (`failed`/`not-ready`, never `ready`). Does a clean host-rendered report still reach `ready`? Is any other multi-line-capable regex left in `lib/orchestration/quality-review-*.ts` that rewrites or deletes report text?
3. D-031 floors 1 and 2, D-025, D-026, D-028 and INV-003 still hold.

Plan decisions D-031 and D-032 in `plan.md` record text-recognition limits, including the host-owned Reviewer models section; do not report those as findings. Threat model (D-027): accidental damage only; list hostile-only routes in one line.

Output: findings ranked HIGH/MEDIUM/LOW, each with file:line and an accidental failing scenario; residuals; and a SHIP / DO-NOT-SHIP-YET verdict for Stage 7. The coordinator has run the changed-scope audit against `main` with committed baselines at HEAD `20b0311`: verdict pass. It has also run typecheck, tracked lint and the full suite (3400/3400); all pass.
