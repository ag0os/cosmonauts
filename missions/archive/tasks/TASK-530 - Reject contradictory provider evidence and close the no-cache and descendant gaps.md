---
id: TASK-530
title: >-
  Reject contradictory provider evidence and close the no-cache and descendant
  gaps
status: Done
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies: []
createdAt: '2026-07-29T22:38:55.820Z'
updatedAt: '2026-07-29T22:51:41.496Z'
---

## Description

Remediation for independent codex review findings 1, 4, and 5 on
`feature/analysis-capability-runtime`. Finding 1 was independently confirmed
before this task was written, and it is the same defect the QM raised as
F-005, so two reviewers reached it separately.

Finding 1 (High, INV-3). `findingsOutcome` derives
`verdict: findings.length === 0 ? "pass" : "fail"`, and capability execution
accepts both exit 0 and exit 1 as completed. Under this provider's own
contract exit 1 means findings exist. So exit 1 plus a schema-valid
zero-finding or `pass` envelope is contradictory evidence, and the runtime
resolves it silently to a clean pass. INV-3 is ratified: evidence that
cannot be reconciled is an error, never a guess. Do not "fix" this by
trusting one side — mismatch means failure.

Finding 4 (Medium). `D-012` reads "every analysis/introspection invocation
includes the provider's no-cache option; version detection uses a
non-writing version call", and `B-012`'s Expected clause states it without
exception, but the version probe passes only `["--version"]` and the test
filters those invocations out. The reviewer probed the pinned engine and
confirmed it accepts `--version --no-cache`, so make the code match the
recorded contract rather than narrowing the contract.

Finding 5 (Medium). Process-group cleanup runs only through
`beginTermination` on abort and timeout; normal code exits and signal exits
settle immediately without checking the detached group, so a descendant can
outlive its parent.

Ratified ground: INV-3 and INV-5 outrank coverage and convenience. AC-005
and AC-008 are spec criteria.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail).
Record the commit HEAD at task start as the changed-scope base.

<!-- AC:BEGIN -->
- [x] #1 Contradictory provider evidence is an `AnalysisFailure`, never a completed result: a verdict-bearing capability that exits 1 (the provider asserting findings exist) while its schema-valid payload carries zero findings or `verdict: "pass"` is classified as invalid output, and the reverse mismatch (exit 0 with findings or an asserted fail) is classified the same way.
- [x] #2 The changed-scope audit no longer trusts a payload's asserted `verdict` without checking it against the exit evidence.
- [x] #3 A named test covers the contradictory-but-structurally-valid case for a verdict-bearing capability; `B-008`'s exit-1-with-real-findings case and `B-009`'s unclassifiable cases both still pass unchanged.
- [x] #4 Version introspection passes the provider's no-cache option like every other invocation, so `B-012`'s Expected clause ("all analysis/introspection calls disable caches") is literally true, and `B-012` no longer filters version invocations out of its assertion. The pinned engine accepts `--version --no-cache`, so no capability is lost.
- [x] #5 Provider descendants are reaped on every settle path, not only abort and timeout: a provider that exits normally or dies by signal after leaving a descendant does not orphan it. A named test covers a natural-exit orphan, alongside the existing abort and timeout descendant tests.
- [x] #6 `cosmonauts plan check-artifacts analysis-capability-runtime` reports zero issues with `Withdrawn: 1`, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
