# Coordinator status

HEAD: `05b021e` on `feature/framework-health` (not pushed), clean.

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

## Needs the user

Nothing open.

(H-004 / review-7 PR-006 is resolved. The human approved both D-007 edits exactly as drafted
(relayed 2026-09-23), and they are applied to `missions/architecture/orchestration-future.md`.
Execution-liveness D-042 records it, D-033 and H-003 are superseded in part, and H-004 is closed.)
