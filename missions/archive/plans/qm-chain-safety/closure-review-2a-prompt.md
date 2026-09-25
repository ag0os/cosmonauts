You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is Stage 9 CLOSURE review 2, channel A (attack execution), for TASK-728. It runs under the human-ratified decisions D-002 and D-034: this Claude channel on Opus 5.5 executes attacks, and a cross-family read-only codex channel (`gpt-5.6-sol`) audits spec conformance. The Quality Manager is never used to verify this plan.

Closure review 1 (`closure-review-1-claude.md`) found HIGH-1, MEDIUM-1, MEDIUM-2 and LOWs. TASK-761, TASK-762 and TASK-763 remediate them; read those task files. Start by giving each closure-review-1 finding a disposition: RESOLVED, PARTIAL or OPEN, with the probe you re-ran. Then re-execute the full attack list on the final branch, including the new protections: a reviewer session ending in a provider error or abort, audit findings reaching the report, and `@ts-nocheck`, renames, block comments and JSONC for suppressions.

This is a READ-ONLY review of the repository. Do not modify any repository file, do not run git commands that change repository state, and do not run the Quality Manager, any cosmonauts chain or any Drive against this repository. Execute probes, attack cases and test runs only in a private scratch clone outside the repository: `git clone --no-hardlinks /Users/cosmos/Projects/cosmonauts <scratch>/repo`, then check out `feature/qm-chain-safety`. Do NOT use `git worktree add`, because a worktree shares refs and objects with the reviewed repository. Any probe that touches git internals runs in a subshell with `set -euo pipefail` on absolute scratch paths or `git -C <scratch>`, never relative `.git` paths.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`. The whole branch is under review: `main..HEAD`. Stages 1–8 are each closed by two-channel reviews (the `mid-review-*`, `stage7-review-*` and `stage8-review-*` files in `missions/plans/qm-chain-safety/`).

Authoritative ground:
- `spec.md`: the Intent, INV-001..INV-005 and the ACs (ratified). Read the D-028 INV-001 interpretation and the D-027 threat model beside the Intent.
- `plan.md`: behaviors B-001..B-012, Design, Implementation Order and the Decision Log D-001..D-032. Ratified: D-001, D-002, D-018..D-023, D-027..D-030. Derived: everything else.
- `missions/tasks/TASK-728*.md`: the closure acceptance criteria, including the minimum attack list in AC #6.

THREAT MODEL (D-027): the QM guards against accidental damage, not a hostile change. List hostile-only routes in one line as residuals, unranked. D-028 accepts that host-run checks execute reviewed code. The recorded limits in D-031 and D-032 are not findings.

Assess (TASK-728 AC #2, #3, #4, #6):

1. **Behavior proofs.** For every Stage 1–8 behavior B-001..B-012, check that it is actually delivered and proved at the observer, entry-point and outcome level, through shipped tools, commands, chains, status projections, scripts and documented-process files, not only through exported functions. Cover:
   - refusals;
   - producer and correlation boundaries;
   - lifecycle and terminal outcomes;
   - authority routes;
   - snapshot fidelity;
   - baseline categories;
   - suppression and tamper paths;
   - report defects;
   - model-family outcomes;
   - legacy links and callers.
2. **EXECUTE the minimum attack list** (TASK-728 AC #6) in your scratch copy. For each item, report what you ran and the observed outcome.
   - **Capture:**
     - a stale stat cache plus an injected porcelain call;
     - an absolute or root-escaping symlink;
     - source edits between the two samples.
   - **Authority:**
     - bracket and fan-out `chain_run` to `fixer`;
     - a QM or child attempting bash, write or `chain_run`.
   - **Reviewer evidence:**
     - a forged, duplicate, foreign or empty reviewer completion;
     - a reviewer timeout with no cancellation.
   - **Suppressions:**
     - a same-change registry edit;
     - a gate-owned-file edit.
   - **Models and config:**
     - same-family, unresolvable and substituted models;
     - unconfigured checks and model.

   Where an item can only be exercised through the test harness, with fakes for model sessions, say so, name the test or probe, and state whether it would fail if the protection were removed. The coordinator runs the end-to-end real QM run on a dirty checkout separately. Its evidence is in `missions/plans/qm-chain-safety/closure-e2e.md`; check it.
3. **R-014 structural closure** (AC #3):
   - framework-owned launch, artifact and model policy stays out of coding prompts and out of the named complexity hotspots;
   - the durable runtime stays unaware of QM personas and Git mechanics;
   - injected ports preserve dependency direction;
   - ordinary agents and runs are unchanged;
   - no excluded scope entered: generic isolation, panel graph, owner liveness, cancellation, summary, or evidence generalization.
4. **Gates.** The configured project test, lint and typecheck gates, and the changed-scope audit against `main` with the committed baselines. Run them in your scratch copy if you can, and report the result.

Output:
- findings ranked HIGH/MEDIUM/LOW, each with file:line, an accidental failing scenario and the INV/AC/B/D it breaks;
- the attack-list table (item | what was run | outcome | protected?);
- residuals, one line each;
- a closure verdict: SHIP or DO-NOT-SHIP-YET.
