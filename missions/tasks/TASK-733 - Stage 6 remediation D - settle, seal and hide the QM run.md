---
id: TASK-733
title: 'Stage 6 remediation D - settle, seal and hide the QM run'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-729
  - TASK-730
  - TASK-731
createdAt: '2026-09-24T06:37:27.798Z'
updatedAt: '2026-09-24T06:53:04.790Z'
---

## Description

Remediate the verified round-2 findings from `missions/plans/qm-chain-safety/mid-review-2-codex.md` (codex N1–N3) and `mid-review-2-claude.md` (Claude M1, M2, L1–L4, L6). This work is governed by D-025, D-004, D-006, D-011, D-012 and D-013. Binding ratified ground is INV-001..INV-005 and D-018..D-023. Timed-out panel children are never cancelled (D-011; execution-liveness AC-015). Add no leases, owner identity or owner-death protocol (D-013, R-008).

Tests must be able to fail. Each AC names a scenario whose test would fail on the current code.

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. If you change `.cosmonauts/config.json`, update `configDigest` in `missions/reviews/knowledge-surface-backfill-amendment-3.md` as your last step (authorized).

<!-- AC:BEGIN -->
- [x] #1 Deadline/cancel settlement (codex N1): after the assessment deadline or caller cancellation, the host waits a bounded grace for the QM session to settle; if it does not, the QM session counts as live work, so the workspace is `retained` and named in the report, never removed while the session may still use it; tested with a QM session that ignores abort and has no panel child.
- [x] #2 A missing host-observed gate state blocks `ready` (codex N2, Claude L1): an assessment that returns no `gateState` (including via the injected `execute` port) is recorded as `not observed`, adds a human-decision item and forces `not-ready`; tested with an injected execute returning a well-formed `ready` report and no gate state.
- [x] #3 Reviewer evidence is sealed before finalization (codex N3, Claude L2): the run itself closes the evidence window before it writes the terminal report, independently of the launcher returning; a panel completion arriving after the window closes writes no reviewer artifact and emits no `artifact_written`, and the child is not cancelled; the test drives a real completion through the spawn-tool completion path (not the sink directly) and asserts on artifacts and events.
- [x] #4 No quality session system prompt names the source root (Claude M1, D-025): skill locations under the source real path are remapped to the same relative path inside the private clone (or omitted when absent there) for the QM and every panel reviewer; a test assembles a panel reviewer session for a project whose skills live under the source root and asserts the full system prompt contains neither the source real path nor `hostRunStoreRoot`.
- [x] #5 Host-run prepare and check processes cannot outlive the host (Claude M2): process groups started by the QM host are killed when the run is cancelled, on host SIGINT/SIGTERM, and on host exit; the CLI wires SIGINT to the run abort signal; tested with a real process group and a simulated host signal.
- [x] #6 Lifecycle is well-formed (Claude L3): exactly one terminal phase (`finalized` or `retained`) is appended, the recorded `final.md` digest matches the final bytes after any retention annotation, and successful workspace removal records disposition `removed`; tested for removal success and failure.
- [x] #7 Gate reporting (Claude L1): a bound, completed audit with a failing verdict is reported under Gates (and as a finding when it names introduced debt), forcing `not-ready`, not as a human decision; unbound, unconsented or unobserved states remain human-decision items; human-item text is not duplicated; tested.
- [x] #8 Host lens triage uses code-surface signals (Claude L4): documentation-only and comment-only prose does not add specialists; a docs-only diff requires only `reviewer`; the TASK-731 CLI-help, dependency and QM-added-lens tests still pass.
- [x] #9 Analysis tool results are captured into spawn events only for quality sessions (Claude L6); ordinary spawns emit the same events as before this plan; tested.
<!-- AC:END -->
