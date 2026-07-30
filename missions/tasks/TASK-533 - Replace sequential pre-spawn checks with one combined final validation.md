---
id: TASK-533
title: Replace sequential pre-spawn checks with one combined final validation
status: Done
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies: []
createdAt: '2026-07-30T14:36:52.796Z'
updatedAt: '2026-07-30T14:48:03.548Z'
---

## Description

Remediation for independent codex review round 3, decided by the human on
2026-07-30 after three review rounds.

Finding 1 (High) is not a new bug — it is the same constraint surfacing from
the other side, and this task exists to stop the cycle.

`captureExecutableIdentity` and `readAnalysisExecutionAuthorization` are two
sequential awaits, and the runner spawns by pathname. Whichever check runs
last, the other's window reopens:

  round 1 remediation -> identity last, consent stale -> consent TOCTOU filed
  round 3 remediation -> consent last, identity stale -> identity race filed

Two independent asynchronous preconditions plus a path-based spawn cannot
both be "last". Swapping them a third time moves the window again and
reproduces a finding already filed. Change the shape instead: prepare
everything first, then validate consent and identity together as the final
act before spawning, and spawn something that cannot be swapped underneath
you if the platform offers it.

Node has no `fexecve`, so a fully atomic path-to-exec guarantee may not be
reachable. That is an acceptable outcome — an honest, documented residual
window is worth more than a fourth reordering. What is not acceptable is
describing the remainder as closed.

Finding 2 (Medium). Discovery stores provenance independently of the runtime
and `analysis_status` reports it, but `before_agent_start` reads
`snapshot.runtime?.executableResolution`, and withheld and failed snapshots
have no runtime — so the agent-visible block omits provenance exactly when
execution is being withheld. `D-026` commits to reporting it in every
resolved state.

Ratified ground: INV-3, INV-5, D-014, D-025, and D-026. Do not reintroduce
sandboxing and do not substitute unsound wrapper detection for disclosure.
Both prior rounds' closed findings must stay closed — in particular exit
reconciliation against complete evidence with the verdict from the
metric-filtered subset, natural-exit descendant cleanup, and the corrected
complexity assertion. If a fix here would require weakening an existing
test's assertion, stop and escalate instead.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail).
Record the commit HEAD at task start as the changed-scope base.

<!-- AC:BEGIN -->
- [x] #1 Consent and executable identity are validated together in a single final precondition step immediately before the spawn, rather than as two sequential awaits where whichever runs last leaves the other stale. Reordering the two existing checks is explicitly not an acceptable implementation.
- [x] #2 All runner preparation (temporary spool creation and any other awaited setup) completes **before** that final combined check, so no awaited work remains between the check and the spawn call.
- [x] #3 The spawn cannot execute a different file than the one validated, to the extent the platform allows: prefer spawning from a handle or descriptor opened during validation over re-resolving a pathname. If no portable primitive exists, spawn the validated absolute path and record precisely what remains unguaranteed — do not claim a guarantee the code does not provide.
- [x] #4 A dated decision entry in the plan's Decision Log states the residual window honestly: what is now atomic, what is not, and why no portable primitive closes the remainder. It names the constraint — two independent async preconditions plus a path-based spawn cannot both be last — so a future reader does not "fix" it by reordering again.
- [x] #5 Named tests cover revocation during runner preparation and executable replacement during the consent read. Both must fail closed. The existing revoke-before-the-call and replace-before-the-call tests still pass.
- [x] #6 `before_agent_start` reports resolution provenance for every resolved state, including consent-withheld and introspection-failed snapshots that have no runtime — not only via `analysis_status`. `B-035` asserts provenance appears in the injected block so the gap cannot silently reopen.
- [x] #7 `cosmonauts plan check-artifacts analysis-capability-runtime` reports zero issues with `Withdrawn: 1`, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
