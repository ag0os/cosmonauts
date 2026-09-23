# qm-chain-safety — coordinator status

Branch `feature/qm-chain-safety`, off local `main` at `29fc0ce`. HEAD `ad7c3e1`. Not pushed.

## State (2026-09-23)

- **Done:** Intent ratified (`1930dda`); `/spec-to-backlog` Phases 1-3.
  - The chain (`chain-f21fd921`) designed the plan and wrote review-1 and review-2, both about this plan (`37ad121`).
  - My independent 4-lens adversarial review produced 24 findings, all verified (17 confirmed, 7 partial), recorded as `review-3.md`.
  - The plan is revised from both channels (`ad7c3e1`); the dispositions are in review-3.md.
- **Running:** nothing.
- **Blocked on:** the Phase 3 human gate plus five rulings on ratified ground (H-001..H-005 below; drafted in full in plan.md's Decision Log).
- **Next:** on the rulings, record them (amend the spec/D-001 where chosen), then Phase 4 task-manager → coverage matrix → compliance review → `/implement-plan`. Stages 1-3 (authority, baselines, suppressions) do not depend on any H-item.

## Needs the user

Five rulings. Each touches ratified ground (a spec AC's letter, a human decision, or an INV reading), so an agent may not pick. Recommendation first. Full drafts are in plan.md H-001..H-005.

1. **H-001 — AC-003 vs AC-007.** AC-003 says the checkout's untracked files stay byte-identical, while AC-007 requires a new tracked plan summary in that checkout on every exit. Recommend (A): amend AC-003 to exempt exactly the host-written new file `missions/plans/<slug>/qm-runs/<runId>.md`, never an overwrite and never agent-visible. (B) would move the summary out of the checkout instead, amending AC-007 and D-001 item 2.
2. **H-002 — clone instead of the decided "detached worktree" (D-001 item 3).** A linked git worktree shares refs, stash, hooks and config with your repo, and INV-001 forbids changing refs. The host-run checks execute test code that can run git. Recommend (A): amend item 3 to "an isolated detached checkout (a private local clone)".
3. **H-003 — projects without the new `qualityReview` config.** Checks become configured argv run by host code, since the QM has no shell, and the diverse reviewer model is configured. Recommend (A): unconfigured → a visible "not configured" item and a human item, and the verdict can't be `ready`. Nothing is silent and nothing is refused. This repo configures both. This narrows AC-016's letter for unconfigured projects. (B) refuse; (C) the model proposes commands (weakens INV-001).
4. **H-004 — does INV-001's "QM run" include the runtime bootstrap?** A standalone QM is identified only after cosmonauts bootstraps and imports project domain modules, as every command does. Recommend (A): the run starts at the QM launch boundary, with the snapshot taken before any QM session exists. (B) the strict reading needs a separate CLI-bootstrap redesign.
5. **H-005 — AC-015 "nothing links to their old paths".** Hits include the frozen fixture `tests/fixtures/knowledge-seed-inventory.json`, byte-pinned `knowledge/` records, evidence reports and archived plans. Recommend (A): "nothing links" covers live surfaces only (prompts, skills, docs, code, active plans, ROADMAP). History keeps its text, and an archive README maps old paths to new ones.

Also for acknowledgement (no choice needed): when execution-liveness rebases, its plan needs an amend-on-record entry registering this plan's host-run check processes as descendants of the QM attempt (plan R-008).

### Earlier (resolved)

- Intent RATIFIED 2026-09-23; consequences acknowledged; decisions 6/7 stay ACs.

## Successor handoff

Read `spec.md` and `plan.md` (Decision Log D-001/D-002) here, then `.shepherd/work/todo/qm-chain-safety/investigation.md` for the evidence. Constraints from the coordinator brief (`.shepherd/work/todo/qm-chain-safety/brief-coordinator.md`):

- no QM for verification (D-002);
- codex `gpt-6-sol` (workers medium, reviews high); Drive uses `COSMONAUTS_DRIVER_CODEX_ARGS="-m gpt-6-sol -c model_reasoning_effort=medium"`;
- commit only on this branch, with explicit paths;
- no push, merge or PR;
- ratified ground changes only by a relayed human decision.
