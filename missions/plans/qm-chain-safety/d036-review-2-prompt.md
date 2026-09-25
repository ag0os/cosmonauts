You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is D-036 review 2, a FOCUSED re-review after remediation, under D-002 and D-034: a Claude subagent on Opus 5.5 and read-only codex on `gpt-5.6-sol`. The Quality Manager is never used to verify this plan.

READ-ONLY for the repository at /Users/cosmos/Projects/cosmonauts (branch `feature/qm-chain-safety`). Do not modify its files or run state-changing git commands there. For execution, use a private clone (`git clone --no-hardlinks`, check out `feature/qm-chain-safety`, and create a local `main` from `origin/main`). Never use `git worktree add`. If your sandbox cannot write, inspect instead and say so.

Context: `missions/plans/qm-chain-safety/d036-review-1-prompt.md` holds the round-1 brief, with the ruling and its questions. Round 1 results are in `d036-review-1-claude.md` and `d036-review-1-codex.md`: both DO-NOT-SHIP-YET on F-1 (slash-bearing model ids rejected), with a LOW that the mismatch verdict was not pinned. The remediation is TASK-767, commit `6692fb4`, diff `03c4ba2..HEAD`. Read `missions/tasks/TASK-767*.md`. Real QM run 4 is recorded at the end of `closure-e2e.md`. It dispositions UR-001 (legacy keys ignored silently): the keys never reached `main`.

Check:
1. For each round-1 item (F-1, F-2/legacy keys, F-3/mismatch pin) and QM run-4 items UR-001..UR-003: is it RESOLVED, OPEN or ACCEPTED? Give file:line evidence. Mutation-check the new tests in your clone: restore the old regex, and inject a configured-vs-observed substitution verdict branch.
2. Did TASK-767 regress anything? Does the new regex still reject malformed values (no slash, empty provider, empty id, whitespace)? Does any `provider/id` that Pi's `resolveModel` accepts still get rejected?
3. Re-answer round-1 question 1 in one line: is any model-family coupling or model constraint left on a live surface?
4. Gates, in the clone: test, lint, typecheck, `check:reachability`, `check:suppressions -- --base main`, `bun bin/cosmonauts plan check-artifacts qm-chain-safety`.

Threat model (D-027): accidental damage only. D-031/D-032/D-035 limits are not findings.

Output: findings ranked HIGH/MEDIUM/LOW, each with file:line and an accidental failing scenario; a disposition table; residuals; a verdict of SHIP or DO-NOT-SHIP-YET.
