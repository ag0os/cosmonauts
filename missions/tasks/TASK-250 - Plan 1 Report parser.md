---
id: TASK-250
title: 'Plan 1: Report parser'
status: To Do
priority: medium
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-248
createdAt: '2026-05-04T17:32:28.260Z'
updatedAt: '2026-05-04T18:25:57.795Z'
---

## Description

Implement `lib/driver/report-parser.ts` and `tests/driver/report-parser.test.ts`.

See **Implementation Order step 2**, **D-P1-14**, **D-P1-5**, **Files to Change**, QC-017 in `missions/plans/driver-primitives/plan.md`.

`parseReport` is signature-pure — it only parses stdout; `deriveOutcome` logic (unknown + postverify → success/failure) lives in `runOneTask`, not here.

<!-- AC:BEGIN -->
- [ ] #1 parseReport(stdout: string): ParsedReport is exported from lib/driver/report-parser.ts.
- [ ] #2 Fenced JSON block (```json ... ```) with valid JSON is parsed into a Report with correct outcome, files, verification, notes, and progress fields.
- [ ] #3 OUTCOME-text fallback: if no JSON block but a line matches 'OUTCOME: success|failure|partial', a minimal Report with that outcome is returned.
- [ ] #4 Unparseable input (no JSON block, no OUTCOME line) returns { outcome: 'unknown', raw: string }.
- [ ] #5 partial outcome with a progress field ({ phase, of, remaining? }) is correctly populated in the returned Report.
- [ ] #6 tests/driver/report-parser.test.ts covers fenced-JSON, OUTCOME-text fallback, unknown, and partial-with-progress paths; bun run test passes.
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses for 47/48 worker spawns; coordinator confabulated success. No implementation actually landed. Acceptance criteria all unchecked. Retry pending provider diagnosis.
