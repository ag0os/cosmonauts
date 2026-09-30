---
id: TASK-811
title: 'Claude review 1 remediation: four correctness and liveness findings'
status: To Do
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-810
createdAt: '2026-09-30T01:38:29.291Z'
updatedAt: '2026-09-30T01:38:29.291Z'
---

## Description

Remediation slice for plan driver-hardening after the independent Claude re-review round 1 (report copied to `missions/reviews/claude/driver-hardening-round-1.md`; VERDICT HOLD, 0 P1, 4 P2, 3 P3). Implemented by a Claude subagent worker in this worktree instead of Drive because Drive workers are Codex-bound and Codex is out of usage until 2026-10-05 (plan D-038, derived). Governed by D-001, D-004, D-006, D-018, D-019, D-020, D-025, D-030, D-034..D-038 and INV-001..006. Files: `lib/tasks/task-parser.ts`, `lib/tasks/task-note-editor.ts`, `lib/driver/runtime-helpers.ts`, `lib/agents/drive-worker-tool-guard.ts`, `bundled/coding/extensions/execution-probe/index.ts`, `bundled/coding/extensions/execution-probe/command-runner.ts`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes appended, never replaced; do not change suppressions/thresholds/baselines/ignores/config; no `lib/durable-runtime/` change; no `domains/shared/extensions/` change (D-025/D-037); no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [ ] #1 P1 (review F1, P2, B-003, INV-001): extractRawContent in the task parser uses the same section-heading grammar as extractSection (the shared SECTION_HEADING: column-0 or one-to-three-space-indented '## '), so no text falls between a parsed section and the raw content. Test: a task whose description contains a list item with an indented '## Sub heading' line followed by KEEP-ME and a trailing paragraph KEEP-TOO survives updateTask({status: 'In Progress'}) byte-for-byte in both fields; red on the current code (both lines dropped).
- [ ] #2 P2 (review F2, P2, AC-004, INV-001/INV-002): the Drive attempt record embeds raw worker text (unknown-path raw, blocked notes/raw, failure text) inside a fence longer than any backtick run in the body (or an equivalent inert form) so headings in it cannot open or close sections; and preserveTaskNotes always terminates a composed notes section with a line ending plus a blank line when another section follows. Tests: raw text containing '## Implementation Notes' appends without throwing and the task's notes contain it verbatim; raw text containing '## Summary' followed by a second append leaves the notes section and the following heading intact; red on the current code (Duplicate Implementation Notes sections; glued heading).
- [ ] #3 P3 (review F3 new-code half, P2, B-008, D-037): runProbeCommand arms a bounded settle deadline once termination is initiated (timeout, abort, or overflow); when it fires it destroys the pipes and resolves with the initiated outcome, reporting termination-error when a descendant may still be alive (journal and marker kept); and runProbe waits on the probe lock with a bounded waitTimeoutMs and returns a clear failure when it expires. Test: a command whose child calls setsid and sleeps past the timeout settles within the bound with termination-error; a second probe call while the lock is held returns the lock failure within the bound; red on the current code (never settles). The shared provider runner's own setsid hang is pre-existing and out of scope (follow-up recorded).
- [ ] #4 P4 (review F4, P2, B-009, INV-006): the Bash guard classifies git checkout -f / --force (with or without a target, including through git -C <dir> and other global options) as destructive exactly like switch -f, on the guard and the probe test-command path. Test: git checkout -f, git checkout --force, git -C . checkout -f refused; git checkout -b topic and git checkout -- file behave as before; red on the current code.
- [ ] #5 D-030: implementation notes record, per finding P1..P4, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass with exit codes recorded; no .skip/.only/.todo; no lib/durable-runtime/ or domains/shared/extensions/ change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->
