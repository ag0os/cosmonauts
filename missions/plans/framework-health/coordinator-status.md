# Coordinator status

HEAD: `e445a8e` on `feature/framework-health` (not pushed). The TASK-710 work is uncommitted, in progress.

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
- **TASK-710 in progress.** The codex worker hit its usage limit (the 5h window resets at
  15:29 local). A Claude worker is finishing it from the partial diff (backup in the scratchpad).
- Still to do: gates, then an independent review of Stage 3. Codex is unavailable until 15:29,
  so either wait for it or use another reviewer. QM (D-023) runs on a committed tree only.

## Noticed (no action needed now)

- The brief says the home command copies were re-synced, but that is only true of
  `implement-plan`. `~/.claude/commands/spec-to-backlog.md` is dated Sep 10 and still
  differs from `external-commands/spec-to-backlog.md` (the Quality Contract wording).
  When it is re-synced, `tests/harness-adapters/inventory.test.ts` fails until its pin
  (`c64297bd…`) is moved as well. I will re-pin it after a re-sync.

## Needs the user

### H-004 / review-7 PR-006: exact D-007 amendment text (awaiting approval)

Nothing is committed until the exact text below is approved. Proposed replacement for
the `D-007` entry in `missions/architecture/orchestration-future.md`. The old wording
stays in git (last at `3e643bd`).

```
- `D-007 - Liveness is a universal node-attempt contract`
  - Decision: Every executing graph node has separate lease, useful-activity,
    and host-availability signals; bounded settlement-based cancellation;
    attempt fencing; persisted execution identity/evidence; an absolute hard
    ceiling on every attempt, enforced in every mode; and shadow/enforce idle
    policy. Hard-ceiling and idle policy are set in project configuration
    only; the hard ceiling defaults to four hours. Only the idle deadline is
    shadowable. Only the current unsuperseded token may mutate lifecycle
    state. Lease expiry is health evidence, not automatic authority to replace
    an unconfirmed mutating attempt.
  - Alternatives: Add timeouts only to chain stages or Quality Manager; treat
    process heartbeat as proof of execution progress; leave the hard ceiling
    optional, or make it shadowable with idle.
  - Why: A node that can remain `running` forever makes every higher-level mode
    non-durable. Lease liveness and execution progress answer different
    questions and must not mask each other. A shadow-default idle deadline
    alone cannot end a silent attempt that keeps its lease, so the ceiling is
    the backstop that makes termination unconditional.
  - Decided-by: human architecture dialogue, 2026-09-10 through 2026-09-11.
    Amended 2026-09-13 by codex from the independent review and
    human-accepted 2026-09-14 (derived): the unsuperseded-token and lease-expiry
    sentences, as further amended by the execution-liveness quarantine ruling.
    Amended 2026-09-23 by human ruling ("amend", relayed by the supervising
    session) to agree with execution-liveness INV-002 and its provenance
    (`missions/plans/execution-liveness/ruling-packet.md` Q1: hard ceiling
    always enforced, only idle shadowable; Q2: project config only; plan H-002:
    four-hour default): the hard ceiling is mandatory in every mode, and the
    former sentence "Useful active work has no mandatory wall-clock ceiling"
    and the rejected alternative "require a global hard timeout" are removed.
```

The same record has a second sentence that contradicts the ruling. The "Universal
execution envelope" section (line 364) says "explicit idle timeout, optional hard
timeout, and bounded cancellation grace". The ruling did not name it; I propose it
reads:

```
- an absolute hard ceiling enforced in every mode, shadowable or enforced idle
  timeout, and bounded cancellation grace;
```

After approval I will: apply both edits; mark D-033 (and the H-003 constraint) in the
execution-liveness plan superseded, dated, by a new decision recording the amendment;
mark H-004 and PR-006 closed; run check-artifacts; and commit. Please approve the text,
or send corrections.
