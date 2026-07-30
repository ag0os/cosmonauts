---
id: TASK-531
title: >-
  Narrow the consent window, surface resolution provenance, and strengthen the
  B-011 proof
status: Done
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies: []
createdAt: '2026-07-29T22:38:55.831Z'
updatedAt: '2026-07-29T23:00:55.150Z'
---

## Description

Remediation for independent codex review findings 2, 3, and 6 on
`feature/analysis-capability-runtime`.

Finding 3 (High, D-014 TOCTOU). `validateSpawnPreconditions` reads consent
first, then reads and hashes the executable — a potentially slow operation —
and the spawn afterwards does not recheck. Revoking consent during the hash
still permits the subprocess. A TOCTOU window cannot be eliminated entirely,
but ordering consent last shrinks it to the irreducible minimum. Do not
claim it is closed; claim it is minimal, and say so in the test name.

Finding 2 (High as filed, reclassified here). The automatic package path
correctly targets `@fallow-cli/<platform>`, which was the confirmed INV-3
fix. The reviewer is right that an explicitly configured path or the injected
test seam still accepts any executable file, including a wrapper that
converts its child's signal death into exit 0 — the original defect. But
rejecting wrappers is not implementable: a wrapper is not reliably
detectable, and the injected seam must accept arbitrary executables or the
real-engine tests cannot run at all. The honest response is therefore
provenance and disclosure, not detection: make the resolution kind visible
in status and state the guarantee's boundary in the Decision Log. If you
find a sound way to actually verify a native executable, propose it as a
decision entry rather than implementing it silently.

Finding 6 (Medium). `B-011`'s Expected clause says the unsupported-metric
outcome is produced "without provider invocation", but the test only checks
that the resolver's return value has no `execute` property. Prove the
negative with a spy.

Ratified ground: INV-1 (no concrete tool names in generic surfaces — the
status block is runtime-generated so it may name the resolved provider, but
must not carry commands), INV-3, and D-014. AC-003, AC-005, and AC-007 are
spec criteria.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail).
Record the commit HEAD at task start as the changed-scope base.

<!-- AC:BEGIN -->
- [x] #1 Consent is the last precondition checked before a provider spawn: the executable-identity read no longer sits between the consent check and the spawn, so the revocation window is reduced to the unavoidable gap between the final check and the spawn call itself.
- [x] #2 A named test covers revocation occurring after preconditions begin but before the spawn, in addition to the existing revoke-before-the-call case.
- [x] #3 `analysis_status` distinguishes how the executable was resolved, so a binding backed by an explicitly configured path or an injected seam is visibly not the package-native platform binary the runtime selects automatically. No concrete tool name or command appears in the status text, preserving INV-1.
- [x] #4 The runtime's INV-3 guarantee is documented honestly: the automatic resolution path targets the platform-native binary and cannot interpose a signal-swallowing wrapper, while an operator-supplied executable path is operator-declared trust that the runtime cannot introspect. This is recorded as a dated decision entry in the plan's Decision Log, not as a silent code comment.
- [x] #5 `B-011`'s named test proves its Expected clause "without provider invocation": it supplies a provider executor test double and asserts it was never called, rather than only asserting the returned object lacks an `execute` property.
- [x] #6 `cosmonauts plan check-artifacts analysis-capability-runtime` reports zero issues with `Withdrawn: 1`, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->

## Implementation Notes

Changed-scope base at task start: 65bfe451f4eea1570eef398df9eb5e8018af29d3
