You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive. Put probes in a scratch directory outside the repository.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

Stages 1–7 are closed; both review channels gave SHIP on Stage 7 at `stage7-review-13-*.md`. This is the Stage 8 review, of TASK-727. The diff runs from `b1cd770` to HEAD (`8b59412` plus the coordinator commit `2b44ee9` of the archive README and an active-plan link repair); read `missions/tasks/TASK-727*.md`, including its coordinator note.

Authoritative documents:
- `missions/plans/qm-chain-safety/spec.md`: INV-001..005 and the ACs are ratified, especially AC-015 and the amended AC-016.
- `plan.md`: B-012, D-001, D-002, D-014, D-015, D-019, D-022 and D-025..D-032, and the Implementation Order for Stage 8.

THREAT MODEL (D-027): accidental damage only. List hostile-only routes in one line.

Assess:
1. **B-012 / D-022 archive.**
   - All eleven shared round files moved with `git mv` into one archive home. History must be reachable with `git log --follow`; verify this on at least three files.
   - The archive README maps every old path to its new home.
   - The two `analysis-gate-coverage-*-round-1.md` files stay in place.
   - Run an exact tracked search (`git grep -n`) for every old path. Every live-surface reference must be repaired: prompts, skills, docs, code, tests other than frozen fixtures, active plans, and `ROADMAP.md`.
   - Frozen fixtures, curated `knowledge/` records, evidence reports, `missions/archive/**` and this plan's own review files must be unchanged. List any violation.
2. **Named chains and callers.**
   - QM-ending named chains in `bundled/coding/chains.ts` (`plan-and-build`, `implement`, `spec-and-build`, `adapt` and others) stop at a durable findings report. Nothing downstream claims a clean tree, fixed code or a completed plan.
   - Are these exercised end to end through shipped named-chain entry points, as AC #3 and #6 require?
   - Caller guidance must consistently describe remediation through tasks, Drive and independent review. Check it in `cody.md`, the spawning and dispatch skills, `docs/orchestration.md`, `README.md`, `AGENTS.md`, `external-commands/implement-plan.md` and `external-skills/cosmonauts/SKILL.md`. It must also keep project checks, direct gate resolution, panel triage, the specialists, and the D-019 "not configured" outcome.
   - `external-commands/implement-plan.md` must describe the review-only QM, and the D-002-style substitution where the QM is itself under review. Its fix loop must go through tasks, Drive and re-review after every remediation round.
3. **D-014 / D-015.** Behavior must be reviewed at the observer, entry-point and outcome level. There must be no sentence-matching tests and no invented gate sections, and historical D-001 and spec citations must remain verbatim.
4. **Regressions to Stages 1–7.** Recheck the QM runtime, host checks, calibration, base-owned config, and the changed-scope audit against `main` with committed baselines.
5. **Tests that cannot fail, correctness, liveness and scope creep.**

Output:
- severity-ranked findings (HIGH/MEDIUM/LOW), each with file:line, an accidental failing scenario, and the AC/B/D it breaks;
- residuals;
- a SHIP / DO-NOT-SHIP-YET verdict for Stage 8.
