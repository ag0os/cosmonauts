You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive. Put probes in a scratch directory outside the repository.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

This is a NARROW confirmation review (Stage 7 review 8) of TASK-753 (`843abeb`, diff `aff9937..HEAD`). Read `missions/tasks/TASK-753*.md` and `missions/plans/qm-chain-safety/stage7-review-7-{codex,claude}.md`. In review 7 the Claude channel said SHIP; codex raised the plan-summary MEDIUM and a trailing-whitespace LOW.

TASK-753 routes the plan summary through the anchored `visibleSectionBody` and makes the unexpected-section check tolerate trailing whitespace on defined headings.

Check:
1. Are the review-7 MEDIUM and LOWs RESOLVED? Give file:line evidence, and state whether each new test fails on `aff9937`.
2. Does every lookup of a defined section now use the anchored match? Check `visibleSectionBody`, `replaceSectionEntries`, `amendUnindexedQualityReviewReport`, and any other `indexOf("## ...")` or similar in `quality-review-report.ts`, `quality-review-run.ts` and `quality-review-models.ts`.
3. Did this diff introduce a regression? In particular:
   - trailing whitespace on headings;
   - a heading at end of file;
   - the unindexed amend path still inserting into the right section;
   - the calibration rewrite still replacing the right entries;
   - a clean report still reaching `ready`.
4. D-031 floor 1 (no false `ready`) and floor 2 (no silently dropped reviewer finding): does any ordinary accidental heading shape still defeat them?

Plan decisions D-031 and D-032 in `plan.md` record text-recognition limits; do not report those as findings. THREAT MODEL (D-027): the threat model is accidental damage only; list hostile-only routes in one line.

Output: findings ranked HIGH/MEDIUM/LOW, each with file:line and an accidental failing scenario; residuals; and a SHIP / DO-NOT-SHIP-YET verdict for Stage 7. The coordinator has run the changed-scope audit against `main` with the committed baselines at HEAD `273e1d0`: verdict pass. It has also run typecheck, tracked lint and the full suite (3371/3371); all pass.
