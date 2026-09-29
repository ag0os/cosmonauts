---
id: TASK-810
title: 'Quality Manager run 1 remediation: execution-probe findings'
status: To Do
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-809
createdAt: '2026-09-29T23:22:19.911Z'
updatedAt: '2026-09-29T23:22:19.911Z'
---

## Description

Remediation slice for plan driver-hardening after Quality Manager run 1 (`missions/reviews/qm/driver-hardening-run-1/README.md`, coordinator dispositions; `final.md` is the QM report). Accepted findings UR-001, SR-002, SR-004, UR-002, UR-003. Governed by D-019 (lock + journal + always-restore; no supervisor, no process identity), D-025, D-030, AC-012 as amended by H-001, INV-001..006. Files: `bundled/coding/extensions/execution-probe/index.ts`, `bundled/coding/capabilities/execution-probe.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no `domains/shared/extensions/` change (D-025); no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [ ] #1 N1 (UR-001, B-008, AC-012/H-001): the probe records each instrumented path's index entry (git ls-files -s) before instrumenting and compares after the command; a changed entry (for example the command ran git add on the instrumented file) is reported in sideEffects, restored to the recorded entry, and makes usableZero false; the journal is still cleared only after worktree and index are restored. Test: a command that stages the instrumented file and exits 0 yields usableZero false with the path in sideEffects and leaves the index entry equal to the pre-probe entry; red on the current code (usableZero true, probe code staged).
- [ ] #2 N2 (SR-002, B-008): probe command stdout and stderr capture is bounded in aggregate bytes (a documented limit); on overflow the process tree is terminated, the result reports the overflow as the command status, and every instrumented file is restored. Test: a command that writes past the limit is stopped, files restored, usableZero false; red on the current code.
- [ ] #3 N3 (SR-004, B-008, AC-012): instrumented and restored file contents are written to a temporary file in the same directory and renamed into place, so an interrupted write never leaves a partial file at the target path; recovery verifies the sidecar digest and restores from it. Test: a simulated short write (fault-injected writeFile) leaves the original bytes at the path and the sidecar intact; red on the current code.
- [ ] #4 N4 (UR-002, docs): the execution-probe capability doc and the extension's termination-error message describe what a termination-error marker means (D-019: no process identity, so a possibly surviving test process), the manual verification the human performs (confirm no process of the test command is alive), and the recovery step (remove the marker and journal after the instrumented files are verified restored); no promise of automatic recovery remains.
- [ ] #5 N5 (UR-003, B-008): a failed or overflowed probe command result carries a bounded stdout tail next to the stderr tail. Test: a failing command whose runner prints the failure to stdout returns that text; red on the current code.
- [ ] #6 D-030: implementation notes record, per finding N1..N5, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass; no .skip/.only/.todo; no lib/durable-runtime/ or domains/shared/extensions/ change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->
