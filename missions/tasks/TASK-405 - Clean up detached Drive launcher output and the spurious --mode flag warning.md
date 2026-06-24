---
id: TASK-405
title: Clean up detached Drive launcher output and the spurious --mode flag warning
status: To Do
priority: medium
labels:
  - orchestration
  - drive
  - cli
  - ux
  - 'plan:orchestration-hardening'
dependencies: []
createdAt: '2026-06-24T17:30:31.318Z'
updatedAt: '2026-06-24T17:31:45.000Z'
---

## Description

PROBLEM (observed): launching `cosmonauts run drive --mode detached ...`
(1) printed a spurious warning `[cosmonauts] Flag --mode is not supported by
cosmonauts (Pi flag mode is disabled)` even though `--mode` IS a defined option
on the drive command — confusing noise from a flag-passthrough layer; and
(2) the detached LAUNCHER process exiting was indistinguishable from the actual
RUN finishing, so it was easy to believe the run was done when only the launcher
had returned.

WHERE:
- `cli/main.ts` and `cli/drive/subcommand.ts` — flag parsing/passthrough.
- `lib/driver/driver.ts` — `startDetached` (the detached launch path).

WHAT TO DO:
(1) Stop the false `--mode` "not supported" warning for the drive command; the
option is defined on the command and the Pi global-flag layer should not warn
about it. (2) On a detached launch, print one clear stdout line with the runId
and the poll command, e.g. `Drive run started: <runId> — poll with: cosmonauts
run status <runId>`. Make help/docs state explicitly that the launcher returning
is NOT the run completing.

CONSTRAINTS: do not change inline-mode output. Additive. Never leave the build
broken between commits.

<!-- AC:BEGIN -->
- [ ] #1 `cosmonauts run drive --mode detached ...` no longer emits the false `--mode is not supported` warning.
- [ ] #2 A detached launch prints the runId and the poll command on one clear stdout line.
- [ ] #3 Help/docs state that the launcher returning is not the run completing.
- [ ] #4 typecheck, lint, and the full test suite pass.
<!-- AC:END -->
