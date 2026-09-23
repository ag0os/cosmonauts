# Coordinator status

HEAD: `aed3197`+status on `feature/framework-health` (not pushed), clean. Suite 3,053/3,053; lint, typecheck, check-artifacts and reachability are clean.

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
- Stage 3 codex review (`gpt-6-sol`, high), three rounds:
  - Round 1, FIX: TOML/YAML parsed by regex, and the coordinator looped when no work could progress.
    Fixed in `5149d92`.
  - Round 2, FIX: the new terminal counted Cancelled tasks as open. Fixed in `49b4fa9`.
  - Round 3: SHIP. Suite 3,028/3,028.
- **Quality Manager done** (about 3h; verdict "Not merge-ready": one human decision, one P2 deferred). Its full
  report was lost to the chain's 200-character summary cap; its findings are in `missions/reviews/*-round-3.md`
  (committed `6d213f6`). It committed five `REVIEW-FIX` commits:
  - Kept, **not yet independently verified**: `1b130e5` (frontmatter/reachability hardening), `f1c1acf`
    (Cancelled handling), `7549348` (test runtime HOME isolation), `02d5bd4` (staged-owner parsing).
  - **Reverted** `e4ba2f0` (`61527f6`): about 20 `fallow-ignore` suppressions on mostly pre-existing code,
    three of them keeping unused exports green. That conflicts with INV-006/INV-007 and is out of scope.
  - F-006 (Windows bin-root normalization) fixed test first (`238cae4`).
  - Codex review of the four kept QM commits plus F-006 returned FIX:
    - The QM's `f1c1acf` had replaced the live step-start Cancelled check with a run-start snapshot, so a
      mid-run cancellation no longer blocked the dependent (reproduced).
    - A test touched `/tmp`.
    - The F-006 test bypassed the call site.
    All three are fixed (`a8cc97f`).
  - Re-review, FIX: a selected task cancelled mid-run still ran and was persisted Done. Fixed (`3dbde3e`).
    Accepted dispositions, which codex agreed with: a blocked run is terminal on resume, and the Windows
    call-site test cannot run end to end on POSIX.
  - Round 3: **SHIP.**
- **Stage 3 is verified.** Q1 is resolved (option B, `aed3197`, D-040), and codex found D-012/D-014 and D-040 correct.
- **Framework-health Stages 1–3 are closed.** No archive, and execution-liveness is not started (per Shepherd).
  - F-002 needs the user; see below.

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
is implemented, verified (QM plus codex rounds ending SHIP), and closed. All four framework-health tasks
are Done in the task files. Execution-liveness has a backlog (TASK-712..719, all To Do). H-004 is
resolved (architecture D-007 amended, D-042). Nothing else is open with the user.

**In flight.** Nothing is running (updated after the QM run). The scratchpad for prompts and
outputs is `/private/tmp/claude-501/-Users-cosmos-Projects-cosmonauts/48a323d3-6dcb-4e30-8670-c9509cf01121/scratchpad`.

**Remaining.** Nothing on Stages 1–3. The next steps are Shepherd's to assign to a fresh successor (archive and
distill framework-health, execution-liveness implementation TASK-712..719). Nothing is open with the user.

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

(The last item, `orchestration-future.md`'s three spawn-compiler passages, is resolved. The user approved the
suggested wording (relayed 2026-09-23), and it was applied in `863740f`. Q1 was resolved earlier as option B,
framework-health D-040.)
