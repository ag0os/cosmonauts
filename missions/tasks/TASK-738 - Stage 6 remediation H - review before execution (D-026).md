---
id: TASK-738
title: Stage 6 remediation H - review before execution (D-026)
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-737
createdAt: '2026-09-24T08:06:01.902Z'
updatedAt: '2026-09-24T08:06:01.902Z'
---

## Description

Implement plan D-026, amend-on-record 2026-09-24 (read it in full in `missions/plans/qm-chain-safety/plan.md`). It remediates the verified round-6 findings in `mid-review-6-codex.md` (HIGH 1–2, MEDIUM 3, LOW 4) and `mid-review-6-claude.md` (HIGH-1..3, LOW-1..3).

The class being closed: code the reviewed change executes, or files it controls, must not choose what the host imports, which definitions or prompts review it, or the evidence the QM reads. Reorder the run so that no reviewed code executes before the review evidence is sealed. Build every quality runtime, including panel spawns, from a base export taken from the operator's source repository.

Binding ratified ground is INV-001..INV-005 and D-018..D-023. N-004 is pending the human, so do not sandbox steps 7–8. Timed-out panel children are never cancelled (D-011; execution-liveness AC-015). Add no leases or owner protocol. Keep D-025's guarantees, re-proving any test the reorder touches.

Every test must fail on the current code and drive the real launcher or spawn path. A test that calls a helper directly does not count.

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. If you change `.cosmonauts/config.json`, update `configDigest` in `missions/reviews/knowledge-surface-backfill-amendment-3.md` as your last step (authorized).


<!-- AC:BEGIN -->
- [ ] #1 Run order per D-026: snapshot, base export from the operator source repository (read-only plumbing, `GIT_OPTIONAL_LOCKS=0`), base-owned runtime, materials and digests, QM assessment and panel, seal and verify all digests, then prepare and checks, then host-merged Checks section, then finalize; a failing or not-run check forces `not-ready`; tested through `launchQualityReview` with a check that records when it ran relative to the QM session and panel completions.
- [ ] #2 Panel spawns resolve from the base-owned runtime (Claude HIGH-1): a quality parent's `spawn_agent` never calls `getRuntime(clone)`; the quality context carries the base runtime; tested through the real orchestration extension with a clone containing `.cosmonauts/domains/evil/domain.ts` (import marker absent) and an overriding `coding/security-reviewer` (base definition used).
- [ ] #3 The base export cannot be tampered with by the change (Claude HIGH-2, codex HIGH-1): it and every `git show base:` read deciding gate-owned items come from the operator source repository, before any reviewed code runs; tested with a check that overwrites a base blob in the clone object database and a detached process that rewrites the export and materials after checks, asserting neither affects imports, definitions or the verdict.
- [ ] #4 Quality sessions ignore project Pi settings (Claude HIGH-3): the QM and panel sessions use an untrusted in-memory `SettingsManager` and no project `APPEND_SYSTEM.md`; project context files come from the base export; tested with a clone `.pi/settings.json` whose `npmCommand` writes a marker (absent) and a clone `.pi/APPEND_SYSTEM.md` (absent from system prompts).
- [ ] #5 Effective check configuration is gate-owned (codex HIGH-2, Claude LOW-2): when any configured command runs through a package manager, any change to `package.json` `scripts` (including shorthand, pre/post and install lifecycle scripts) is a gate-owned item; this repository base-owned `gateOwnedPaths` adds `tsconfig.json`, `biome.json`, `tests/setup.ts`, `fallow.toml`; each gate-owned path appears once in human items (Claude LOW-1); tested with a `biome.json` rule removal and a `pretest` script addition.
- [ ] #6 Base export and runtime creation honour cancellation and the assessment deadline (codex MEDIUM-3); tested with a slow export and an abort.
- [ ] #7 Analysis without executing reviewed code: live-probe whether `analysis_audit` in a clone without installed dependencies gives the same verdict and envelope as with them for this repository; if not, add the D-026 base-owned `qualityReview.analysisPrepare` (lifecycle scripts disabled) and configure it here; record the probe result in the task notes.
<!-- AC:END -->
