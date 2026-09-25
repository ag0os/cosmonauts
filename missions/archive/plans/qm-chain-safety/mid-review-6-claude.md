---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: round-5 remediation 0f71cb5..(TASK-737 d6dd6c7) + resolution of mid-review-5
date: 2026-09-24
---

# Mid-branch review 6 — Claude reviewer (coordinator condensation of the final report)

**Verdict: DO-NOT-SHIP-YET.** Three affected test files pass (83 tests). Probes are in the coordinator scratchpad: `panel-probe.ts`, `tamper-probe.ts`, `pi-probe/` and `pi-probe2/`.

## Resolution

- **H-1:** PARTIAL. The QM runtime is base-owned, but panel spawns are not (HIGH-1), and the base export can be tampered with (HIGH-2).
- **codex `package.json` HIGH:** RESOLVED for this repository, PARTIAL in general (LOW-2).
- **External store root:** RESOLVED.
- **Materials writable:** RESOLVED, with residual LOW-3.
- **L-1 and L-2:** RESOLVED.
- **L-3:** mostly RESOLVED. `controller.ts` now uses the generic kind `artifact-disposition`.
- **L-4** (no in-progress `artifact_written`): OPEN, but accepted by the D-025 amendment.
- **Earlier PARTIALs:** unchanged.

## New findings

- **HIGH-1: panel reviewers still come from the reviewed clone.**
  - The QM's `spawn_agent` calls `getRuntime(ctx.cwd)` (`spawn-tool.ts:488`), and `ctx.cwd` is the clone. `getRuntime` runs `CosmonautsRuntime.create({projectRoot: clone})` (`orchestration/index.ts:39-47`).
  - The probe went through the real orchestration extension with a QM identity. A clone domain and an overriding `security-reviewer` were both imported, and both markers were PRESENT.
  - The AC #1 test bypasses the launcher, so reverting `launch.ts:260` fails no test.
- **HIGH-2: checks can tamper with the clone's object database before `materializeBaseReviewProject` clones the base from it.**
  - Git does not verify blob hashes on checkout. Probe on git 2.53.0: an overwritten loose blob, even after unpacking a pack, changed the checked-out file.
  - The end-to-end probe resolved `security-reviewer` to CHANGE-CHOSEN, and the host import marker was PRESENT.
  - The same tampering affects the base `AGENTS.md` and config, and the `git show base:` reads that run after checks.
  - Fix: export the base from the operator's source repository, or before any reviewed code runs.
- **HIGH-3: the clone's `.pi/` project settings reach every quality session** (this predates round 5).
  - `session-factory.ts:153` builds `DefaultResourceLoader({cwd: clone})` with no `settingsManager`, so Pi trusts the project settings.
  - A `.pi/settings.json` with `npmCommand: ["sh","-c",…]` and `packages` executed a change-chosen shell command during `reload()`, even with `noExtensions`.
  - A `.pi/APPEND_SYSTEM.md` is appended to the QM and panel system prompts.
  - Fix: use an untrusted in-memory `SettingsManager` and set `appendSystemPrompt: []`.
- **LOW-1:** `package.json` can appear twice as a human item.
- **LOW-2:** the script detector misses `bun <script>` shorthand, pre/post scripts and install lifecycle scripts.
- **LOW-3:** the materials digest is verified only once, before the QM starts, and a detached grandchild can still edit the materials afterwards.

No conflict with AC-015, AC-016 or AC-018.
