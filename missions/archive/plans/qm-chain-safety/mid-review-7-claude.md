---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: fd06763..7c35910 + resolution of mid-review-6, under the D-027 threat model
date: 2026-09-24
---

# Mid-branch review 7 — Claude reviewer (coordinator condensation of the final report)

**Verdict: DO-NOT-SHIP-YET, but close.** Every round-6 finding is RESOLVED, accepted with a record, or RESIDUAL (hostile-only). The reviewer ran 92/92 tests and three probes (`scratchpad/mid7/`).

Resolution highlights:
- RESOLVED: codex H-1 (global packages), panel from clone (HIGH-1), object-database tampering (HIGH-2, moot), `.pi` settings (HIGH-3), `package.json` scripts (the whole `scripts` object is compared), duplicate items, unlisted check config (covered for this repo), and the untested launcher `projectRoot` (now tested).
- RESIDUAL under D-027: a detached grandchild, and late materials edits.
- PARTIAL but accepted: L4 model (Stage 7), the L5 `execute` port (fails closed), NEW-L2 (retained clone), NEW-L4 (omitted skills).

New findings:
- **MEDIUM-1:** a cancellation or deadline during base-runtime setup always retains a full copy of the repository in `$TMPDIR`.
  - `quality-review-run.ts:320-324` marks the setup live with no settle grace, unlike the assessment path.
  - Probed with an abort and with a 30 ms deadline: in both cases the workspace was retained and "Live work" was falsely reported.
- **MEDIUM-2:** an `analysisPrepare` failure fails the whole run with no review.
  - The trigger can be accidental: a stale `bun.lock` makes `--frozen-lockfile` exit 1.
  - Probed: `assessed:false`, `Verdict: failed`, and the gate-owned items were missing.
  - A `prepare` failure, by contrast, still yields an assessment and `not-ready`.
  - This breaks AC-016 and D-026's "the report records it".
- **MEDIUM-3:** no report path states the D-028 disclosure (host-run checks execute the reviewed code with the operator's authority, unsandboxed). Ratified ground requires it, and no task owns it.
- **LOW-1:** no test pins `includeUserSources:false` at `launch.ts:318`. That is an accidental route: an N-003-style stray package would shadow the QM again.
- **LOW-2:** the one behavior change in the TASK-740..742 refactor. `scripts/check-new-suppressions.ts` now rejects an array `equivalents` and array-shaped registries. It is stricter, and no committed registry is affected. Report text, event order and exit codes are otherwise unchanged; the new tests pass against the old code (60/60).

Hostile-only residuals (unranked):
- escaping the process group and rewriting after the seal;
- a reviewed `bunfig.toml` or `.npmrc` redirecting the `analysisPrepare` registry;
- clone object-database tampering (moot);
- writes by checks outside the clone (D-028).

No conflict with execution-liveness AC-015, AC-016 or AC-018.
