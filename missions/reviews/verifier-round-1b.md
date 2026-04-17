# Verification Report — Round 1B

**Date:** 2026-04-07  
**Project:** /Users/cosmos/Projects/cosmonauts

## Systemic Issue: `--grep` flag not supported

All six commands use `bun run test -- --grep '<pattern>'`. This flag **does not exist** in the installed vitest version (v3.2.4). Running any of the listed commands produces:

```
CACError: Unknown option `--grep`
```

The correct flag is `-t` (`--testNamePattern`). All re-runs below use `-t` instead. Results reflect actual test behavior, not the stated command syntax.

---

## Claims

- id: C-001 (QC-002)
  claim: "Transcript generation markdown behavior — bun run test -- --grep 'transcript'"
  result: pass
  evidence: >
    Command as written fails (`--grep` invalid). Re-ran with `-t 'transcript'` — 5 tests
    matched and passed, but `generateTranscript` describe-block tests are skipped by this
    filter due to vitest's case-sensitive matching ('transcript' ≠ 'Transcript' in
    'generateTranscript'). Running the file directly confirms all 31/31 tests in
    `tests/sessions/session-store.test.ts` pass, including all `generateTranscript` suites
    (header, user messages, assistant text, thinking, tool calls, tool results, mixed
    sequence, defensive handling) and all `writeTranscript` tests.
  notes: >
    Command syntax must be fixed (`--grep` → `-t`). The filter should use `-t 'Transcript'`
    (capital T) or target the file directly to reliably match all transcript tests.

- id: C-002 (QC-003)
  claim: "Session persistence with planSlug — bun run test -- --grep 'session persistence'"
  result: fail
  evidence: >
    Command as written fails (`--grep` invalid). Re-ran with `-t 'session persistence'` —
    **0 tests matched** (1213 skipped). The string "session persistence" does not appear in
    any test name. The underlying behavior (planSlug-gated write to sessions dir) is covered
    in `tests/orchestration/agent-spawner.lineage.test.ts` under the describe block
    "plan-linked spawn (planSlug set)", e.g. "writes transcript to plan sessions dir after
    successful spawn (AC#1)" and "appends manifest record with correct fields after
    successful spawn (AC#2)". Those tests all pass, but they cannot be reached via the
    specified pattern.
  notes: >
    Grep pattern "session persistence" matches no test. Fix: use
    `-t 'plan-linked spawn'` or run `tests/orchestration/agent-spawner.lineage.test.ts`
    directly.

- id: C-003 (QC-004)
  claim: "Manifest recording behavior — bun run test -- --grep 'manifest'"
  result: pass
  evidence: >
    Command as written fails (`--grep` invalid). Re-ran with `-t 'manifest'` — **28 tests
    ran, 28 passed** across 5 files. Relevant lineage tests from
    `tests/orchestration/agent-spawner.lineage.test.ts` all pass: manifest record with
    correct fields (AC#2), stats on success (AC#2), tokens exclude cache fields (AC#2),
    ISO timestamps (AC#2), failed spawn appends outcome:failed (AC#3), failed spawn has no
    stats (AC#3), parentSessionId included, taskId included, absent planSlug skips manifest
    (AC#4).
  notes: Command syntax must be fixed (`--grep` → `-t`).

- id: C-004 (QC-005)
  claim: "No planSlug keeps in-memory behavior — bun run test -- --grep 'no planSlug'"
  result: fail
  evidence: >
    Command as written fails (`--grep` invalid). Re-ran with `-t 'no planSlug'` — **0 tests
    matched** (1213 skipped). The string "no planSlug" appears only as a code comment in
    `tests/orchestration/agent-spawner.lineage.test.ts:293`, not in any test name. The
    describe block is named "non-plan spawn (planSlug absent) — AC#4, AC#5". Tests covering
    the behavior ("does not write transcript when planSlug is absent (AC#4)", "does not
    append manifest when planSlug is absent (AC#4)") all pass when run directly.
  notes: >
    Grep pattern "no planSlug" matches no test. Fix: use
    `-t 'planSlug absent'` or run the lineage test file directly.

- id: C-005 (QC-006)
  claim: "archivePlan moves sessions dir — bun run test -- --grep 'archive.*session'"
  result: pass
  evidence: >
    Command as written fails (`--grep` invalid). Re-ran with `-t 'archive.*session'` —
    **3 tests ran, 3 passed** from `tests/plans/archive.test.ts > archivePlan > sessions
    directory archiving`: (1) "moves missions/sessions/<slug>/ to
    missions/archive/sessions/<slug>/ when sessions exist", (2) "succeeds normally when no
    sessions directory exists for the plan", (3) "does not move memory/ files during
    archive".
  notes: Command syntax must be fixed (`--grep` → `-t`).

- id: C-006 (QC-007)
  claim: "Knowledge bundle roundtrip — bun run test -- --grep 'knowledge'"
  result: pass
  evidence: >
    Command as written fails (`--grep` invalid). Re-ran with `-t 'knowledge'` — only 2/13
    tests matched due to case-sensitive filtering ('knowledge' ≠ 'Knowledge' in
    'readKnowledgeBundle'); the QC-007 roundtrip test
    "readKnowledgeBundle > roundtrip — reads back identical bundle (QC-007)" was skipped by
    the filter. Running `tests/sessions/knowledge.test.ts` directly confirms all **13/13**
    tests pass, including the roundtrip test and "roundtrip preserves all record fields" and
    "roundtrip preserves multiple records in order".
  notes: >
    Command syntax must be fixed (`--grep` → `-t`). Use `-t 'roundtrip'` or run the file
    directly to hit the QC-007 test reliably.

---

## Summary

4/6 claims passed. 2 failed (QC-003, QC-005) because their grep patterns match zero tests.

**Blocking failures:**
- **QC-003** ("session persistence") and **QC-005** ("no planSlug") — the specified patterns do not match any test name. The underlying behaviors are covered by other tests, but the verification commands cannot confirm them.

**Universal issue (non-blocking):** All six commands use `--grep`, which is not a valid vitest flag. The correct flag is `-t`. This affects all claims but only causes test-discovery failures for QC-003 and QC-005 (whose patterns also fail with the correct flag). QC-002, QC-004, QC-006 pass with the correct flag. QC-007 passes when the test file is run directly.

OVERALL: fail
