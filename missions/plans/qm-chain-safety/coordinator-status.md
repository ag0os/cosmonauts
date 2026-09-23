# qm-chain-safety — coordinator status

Branch `feature/qm-chain-safety`, off local `main` at `29fc0ce`. HEAD `1930dda`. Not pushed.

## State (2026-09-23)

- **Done:** spec + seed plan (D-001, D-002); roadmap item removed; **Intent INV-001..005 ratified by the human as drafted** (`1930dda`); both consequences acknowledged; decisions 6/7 stay ACs.
- **Running:** `/spec-to-backlog` Phase 1 — `planner -> plan-reviewer` chain (background; log in the coordinator scratchpad `chain-plan.log`). Do not edit `plan.md` while it runs.
- **Blocked on:** nothing.
- **Next:** Phase 2 independent review workflow → Phase 3 revision → task-manager → coverage + compliance review → `/implement-plan` (QM replaced per D-002).

## Needs the user

### 1. ~~Ratify the Intent~~ — RATIFIED 2026-09-23 (relayed). Text kept for reference.

Goal: a Quality Manager run can only produce findings. It cannot damage the work it reviews, it cannot mistake another run's record for its own, and its gates cannot be passed by hiding a finding.

- INV-001 - Review does not mutate. A QM run, and every agent it starts, cannot change the reviewed checkout: tracked and untracked files, uncommitted edits, the index, refs or HEAD. This holds by construction (isolation and authority limits), never by instruction. If the isolation cannot be established, the run is refused; it never falls back to the shared checkout.
- INV-002 - Records belong to their run. Every report a QM run relies on was created by that run, in a location no other run writes to. A missing report is a failure, never a stand-in from an earlier run. No run modifies or deletes a record it did not create.
- INV-003 - The verdict outlives the conversation. The complete final report (verdict, findings, items needing a human, gate results) is persisted outside the conversation on every exit, including failure and refusal.
- INV-004 - Authority lists bind every path. An agent can start only the agents its definition allows, whichever orchestration tool it uses.
- INV-005 - Gates judge the change and cannot be silenced. A changed-scope analysis gate fails only on findings that the change introduced relative to the committed baseline. Findings already present in touched files never fail it. A newly added suppression directive fails the quality gate unless a human has listed it in the project's exception registry.

Ranking: INV-001 wins over availability (a review that cannot be isolated does not run, and the refusal is reported). INV-002 wins over continuity with existing file locations. INV-005's baseline never absorbs a new finding silently.

Decisions 6 (performance P1 needs measured cost; a lens never closes its own finding alone) and 7 (model diversity) appear as AC-013 and AC-014, not as invariants. They are reviewer policy, not properties a mechanism could collide with. Say so if you want them promoted.

### 2. Consequences — ACKNOWLEDGED 2026-09-23 (relayed)

- The named chains that end in `quality-manager` (`bundled/coding/chains.ts`, five chains) will end at a findings report, not a remediated tree. Remediation becomes a separate invocation.
- `execution-liveness` (TASK-712..719, all To Do) lands after this plan and rebases onto it. Its ratified AC-015 (a timed-out wait never cancels the child) is why aborting orphaned children is a non-goal here. Worktree isolation makes orphans harmless to your checkout instead.

### 3. Open to the planner (comes back to you only if it moves scope)

- Isolation at the QM launch surface, or in the durable runtime's `WorktreeSpec.isolated` slot. The latter overlaps `execution-liveness`'s launch and store seams.
- Which reviewer runs on the other model family, and how its model is chosen without hard-coding a provider.
- The exact report paths: run artifacts plus a tracked plan summary, per decision 2.

## Successor handoff

Read `spec.md` and `plan.md` (Decision Log D-001/D-002) here, then `.shepherd/work/todo/qm-chain-safety/investigation.md` for the evidence. Constraints from the coordinator brief (`.shepherd/work/todo/qm-chain-safety/brief-coordinator.md`):

- no QM for verification (D-002);
- codex `gpt-6-sol` (workers medium, reviews high); Drive uses `COSMONAUTS_DRIVER_CODEX_ARGS="-m gpt-6-sol -c model_reasoning_effort=medium"`;
- commit only on this branch, with explicit paths;
- no push, merge or PR;
- ratified ground changes only by a relayed human decision.
