# Kickoff — implement three shared-primitive hardening fixes (TASK-498, 500, 501)

You are implementing three follow-up fixes in the cosmonauts repo. **Work in your
own way, with your own subagents — do NOT use the cosmonauts workflow tooling**
(no Drive, no chains, no `cosmonauts run …`, no spec/plan pipeline). The three
tickets are reference material; read them for substance, but you own the process.
Delegate to subagents as you see fit (e.g. one implementer per ticket, an
adversarial reviewer, a test-verifier), work test-first, and integrate on a
single branch.

## Ground state (verify before trusting)

- Repo: `/Users/cosmos/Projects/cosmonauts`. Branch `main` at `66cff09`, worktree
  clean except two untracked kickoff docs under `missions/` (ignore them).
- **Baseline is 2705 tests / 237 files green, lint + typecheck clean.** Establish
  this yourself first; it's your regression signal.
- Gates (discover from `package.json`; don't hardcode a package manager):
  `bun run test`, `bun run lint`, `bun run typecheck`. Run all three before
  declaring done.
- Start from a fresh branch off `main` (e.g. `git checkout -b fix/lock-and-completion-hardening`).
- **Do NOT push, merge to a remote, or open a PR.** `origin/main` is far behind
  and the human controls publishing. Stop at a clean, verified local branch.
- There is a `git stash@{0}` ("QM in-flight PR-003 stale-lock ownership work")
  holding a PARTIAL, RED attempt at TASK-498. Inspect it with
  `git stash show -p stash@{0}` — do NOT `git stash pop` onto your work.

## The three fixes

All three are **pre-existing weaknesses in shared primitives** (verified present
on `main`), surfaced by review of a just-merged plan but older than it. None is a
regression. All are gated behind low-severity, local-only threat models. The
authoritative per-ticket evidence (with file:line) is in the task files:

- `missions/tasks/TASK-498 - Review fix — make entity-lock ownership and release failure-safe.md`
  — **has a full design decision, "D-498-1", read it in full; it is your spec.**
- `missions/tasks/TASK-500 - Review fix — bound detached and thrown terminal lock liveness.md`
- `missions/tasks/TASK-501 - Review fix — validate fallback completion authority.md`

### TASK-498 — entity-lock ownership + release failure-safe (the meaty one; do it carefully)

Files: `lib/entity-file-lock.ts`, `lib/memory/episode-transition-lock.ts`, and the
managers `lib/plans/plan-manager.ts` / `lib/tasks/task-manager.ts`. The design is
already decided — follow **D-498-1** in the task file. In short:

1. **Stale reclamation (acquire-time) becomes owner-bound.** Replace
   `breakStaleLock(path)` with a removal that links the lock into a private name,
   re-reads through the link, and unlinks the original ONLY if the linked content
   still equals the exact owner that was inspected. Adopt the stash's
   `removeLockIfOwner` — **but** give the removal temp a UNIQUE per-attempt name
   (`pid + randomUUID`, like `tryCreateLock`'s temp), NOT the stash's fixed
   `.removing.lock` (a fixed name lets a crashed remover livelock every future
   reclaimer on `EEXIST`).
2. **Release stays simple and NON-throwing.** Keep the existing `release()` body
   (it is already retryable: `released` stays false if `unlink` fails). **Reject
   the stash's `createHandle` change** — its `throw new Error("release already in
   progress")` is the defect that reddened the branch; a throw out of `release()`
   can fail a primary update, violating D-008.
3. **Release-failure recovery is caller-side and fail-soft.** In
   `withEntityFileLock`'s `finally`, bounded-retry release (adopt the stash's
   `releaseWithRetry`). If release still can't be confirmed: the update already
   persisted, so RETURN it — never reject an update on a lock-release failure.
   Surface "release unconfirmed" to `withEpisodeTransitionLock` so the manager
   **skips** transition capture and warns truthfully, rather than capturing under
   a still-held lock.
4. **Accepted residual (don't over-build):** a *persistent* unlink failure strands
   a live-PID lock that pid-liveness recovery won't reclaim; later writers run
   unlocked. This is accepted — it degrades to `main`'s prior no-lock behavior,
   never worse. Do NOT add age/heartbeat reclamation of a live-PID lock.

   ⚠️ **One open question the human must answer before you code step 3's
   skip-capture branch:** dropping a transition episode on a rare unlink failure
   (vs. capturing under a held lock) is the conservative D-008 reading, but it
   means a real status change can go unrecorded. Confirm the trade with the human;
   if they're unavailable, implement skip-capture and flag it prominently.

### TASK-501 — validate completion-record authority (small, self-contained)

Files: `lib/driver/run-state.ts` (+ the fallback callers `cli/drive/subcommand.ts`,
`domains/shared/extensions/orchestration/driver-tool.ts`). `readRunCompletion`
blindly casts parsed JSON to `DriverResult` and validates nothing; a shipped
change (B-010) now PRESERVES an existing stamped completion on fallback paths
where `main` overwrote it, so a syntactically-valid record with a DIFFERENT
`runId` planted in the workdir is honored as authoritative. Fix: runtime-validate
shape + valid outcome + EXACT matching `runId` before a stamped completion may
suppress a fallback. Invalid/mismatched content must not become authoritative and
must not throw across the fallback boundary (settle fail-soft). Do NOT widen the
MemoryStore / episode-serializer / config-loader schemas. Preserve valid current
bytes. LOW severity — keep it small.

### TASK-500 — detached/thrown terminal lock liveness (mostly one small fix)

File: `lib/driver/driver.ts`. Three sub-items with DIFFERENT dispositions — read
before coding:
- **PR-001 (fix):** `abortDetachedRun` sends one SIGTERM then `await
  waitForChildExit` with no deadline (identical on `main` at ~lines 210-211). A
  child ignoring SIGTERM hangs abort forever. Add a bounded wait + escalation
  (e.g. SIGKILL), preserving D-001 ordering and OFF behavior.
- **PR-002 (DO NOT TOUCH — ratified):** thrown-terminal episode I/O running under
  the plan lock is by design (the thrown path keeps its `.finally` backstop; the
  hook is completion-backed only). Changing it re-opens a ratified decision — if
  you believe it must change, STOP and raise it with the human, don't patch.
- **PR-004 (optional nit):** the 2s drain deadline bounds when `finish()` starts,
  not the final full-log read. Latency-only, local file. Fix only if cheap;
  otherwise leave a note and move on.

## How to run it (your call, but a sane shape)

- One branch. Suggested order: **498 first** (the primitive the others reference),
  then **501** (small, isolated), then **500** (mostly PR-001). File overlap
  between the three is minimal, so parallel subagents on isolated worktrees are
  viable if you prefer — but integrate and run the FULL suite once at the end.
- Test-first, one behavior at a time. **Every new test must be verified RED
  against the unfixed code.** Do this by editing the source to the old behavior,
  running the test, then editing back — **NEVER `git checkout -- <file>` on
  uncommitted work; it is destructive and will silently delete your fix.**
- Consider an adversarial-reviewer subagent over your own diff before you call it
  done, specifically probing the concurrency reasoning in 498 (partial reads under
  `link`, divergent-owner races, temp-file leaks, fail-soft on non-EEXIST errors).

## Guardrails (hard)

- **Exactly TWO filesystem lock protocols** must remain: `lib/driver/lock.ts` and
  `lib/entity-file-lock.ts`. Do not author a third; `lib/tasks/lock.ts` stays a
  thin caller.
- **OFF-state evidence.** Entity locks are acquired only when episodic context is
  present AND the gate resolves enabled. Prove none of your changes alter default
  (gate-OFF) behavior — no lock, no removal temp, no release path entered — and
  that removal temps live flat in `.cosmonauts/` (matching the single-level
  `.cosmonauts/*.lock` ignore glob; never under `missions/`).
- **Fail-soft is load-bearing (D-008).** A lock error must never fail or stall a
  plan/task update — degrade to unlocked-with-warning.
- **Do not re-open ratified decisions.** PR-002 above; and don't touch the
  terminal ordering, two-phase/exclusive ledger claim, or OFF byte-identity that
  the merged plan established.
- Keep the fixes SMALL and matched to severity (all low). Do not gold-plate a
  shared primitive.

## What "done" looks like

All three fixes in, each with a test verified RED-then-green; full suite green
(≥2705, no regressions); lint + typecheck clean; the "exactly two lock protocols"
and OFF-state properties demonstrated; a short summary of what changed, what you
verified, the 498 skip-capture decision (and whether the human confirmed it), and
anything you deliberately left (e.g. PR-004). Stop on a clean local branch;
report; do not push.

Optional courtesy: mark the three task files done (edit their `status:` frontmatter
or via `cosmonauts task edit`) and note the resolution — but this is bookkeeping,
not part of the workflow you must follow.
