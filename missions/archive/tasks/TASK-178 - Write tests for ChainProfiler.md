---
id: TASK-178
title: Write tests for ChainProfiler
status: Done
priority: high
assignee: worker
labels:
  - testing
  - 'plan:chain-profiler'
dependencies:
  - TASK-177
createdAt: '2026-04-13T14:47:56.634Z'
updatedAt: '2026-04-13T14:56:47.456Z'
---

## Description

Create `tests/orchestration/chain-profiler.test.ts` covering all quality contract criteria from the plan.

**Test scenarios (feed synthetic `ChainEvent` sequences into `ChainProfiler`):**

1. **Tool pairing correctness** — emit `agent_tool_use(tool_execution_start)` then `agent_tool_use(tool_execution_end)` with matching `toolCallId`; assert `ToolSpan.durationMs === endTs - startTs` (QC-001).
2. **Orphan handling** — emit `tool_execution_start` with no matching end; assert summary report contains the orphaned tool call and it is not silently dropped (QC-002).
3. **JSONL format** — call `writeOutput()` against a temp dir; parse each line of the `.trace.jsonl` file as JSON; assert every line has `ts`, `cat`, `name`, `ph` fields and `ph` is `"B"`, `"E"`, or `"I"` (QC-006).
4. **Output file creation** — after a minimal chain run (chain_start + chain_end), assert both `.trace.jsonl` and `.summary.txt` are created in `outputDir` (QC-004).
5. **Parallel fan-out disambiguation** — emit `parallel_start`, two `agent_spawned` events with the same role, then `parallel_end`; assert trace entries for those sessions carry `scope: "reviewer.0"` and `scope: "reviewer.1"` respectively, and summary output reflects per-member breakdown (QC-007).
6. **Partial/abort flush** — call `writeOutput()` after only `chain_start` (no `chain_end`); assert output files are written and are valid (QC-008).
7. **Summary sections** — assert summary text includes chain overview, stage breakdown, slowest tools, per-agent breakdown, and (when applicable) orphaned tool calls and parallel group sections.

Use `mkdtemp` from `node:fs/promises` for temp dirs; clean up in `afterEach`. Follow the test patterns in `tests/orchestration/chain-runner.test.ts` (vitest, no mocking of fs — use real temp dirs).

<!-- AC:BEGIN -->
- [x] #1 All tests pass with bun run test -- --grep 'chain-profiler'
- [x] #2 Tool pairing test verifies durationMs equals endTs minus startTs for every ToolSpan
- [x] #3 Orphan test verifies orphaned tool_execution_start events appear in summary output
- [x] #4 JSONL test verifies every line in the trace file is valid JSON with ts, cat, name, ph fields present
- [x] #5 Parallel fan-out test verifies scope tags (reviewer.0, reviewer.1) appear in trace entries and summary
- [x] #6 Abort/partial test verifies writeOutput() produces valid files when called after an incomplete chain run
- [x] #7 Tests use real temp directories (mkdtemp) and clean up after each test
<!-- AC:END -->

## Implementation Notes

The test file already existed with 26 tests covering all QC criteria. Two fixes were needed: (1) describe block names used CamelCase "ChainProfiler" rather than kebab-case "chain-profiler", causing 25/26 tests to be skipped by --grep; renamed all describe blocks to start with "chain-profiler:". (2) Added a dedicated test for AC #5 (parallel fan-out with exactly 2 reviewers) that checks both trace entry scopes (reviewer.0, reviewer.1) AND summary output — the existing parallel tests only verified trace entries. All 27 tests now pass with --grep 'chain-profiler'.
