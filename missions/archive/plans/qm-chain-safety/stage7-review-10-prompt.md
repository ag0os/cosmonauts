You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive. Put probes in a scratch directory outside the repository.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

This is a NARROW confirmation review (Stage 7 review 10) of TASK-755 (`cf68b25`, diff `5ddfd96..HEAD`). Read `missions/tasks/TASK-755*.md` and `missions/plans/qm-chain-safety/stage7-review-9-{codex,claude}.md`.

TASK-755 makes three changes:
- It normalizes the QM report once, converting CRLF, lone CR and non-breaking spaces.
- It introduces one shared heading predicate, `headingLines`, used by every section function.
- It treats text after the report-index comment as unexpected content.

To avoid tripping the new after-index rule, it also moves the host's own annotations in `quality-review-run.ts`. They were appended at the end of the report; they are now inserted before the first `##` heading. The affected annotations are "Index unavailable.", "Live work: …", "Workspace retained: …", "Panel completion timeout", "Caller-owned remediation", "Omitted skill locations" and the operator note.

Check:
1. Are all review-9 findings RESOLVED (codex MEDIUM x3 and LOW, Claude MEDIUM and LOW x2)? Give file:line evidence, and state whether each new test fails on `5ddfd96`.
2. **Host annotations must never be lost.** In particular, what happens when the report has NO `##` heading? That includes a malformed report, a failed or refused assessment, an empty report, and any path where `appendFinalAnnotations` or the "Index unavailable" insertion runs on text without a heading. The Live work and Workspace retained disclosures carry INV-003 and liveness evidence, and the D-028 disclosure must appear in every report (see `discloseOperatorAuthority`). Check every verdict path — ready, not-ready, failed, refused, and cancel/deadline — and check the plan summary. Is any disclosure dropped or misplaced, or does anything now land inside a section and change what that section's checks see?
3. Regressions in the section functions: a clean LF report and a clean CRLF report reach `ready`; the calibration rewrite and the unindexed amendment land in the right section; floors 1 and 2 of D-031 hold. Also check that normalization happens before every consumer, including the plan summary and any path that reads the raw assessment text.
4. Tests that cannot fail, and scope creep.

Plan decisions D-031 and D-032 in `plan.md` record text-recognition limits; do not report those as findings. Threat model (D-027): accidental damage only; list hostile-only routes in one line.

Output: findings ranked HIGH/MEDIUM/LOW, each with file:line and an accidental failing scenario; residuals; and a SHIP / DO-NOT-SHIP-YET verdict for Stage 7. The coordinator has run the changed-scope audit against `main` with committed baselines at HEAD `aa2559e`: verdict pass. It has also run typecheck, tracked lint and the full suite (3381/3381); all pass.
