You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive. Put any probes in a scratch directory outside the repository.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

Stages 1–6 are closed: both review channels gave SHIP at `missions/plans/qm-chain-safety/mid-review-10-*.md`.

This is a FOCUSED Stage 7 re-review (round 5).

Stage 7 reviews 2–4 found gaps in the host B-010 calibration: see `missions/plans/qm-chain-safety/stage7-review-{2,3,4}-{codex,claude}.md`. The coordinator's plan decisions **D-031** and **D-032** (read both in `plan.md`) bound the work. D-032 replaced the parsing of closures inside Findings with a rule that fails safe by construction: any Findings content except `None recorded.` blocks `ready`, and evidenced dismissals live only under Out-of-range observations. The host calibration is defense in depth over free-form model prose. It must meet two HARD FLOORS:
1. It never produces or permits a false `ready`.
2. It never silently drops a reviewer finding. Every reviewer finding ID ends up as one of: its own entry in Findings, its own entry in Out-of-range observations, a dismissal with evidence, or an item the host carries over.

D-031 also requires unsupported performance P0/P1 to be capped to P2 or raised as a human item. Whether a quoted `measuredCost` / `closureEvidence` string is a *genuine* measurement or *different-lens* evidence stays heuristic, and its known misses are RECORDED LIMITS. Examples: a measurement-looking code line, or the QM repeating a same-lens evidence quote. Do NOT report further text-recognition misses of that kind as findings; list them in one line under residuals. Findings must break a hard floor, the P0/P1 cap, a ratified AC/INV, or a Stage 1–6 guarantee.

TASK-750 (`6733eae`) implements D-032: read `missions/tasks/TASK-750*.md`. Review the diff from `9117af1` to HEAD, in the context of the whole B-010 host calibration; ignore `missions/` except as documentation.

First, for every stage7-review-4 finding (codex 1–3, Claude H-1 and L-1..L-3, and the extra-heading and prompt residuals), state whether it is RESOLVED, PARTIAL or OPEN, with file:line evidence. Check that its test would fail on the pre-TASK-750 code (`git show 9117af1:<path>`) or kills a named mutation. In particular, replace the Findings condition in the host ready check with `false`, make the order-independent closure check consult only the first raising lens, and confirm that some test fails for each.

Authoritative documents:
- `missions/plans/qm-chain-safety/spec.md`: INV-001..005 and the ACs are ratified, especially AC-013, AC-014 and AC-016. The threat model sits beside the Intent.
- `plan.md`: B-010, B-011, D-019, D-024..D-031 and Design §6.

THREAT MODEL (D-027): the QM protects against accidental damage, not a hostile change. List hostile-only routes in one line as residuals, unranked. D-028 accepts that host-run checks execute reviewed code.

Assess:
1. **The two D-031 floors, on realistic accidental report shapes.** Check:
   - multiline entries;
   - IDs mentioned inside other entries;
   - leading non-finding tokens such as TASK-/AC-/D- IDs;
   - findings placed under Out-of-range observations;
   - dismissals (in Findings they must block; in Out-of-range they close only with other-lens evidence, in any reviewer order);
   - extra `##` sections and the `None recorded.` sentinel;
   - capped-entry rewrites that must keep every line;
   - empty or missing sections;
   - a report whose findings are all out-of-range or evidenced dismissals, with gates, checks and model clean, which must be able to reach `ready`.
   Can any ordinary shape yield a false `ready`, or lose a reviewer finding ID?
2. **The P0/P1 performance cap**, in the prompts and in the host.
3. **Regressions to B-011 and Stages 1–6.** The guarantees to recheck:
   - D-025: host-verified gates, and no `ready` with any host human item.
   - D-026 ordering.
   - D-019 not-configured behavior.
   - Base-owned runtime and config.
   - The changed-scope audit against `main` with the committed `.fallow-baselines/` still passes.
4. **Tests that cannot fail** (mutation-check the new ones), correctness, liveness, and scope creep beyond TASK-750. Check that D-032 is implemented as written, and that it does not reopen anything D-031 or D-032 records as a limit. Also check the liveness side of the fail-safe rule: a normal clean report can still reach `ready`, and ordinary QM formatting does not make `ready` unreachable in practice.

Output:
- severity-ranked findings (HIGH/MEDIUM/LOW), each with file:line, an accidental failing scenario, and the floor/AC/B/D it breaks;
- the disposition table;
- residuals, in one line each;
- a SHIP / DO-NOT-SHIP-YET verdict for Stage 7.
