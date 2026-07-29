---
id: TASK-532
title: >-
  Reconcile exit evidence against complete provider output, not the
  metric-filtered subset
status: Done
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies: []
createdAt: '2026-07-29T23:16:35.925Z'
updatedAt: '2026-07-29T23:27:57.625Z'
---

## Description

Remediation for independent codex review round 2. Round 1 closed four of six
findings; these three remain, and the first is a regression introduced by the
round-1 remediation itself.

Finding 1 (High, regression — independently confirmed). `reconcileVerdictEvidence`
derives `findingsVerdict` from `normalized.findings`, but for complexity those
findings have already been filtered to the requested metric by TASK-527. The
provider's exit code describes the complete, unfiltered envelope. So a provider
that finds only CRAP violations exits 1 correctly, a `cyclomatic` request
filters to zero findings, `findingsVerdict` becomes "pass", and the exit/verdict
comparison throws `invalid-output`. A valid and expected scenario is reported as
a provider failure, defeating ratified AC-007's promise that a consumer can
degrade just the requested check.

Two different questions were collapsed into one comparison. Keep them separate:
reconcile the provider's internal consistency against its complete evidence,
and derive the generic verdict from the filtered subset.

Note the test at `tests/extensions/project-tools-fallow.test.ts` now asserts
`rejects … failureClass: "invalid-output"` for this case. That assertion is
wrong, not authoritative. Per the deviation protocol, a test changed to make a
fix go green is drift; correct the assertion together with the behavior and say
so in the implementation notes.

Finding 2 (High). Consent is now the last precondition inside
`validateSpawnPreconditions`, which was the round-1 fix, but the runner then
awaits temporary spool creation before the OS spawn. Revocation during that
yield still permits execution. Move runner preparation ahead of a final
pre-spawn consent check. A TOCTOU window cannot reach zero — the goal is that
no awaited work remains after the last check, so state the guarantee as minimal
rather than closed.

Finding 3 (Medium). `D-026` commits to reporting resolution provenance, but the
unbound and failed discovery variants drop the resolution kind, so provenance
vanishes exactly while consent is withheld — the state where knowing what would
execute matters most. Carry it through every resolved state.

Ratified ground: INV-3, INV-5, AC-005, AC-007, and D-014. `D-025` and `D-026`
are recorded ground; do not reintroduce sandboxing and do not replace
disclosure with unsound wrapper detection.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail).
Record the commit HEAD at task start as the changed-scope base.

<!-- AC:BEGIN -->
- [x] #1 Exit-code reconciliation compares the provider's exit against the provider's **complete** normalized evidence, while the generic result's verdict is derived from the metric-filtered subset. A complexity request for one metric whose violations all belong to other metrics returns a completed result with `verdict: "pass"` and zero findings — never `invalid-output`.
- [x] #2 The test that currently asserts `invalid-output` for an exit-1 complexity envelope containing only other-metric violations is corrected to assert the completed pass result. That test encodes the defect; changing the code to match it would be drift, so the assertion changes with the behavior it proves.
- [x] #3 The four genuine contradiction directions still fail as `invalid-output`: exit 1 with zero findings in the complete evidence, exit 1 with an asserted `pass`, exit 0 with findings in the complete evidence, and exit 0 with an asserted `fail`. No legitimate case is reclassified as a failure and no contradiction is reclassified as clean.
- [x] #4 `AC-007`'s promise holds end to end: a consumer asking for one metric can distinguish "no violations of my metric" from "the provider failed", and the complete unfiltered payload remains preserved in the native envelope.
- [x] #5 Consent is re-read immediately before the OS spawn, after all runner preparation (temporary spool creation and any other awaited setup) has completed, so no awaited work sits between the final consent check and the spawn. A named test revokes consent during runner preparation, in addition to the existing revoke-during-identity-capture case.
- [x] #6 Resolution provenance is surfaced in every resolved state, not only when a detected runtime exists: the consent-withheld and introspection-failed states retain and report the resolution kind, so provenance is visible precisely when execution is being withheld (`D-026`).
- [x] #7 `cosmonauts plan check-artifacts analysis-capability-runtime` reports zero issues with `Withdrawn: 1`, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
