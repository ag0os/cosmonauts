# Handoff — shared-primitive hardening (TASK-498, TASK-500, TASK-501)

You are picking up three follow-up tasks left behind by the shipped
`episodic-log-detached-hardening` plan. They are **pre-existing weaknesses in
shared primitives** — surfaced by that plan's four review rounds but older than
it, so they were deliberately triaged OUT of that plan's scope rather than fixed
under it. All three are `To Do`, high priority, labeled `review-fix` +
`pre-existing-on-main`. None is a regression from the merged work.

## Ground state

- Branch: `main` at `8401213` (the hardening plan is fully merged, fast-forward).
  **`origin/main` is at `d089611`, 30 commits behind local `main` — nothing has
  been pushed.** Do not push, merge to a remote, or open a PR unless the human
  says so.
- Baseline: **2705 tests / 237 files green, lint + typecheck clean** at HEAD.
  Establish this yourself before trusting a regression signal.
- Gate commands (discover from `package.json`, don't hardcode a package manager):
  `bun run test`, `bun run lint`, `bun run typecheck`.
- There is a `git stash@{0}` holding an ATTEMPTED fix for TASK-498's stale-lock
  work ("QM in-flight PR-003 stale-lock ownership work"). It is RED — see below.

## Read first

Each task file carries a triage note with file:line evidence written 2026-07-24:
- `missions/tasks/TASK-498 - Review fix — make entity-lock ownership and release failure-safe.md`
- `missions/tasks/TASK-500 - Review fix — bound detached and thrown terminal lock liveness.md`
- `missions/tasks/TASK-501 - Review fix — validate fallback completion authority.md`

Evidence of record (the reviews that raised these):
- `missions/plans/episodic-log-detached-hardening/qm-security-review.md` — SR-002, SR-003, SR-004
- `missions/plans/episodic-log-detached-hardening/qm-performance-review.md` — PR-001..PR-005
- `missions/plans/episodic-log-detached-hardening/codex-review-round-3.md` — the HIGH/MEDIUM/LOW that re-confirmed these

`plan.md`'s Decision Log (D-001..D-010) and Design §7 are the authority on what is
ratified and must NOT be "fixed". In particular read D-008 (fail-soft transition
lock) before touching lock code.

## The three tasks

### TASK-498 — entity-lock ownership + release failure-safe  (start here; the others lean on it)

Two defects in `lib/entity-file-lock.ts`, both inherited verbatim from
`lib/tasks/lock.ts` on `main` (that is why they are "pre-existing"):

1. **Stale reclamation unlinks by pathname, not by owner.** `breakStaleLock`
   unlinks the lock after an `isProcessAlive` check without confirming the file
   still holds the PID/UUID that was inspected. Two contenders can both classify
   one dead owner as stale; A removes it and acquires; B then removes A's LIVE
   replacement and acquires too → both enter the "serialized" critical section.
2. **Release failure strands a live-owner lock.** If the primary update persists
   but `unlink` fails, `withEntityFileLock` rejects with the lock still on disk
   (live PID), `withEpisodeTransitionLock` returns the persisted result and
   DISCARDS the handle (no retry), then the manager runs episode capture while
   the lock is still held. Later same-entity writers wait for the live owner,
   time out, and run unlocked — AC-006 serialization is lost until the process
   exits.

Fix direction (from the task's own ACs):
- Bind stale removal to the exact inspected owner (link-into-a-removal-name then
  compare PID/UUID, or equivalent) so a replacement owner is never unlinked.
- Give a failed owned-release a bounded retry/recovery path; if release cannot be
  confirmed, preserve the successful primary update but SKIP transition capture
  and warn truthfully.
- Keep acquisition error/timeout FAIL-SOFT (D-008) and the action single-execution.

**Traps:**
- **Do NOT create a third lock protocol.** The repo must keep exactly TWO
  (`lib/driver/lock.ts`, `lib/entity-file-lock.ts`). Generalize/reuse; the plan's
  duplication gate counts implementations.
- **The stash is a starting point, not a drop-in.** Its link-based
  `removeLockIfOwner` ownership logic is sound, but it makes `release()` THROW on
  a benign concurrent-removal path, which broke callers and left the branch red.
  Fix that before adopting it. Inspect with `git stash show -p stash@{0}`; do not
  `git stash pop` onto unrelated edits.
- The mutation lands on the PRIMARY plan/task update path. A lock error must
  never fail or stall an update — degrade to unlocked-with-warning (D-008).
- Bound: because `updatePlan`/`updateTask` took NO lock on `main`, the worst case
  is `main`'s prior unserialized behavior, not below it. This is why it is a
  follow-up, not a blocker — keep the fix from making it worse.

### TASK-501 — validate fallback completion authority

`readRunCompletion` in `lib/driver/run-state.ts` blindly casts parsed JSON to
`DriverResult` and validates nothing. On `main` this was confined to detached
abort, but B-010 (shipped) newly routes the CLI inline-reject and driver-tool
fallback writers through `writeFallbackRunCompletion`, which PRESERVES any
existing `completedAt`-stamped record. So a syntactically valid record with a
DIFFERENT `runId` and a truthy `completedAt`, planted in the run workdir before a
fallback runs, is now preserved as authoritative where `main` would have
overwritten it (`cli/drive/subcommand.ts:586-590`,
`domains/shared/extensions/orchestration/driver-tool.ts:502-507`).

Fix: runtime-validate a completion record (shape + valid outcome + EXACT matching
`runId`, and only then honor a stamped `completedAt`) before it suppresses a
fallback. Invalid/mismatched content must not become authoritative and must not
throw across the fallback boundary (settle fail-soft). Do NOT widen the
MemoryStore / episode-serializer / config-loader schemas. Preserve valid current
bytes and D-001 completion ownership. Severity is LOW (threat model is a local,
gitignored, project-owned workdir where write access already implies code
execution as the user) — keep the fix small.

### TASK-500 — detached/thrown terminal lock liveness  (mostly verify, then narrow)

Three sub-items with DIFFERENT dispositions — read carefully before coding:
- **PR-001 (real, pre-existing):** `abortDetachedRun` sends one SIGTERM then
  `await waitForChildExit` with no deadline (`lib/driver/driver.ts`, identical on
  `main` at lines 210-211). A child that ignores SIGTERM hangs abort forever.
  Add a bounded wait + escalation (e.g. SIGKILL) without changing D-001 ordering
  or OFF behavior.
- **PR-002 (RATIFIED — do NOT "fix"):** thrown-terminal episode I/O running under
  the plan lock is by design. Design §1 keeps the thrown path on its `.finally`
  backstop and scopes the `onTerminalPersisted` hook to completion-backed
  terminals only (B-016/B-017). Changing it re-opens a ratified decision — if you
  believe it must change, STOP and revise the plan with the human, don't patch.
- **PR-004 (low):** the 2s drain deadline bounds when `finish()` STARTS but not
  the final full-log `readFile`. Latency-only, local file, bounded in practice.
  Make the deadline settle independently of an in-flight/final read if cheap;
  otherwise document and defer.

## Guardrails (all three)

- These primitives are used well beyond the episodic-log gate, so every change
  needs its own **OFF-state evidence** — prove default installs are byte- and
  behavior-identical. A release-semantics regression in `lib/driver/lock.ts` or
  `lib/entity-file-lock.ts` is far worse than the defects being fixed.
- Do NOT re-open anything the four review rounds ratified (D-001 ordering, D-002
  two-phase/exclusive claim, D-005, D-006 inherited, D-008 fail-soft, D-010 OFF
  narrowing, PR-002).
- Test-first, one behavior at a time; every new test must be verified RED against
  the unfixed code (use Edit-to-mutate then Edit-back — **never `git checkout --
  <file>` on uncommitted work**, it is destructive and cost me the round-3 fix
  once this session).
- Keep `missions/tasks/` edits committed separately if a driver is used — Drive
  excludes that directory from source commits.
- Suggested order: TASK-498 first (the release/ownership primitive underpins the
  MEDIUM the others reference), then TASK-501 (small, self-contained), then
  TASK-500 (mostly PR-001, since PR-002 is out and PR-004 is a nit).

## Do-not

- Do not push or open a PR (origin/main is 30 behind; the human controls publish).
- Do not create a third filesystem lock protocol.
- Do not adopt the stash verbatim (its `release()` throws).
- Do not "fix" PR-002 — it is ratified.
- Do not weaken any exactly-once or fail-soft invariant to make a race go away.
