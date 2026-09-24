You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive. Put probes in a scratch directory outside the repository.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

This is a NARROW confirmation review (Stage 7 review 7) of TASK-752 (`88f272d`, diff `c815aa3..HEAD`). Read `missions/tasks/TASK-752*.md` and `missions/plans/qm-chain-safety/stage7-review-6-claude.md` (MEDIUM-1, LOW-1). In review 6, the codex channel reported no code findings.

TASK-752 replaces the unanchored `indexOf("## <heading>\n")` section lookup in `lib/orchestration/quality-review-report.ts` with an anchored line match.

Check:
1. Are MEDIUM-1 and LOW-1 RESOLVED? Give file:line evidence, and state whether each new test fails on `c815aa3`.
2. Does every lookup of a defined section now use the anchored match? Check `visibleSectionBody`, `replaceSectionEntries`, `amendUnindexedQualityReviewReport`, and any other `indexOf("## ...")` or similar in `quality-review-report.ts`, `quality-review-run.ts` and `quality-review-models.ts`.
3. Did this diff introduce a regression? In particular:
   - trailing whitespace on headings;
   - a heading at end of file;
   - the unindexed amend path still inserting into the right section;
   - the calibration rewrite still replacing the right entries;
   - a clean report still reaching `ready`.
4. D-031 floor 1 (no false `ready`) and floor 2 (no silently dropped reviewer finding): does any ordinary accidental heading shape still defeat them?

Plan decisions D-031 and D-032 in `plan.md` record text-recognition limits; do not report those as findings. THREAT MODEL (D-027): the threat model is accidental damage only; list hostile-only routes in one line.

Output: findings ranked HIGH/MEDIUM/LOW, each with file:line and an accidental failing scenario; residuals; and a SHIP / DO-NOT-SHIP-YET verdict for Stage 7. The coordinator has run the changed-scope audit against `main` with the committed baselines at HEAD `cd21033`: verdict pass. It has also run typecheck, tracked lint and the full suite (3368/3368); all pass.
