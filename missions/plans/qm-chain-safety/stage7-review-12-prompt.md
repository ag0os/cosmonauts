You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive. Put probes in a scratch directory outside the repository.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

This is a NARROW confirmation review (Stage 7 review 12) of TASK-757 (`4ceb768`, diff `571bb13..HEAD`). Read `missions/tasks/TASK-757*.md` and `missions/plans/qm-chain-safety/stage7-review-11-{codex,claude}.md`. In review 11 the Claude channel said SHIP; codex raised the same-line index suffix HIGH. TASK-757 makes any line starting with `<!-- COSMO_QM_REPORT` that is not exactly one whole-line index count as unexpected content, and sections now end at any marker line.

For context, TASK-756 (the previous round) made four changes:
- The index marker is recognized only as a whole line: `^<!-- COSMO_QM_REPORT <json> -->$`, multiline. This applies in `nextSectionStart`, the index parse, `indexedQualityReviewReport` and the after-index check.
- A single `insertQualityReviewPreamble` helper places host notices before the first section, falling back to before the index.
- The plan summary now carries the `Live work`, `Workspace retained` and `Index unavailable.` disclosures.
- The CRLF-duplicate test is rebuilt.

Check:
1. Is the review-11 codex HIGH RESOLVED, together with the trailing-whitespace and unclosed-marker cases? Give file:line evidence, and state whether each new test fails on `571bb13`. Does any calibration or amendment path remove or rewrite a malformed marker line or its suffix?
2. **The index format.** The index regex now requires the index to be one whole line. Does `renderQualityReviewReport` always emit it that way? Consider JSON containing newlines, `-->`, or the index sitting on the same line as other text. Can any host-rendered or ordinary QM-written report now lose its index? Losing the index flips reports to the unindexed path. Can any ordinary shape now make a finding disappear or yield a false `ready`?
3. **The preamble helper.** Does it ever place a notice inside a section? Does it work with no heading, with no index, and with both? Is the plan-summary disclosure extraction correct for every verdict path?
4. Regressions against D-031 floors 1 and 2, D-025, D-026, D-028, and INV-003.

Plan decisions D-031 and D-032 in `plan.md` record text-recognition limits; do not report those as findings. Threat model (D-027): accidental damage only; list hostile-only routes in one line.

Output: findings ranked HIGH/MEDIUM/LOW, each with file:line and an accidental failing scenario; residuals; and a SHIP / DO-NOT-SHIP-YET verdict for Stage 7. The coordinator has run the changed-scope audit against `main` with committed baselines at HEAD `5f6e97f`: verdict pass. It has also run typecheck, tracked lint and the full suite (3391/3391); all pass.
