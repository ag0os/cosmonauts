You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is Stage 9 CLOSURE review 3 for TASK-728: a FOCUSED re-review after the closure-review-2 remediation. It runs under D-002 and D-034, which require two channels, a Claude subagent on Opus 5.5 and read-only codex on `gpt-5.6-sol`. The Quality Manager is never used to verify this plan.

READ-ONLY for the repository. Do not modify repository files, run state-changing git commands, or run the QM, any chain or any Drive against this repository. For execution such as tests, mutation checks or probes, use a private clone: `git clone --no-hardlinks /Users/cosmos/Projects/cosmonauts <scratch>/repo`, then check out `feature/qm-chain-safety`. Never use `git worktree add`. Probes that touch git internals run in a subshell with `set -euo pipefail` on absolute scratch paths. If your sandbox does not allow writes, inspect instead and say so.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`. The remediation is TASK-765, commit `35e3b95`, diff `8bb53a8..HEAD`; read `missions/tasks/TASK-765*.md`. Closure review 2 is in:
- `closure-review-2-claude.md`, channel A: SHIP, 3 LOWs;
- `closure-review-2-codex.md`, channel B: DO-NOT-SHIP-YET, M1–M3 and L1;
- `closure-review-2-kimi.md`, a third data point: SHIP.

Also read plan decisions D-031, D-032, D-034 and D-035. D-035 dispositions codex M1 as a recorded limit.

Check:
1. **Dispositions.** For every closure-review-2 item, is it RESOLVED, PARTIAL, OPEN or RECORDED LIMIT? Cover codex M1 (D-035), M2, M3 and L1; Claude LOW-1..3; and Kimi MEDIUM-3. Give file:line evidence, and say whether each new test fails when its protection is removed; mutation-check in your clone where you can.
2. **Regressions from TASK-765.** Examine the new final-message rules for the QM result and for `stopReason` `length`. Do ordinary non-QM spawns and a normal clean QM run still behave correctly? Can a legitimate QM or reviewer run now fail spuriously, for example on a final tool-use turn or a normal `stop`? Are the new repository-pin tests robust, without false failures on legitimate files or sentence matching (D-014)?
3. **The whole-branch invariants still hold:**
   - INV-001..005;
   - the D-031 floors;
   - D-025 host-verified `ready`;
   - D-026 ordering;
   - D-019 not-configured behavior;
   - base-owned config.
4. **Gates.** Run in your clone if you can: test, lint, typecheck, the changed-scope audit against `main` with the committed baselines, and `check:suppressions -- --base main`.

Threat model (D-027): accidental damage only; list hostile-only routes in one line. The limits recorded in D-031, D-032 and D-035 are not findings.

Output:
- findings ranked HIGH/MEDIUM/LOW, each with file:line and an accidental failing scenario;
- the disposition table;
- residuals;
- a closure verdict: SHIP or DO-NOT-SHIP-YET.
