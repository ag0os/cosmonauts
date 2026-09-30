---
id: TASK-812
title: >-
  Claude review 2 remediation: structural notes boundary and guard option
  prefixes
status: To Do
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-811
createdAt: '2026-09-30T02:30:30.954Z'
updatedAt: '2026-09-30T02:30:30.954Z'
---

## Description

Remediation slice for plan driver-hardening after the independent Claude re-review round 2 (`missions/reviews/claude/driver-hardening-round-2.md`; VERDICT HOLD: R2-1 P2, R2-2..R2-4 P3). Implemented by a Claude subagent worker under D-038 (Codex out of usage until 2026-10-05). This is the THIRD round on notes-boundary heuristics (F1, F2/D-039, now R2-1/R2-2): Shepherd's instruction is to change the rule structurally, not to patch the re-scan. Governed by D-001, D-004, D-018, D-030, D-038, D-039 and INV-001..006, AC-004. Files: `lib/tasks/task-note-editor.ts`, `lib/tasks/task-serializer.ts`, `lib/tasks/task-manager.ts` (if the boundary is threaded from serialization), `lib/driver/runtime-helpers.ts`, `lib/agents/drive-worker-tool-guard.ts`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes appended, never replaced, and never containing a line that begins with '## ' (fence or indent quoted regex/expected strings); do not change suppressions/thresholds/baselines/ignores/config; no `lib/durable-runtime/` change; no `domains/shared/extensions/` change (D-025/D-037); no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [ ] #1 Q1 (R2-1, P2, INV-001, B-003): preserveTaskNotes no longer finds the canonical notes span by re-scanning the serialized text for the next recognized heading; the boundary is structural — either the serializer reports where it placed rawContent (the notes end exactly where the raw content begins, less the separator) and the editor splices only that span, or the notes section is always terminated with any open fence closed before anything follows, so no scan can run past it. Tests (each performs one updateTask({status: 'In Progress'}) through the real TaskManager and asserts the whole file byte-for-byte apart from the status/updatedAt change): (a) untitled preamble text before '## Description' plus plain notes — preamble survives (red since TASK-790 on this branch); (b) an unrecognized '## Context' section before the notes plus notes ending inside an unterminated fence (a worker task_edit append) — the Context section survives (red at HEAD); (c) same as (b) with a Drive attempt record whose body left a '~~~' fence open. The 781-file corpus round-trip (parse → updateTask → parse) must show no new differences versus HEAD.
- [ ] #2 Q2 (R2-2, P3, AC-004, INV-002): appending a Drive attempt record after worker notes that end inside an open fence records the body verbatim and never throws: notes ending in an open fence are closed (or the record's fence is sized against notes-plus-body and the open fence is terminated first) before the record is appended. Test: worker note 'see:' + an open ts fence, then appendDriveAttemptRecord with a body containing a bare fence line followed by '## Implementation Notes' — no throw, the blocked reason is in the notes verbatim, exactly one Implementation Notes section; red at HEAD (Duplicate Implementation Notes sections).
- [ ] #3 Q3 (R2-3, P3, INV-006, B-009): the Bash guard classifies unambiguous abbreviations of destructive long options as destructive using git's own rule (any prefix of at least two characters after '--' that uniquely identifies the option among that verb's options): git checkout --forc/--for/--fo, git switch --disc/--discard; ambiguous prefixes (git switch --forc, which git rejects) need not be refused. Tests for each listed form on the guard and the probe test-command path; red at HEAD.
- [ ] #4 Q4 (R2-4, P3, hygiene): the worker's own appended notes for this task contain no line beginning with '## ' (quoted regex or expected strings are fenced or indented), so the task file parses as one notes section; verified by parsing the task file after the final note.
- [ ] #5 D-030: implementation notes record, per finding Q1..Q3, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass with exit codes recorded; no .skip/.only/.todo; no lib/durable-runtime/ or domains/shared/extensions/ change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->
