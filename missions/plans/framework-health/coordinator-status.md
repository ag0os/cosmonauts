# Coordinator status

HEAD: `5149d92` on `feature/framework-health` (not pushed), clean.

## Done

- Re-baseline: lint, typecheck clean. The suite was 3,072/3,073. The one failure was
  not a flake: the user's re-sync of `~/.claude/commands/implement-plan.md` (2026-09-22)
  changed the bytes a test pins. The home copy equals this branch's export byte for byte,
  so the pin was moved (`af3cfe0`).
- Decision 2 (framework-health): review-8 PR-001..003 carried into TASK-710/711 as
  D-036 (human, relayed). check-artifacts passes (`c887174`).
- Decision 1 (execution-liveness): D-041 (human, relayed) stops planning. The backlog is
  TASK-712..719, one task per Implementation Order stage, and each behavior has exactly
  one owning task. Review-7 PR-001..005, PR-007 and Missing Coverage are ACs. PR-006 is
  recorded as H-004 with the "amend" ruling (`3e643bd`).

## Running

- **TASK-711 done** (Stage 2 closed). Codex took three rounds: FIX (2 findings), FIX (1), then SHIP. Census:
  240 files, 30 strata, 75 declarations. First probe: 66 killed, 9 survived. Every survivor was closed:
  six were strengthened and independently re-probed, S42 was deleted, S59 was killed in Pi, and S11
  was killed by typecheck. Derived decisions D-037 and D-038 are on the record.
- **TASK-708 done** (Drive/codex), plus a coordinator follow-up (D-039). The worker's check ran
  Fallow and discarded its output, and treated every `cli/` file as a root. It now roots at
  what `bin/` imports (test first). Fallow cannot follow the extensionless `bin/cosmonauts`.
- **TASK-709 done** (Drive/codex). Deleted `run-run-loop.ts`, `spawn-compiler.ts` and
  `harness-adapters/index.ts` with their tests. `check:reachability` reports 199/199 and exits 0.
  Suite 2,994/2,994.
- **TASK-710 done** (`82e4a80`). A codex worker started it and hit the account usage limit; a
  Claude worker finished it from the partial diff, with red evidence per AC. `Cancelled` is wired
  through all consumers. TASK-706/707 are Cancelled with byte-identical ACs and notes, and
  test-health-audit is archived. It also fixed a pre-existing coordinator bug: the `task_list`
  filter had been renamed, so the "ready" listing ignored dependencies. Suite 3,004/3,004; lint,
  typecheck, check-artifacts and reachability are clean.
- **Stage 3 verification, round 1** (independent Claude review, 19 executed mutation probes): FIX,
  with 2 blocking findings. (1) Drive's default selection ignored dependencies, so it would run a
  dependent of a Cancelled task. (2) The reachability tests pinned no root. Both are fixed test
  first (`6d6e9db`). The re-review says SHIP (`1ec9f99` corrects one comment). Suite 3,017/3,017.
  Known low-severity limitation: a malformed archived dependency file fails closed with a
  misleading "scheduler drained" diagnosis. This is a pre-existing gray-matter quirk, not fixed.
- Codex model: back to `gpt-6-sol` after the user's subscription upgrade (relayed 2026-09-23). Medium
  effort by default (the `~/.codex/config.toml` default, so Drive needs no override); reviews use
  high. The usage limit is lifted. The QM chain and its Pi-side reviewers stay on
  `openai-codex/gpt-5.6-sol`: Pi 0.80.6's model catalog has no `gpt-6-sol`, so their shipped
  definitions can't move until the Pi upgrade branch lands.
- Codex Stage 3 review (`gpt-6-sol`, high) is running; the QM runs after it. They are never run
  together, because both were OOM-killed when run concurrently before.

## Noticed (no action needed now)

- The brief says the home command copies were re-synced, but that is only true of
  `implement-plan`. `~/.claude/commands/spec-to-backlog.md` is dated Sep 10 and still
  differs from `external-commands/spec-to-backlog.md` (the Quality Contract wording).
  When it is re-synced, `tests/harness-adapters/inventory.test.ts` fails until its pin
  (`c64297bd…`) is moved as well. I will re-pin it after a re-sync.

## Successor handoff (written 2026-09-23 at ~45% context)

For the next coordinator. The brief is `.shepherd/work/in-progress/framework-health/brief-coordinator-1.md`
(read-only; `.shepherd/` is git-excluded, so never add it). Shepherd relays the user's decisions; write
questions under `## Needs the user` and stop.

**State.** Brief steps 1–2 are done. On framework-health, Stage 2 is closed and Stage 3 (TASK-708..710)
is implemented and reviewed; only its final verification remains. All four framework-health tasks
are Done in the task files. Execution-liveness has a backlog (TASK-712..719, all To Do). H-004 is
resolved (architecture D-007 amended, D-042). Nothing else is open with the user.

**In flight when this was written.** Codex round 2 on the Stage 3 remediation `5149d92`:
`codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`. Its prompt is
`$SP/codex-s3-r2.txt` and its output `$SP/codex-s3-r2.out`, where SP is this session's scratchpad:
`/private/tmp/claude-501/-Users-cosmos-Projects-cosmonauts/48a323d3-6dcb-4e30-8670-c9509cf01121/scratchpad`.
Read the verdict with `tail` after the line `tokens used`.

**Remaining, in order.**
1. Triage codex round 2. For each real finding, have a worker fix it test first (seen red), commit it
   yourself, then re-review. Every remediation round has produced new defects so far.
2. Run the Quality Manager (D-023's shipped verification path for Stage 3), only on a committed, clean
   tree, and never alongside codex (both were OOM-killed when run together):
   `bun bin/cosmonauts run chain "coding/quality-manager" "<prompt>"`. In the prompt, name plan
   framework-health, Stage 3 = TASK-708..710 plus review fixes, range `9be076b..HEAD`, and say to
   reconcile against the LOCAL branch, not origin (origin/main is far behind). State out of scope:
   the D-007 architecture amendment `05b021e` (human) and execution-liveness. Known accepted items:
   the malformed-archived-file diagnosis, and a bare `--ready` listing that displays Cancelled/Done
   tasks. The QM runs on `openai-codex/gpt-5.6-sol` (Pi 0.80.6's catalog has no gpt-6-sol). It
   reverts uncommitted work and tends to under-remediate, so fix real findings yourself through a worker.
3. Then report to Shepherd: framework-health Stages 1–3 done and verified. Offering archive plus
   distillation is a follow-up for the user; do not archive unattended. Do not start execution-liveness
   implementation unless Shepherd says so.

**Method notes (hard-won today).**
- Drive: `bun bin/cosmonauts run drive --plan framework-health --task-ids <ID> --backend codex --mode detached
  --branch feature/framework-health --task-timeout 3600000`. Wait with a background until-loop on
  `events.jsonl` for run_completed/run_aborted. Drive leaves files under `missions/` (other than task
  files) uncommitted; commit them yourself.
- A codex worker that exits 1 after a few minutes: check the newest `~/.codex/sessions/.../rollout-*.jsonl`
  for `usage_limit_exceeded`. The user has since upgraded the subscription.
- Claude subagents (the Agent tool) were reliable as workers and as independent reviewers. Tell them:
  no git state changes, cp backups rather than `git checkout`, their own scratchpad worktree for mutation
  experiments, and "seen red first".
- Unquoted heredocs run backticks. Write Python generators to a file, or use `<<'EOF'`.
- `tests/packages/` is gitignored but tracked: `git add -f` its files.
- The home command pins in `tests/harness-adapters/inventory.test.ts` break whenever the user re-syncs
  `~/.claude/commands/*`. Re-pin after checking that the home copy equals the branch export.

## Needs the user

Nothing open.

(H-004 / review-7 PR-006 is resolved. The human approved both D-007 edits exactly as drafted
(relayed 2026-09-23), and they are applied to `missions/architecture/orchestration-future.md`.
Execution-liveness D-042 records it, D-033 and H-003 are superseded in part, and H-004 is closed.)
