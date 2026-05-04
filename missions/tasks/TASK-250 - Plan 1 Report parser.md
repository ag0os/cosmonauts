---
id: TASK-250
title: 'Plan 1: Report parser'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-248
createdAt: '2026-05-04T17:32:28.260Z'
updatedAt: '2026-05-04T19:00:25.217Z'
---

## Description

Implement `lib/driver/report-parser.ts` and `tests/driver/report-parser.test.ts`.

See **Implementation Order step 2**, **D-P1-14**, **D-P1-5**, **Files to Change**, QC-017 in `missions/plans/driver-primitives/plan.md`.

`parseReport` is signature-pure — it only parses stdout; `deriveOutcome` logic (unknown + postverify → success/failure) lives in `runOneTask`, not here.

<!-- AC:BEGIN -->
- [x] #1 parseReport(stdout: string): ParsedReport is exported from lib/driver/report-parser.ts.
- [x] #2 Fenced JSON block (```json ... ```) with valid JSON is parsed into a Report with correct outcome, files, verification, notes, and progress fields.
- [x] #3 OUTCOME-text fallback: if no JSON block but a line matches 'OUTCOME: success|failure|partial', a minimal Report with that outcome is returned.
- [x] #4 Unparseable input (no JSON block, no OUTCOME line) returns { outcome: 'unknown', raw: string }.
- [x] #5 partial outcome with a progress field ({ phase, of, remaining? }) is correctly populated in the returned Report.
- [x] #6 tests/driver/report-parser.test.ts covers fenced-JSON, OUTCOME-text fallback, unknown, and partial-with-progress paths; bun run test passes.
<!-- AC:END -->

## Implementation Notes

Implemented parseReport in lib/driver/report-parser.ts and tests in tests/driver/report-parser.test.ts. Verified with `bun run test --grep "report-parser"`, `bun run typecheck`, and `bunx biome check lib/driver/report-parser.ts tests/driver/report-parser.test.ts`. `bun run lint` was attempted but fails on unrelated untracked tests/driver/backends/cosmonauts-subagent.test.ts formatting/import order.
