---
source: archive
plan: chain-profiler
distilledAt: 2026-04-15T15:04:48Z
---

# Chain Profiler: Post-Run Execution Analysis

## What Was Built
Chain runs invoked through `--workflow` can now be profiled with `--profile`, producing two artifacts after execution: a JSONL event trace and a human-readable summary. The profiler passively listens to `ChainEvent`s, computes tool-call durations by pairing start/end events, and reports stage timing, parallel-group timing, slowest tools, per-role totals, and orphaned tool calls. Output is written to a plan-scoped sessions directory when a plan slug can be derived, or to `missions/sessions/_profiles` otherwise.

## Key Decisions
- Kept profiling logic in a standalone `ChainProfiler` module and left path resolution in the CLI. This preserved a clean boundary: the profiler only understands events and file writing, while `cli/main.ts` reuses existing `derivePlanSlug()` and `sessionsDirForPlan()` helpers.
- Used a Chrome-trace-inspired JSONL shape plus a text summary instead of a single custom report format. The JSONL file stays machine-friendly for future tooling, while the summary is optimized for quick post-run inspection.
- Disambiguated parallel fan-out members with scope tags like `reviewer.0` and `reviewer.1`, assigned from `agent_spawned` order within a `parallel_start`/`parallel_end` block. This avoids relying on duplicated stage names, which are not unique in fan-out runs.
- Wrote profile output in a `finally` block during CLI execution so aborted or failed runs still flush partial traces and summaries.

## Patterns Established
- Treat chain profiling as observer-only instrumentation: compose another `onEvent` consumer at the CLI edge instead of changing `runChain()` or other orchestration contracts.
- Reuse existing plan/session directory helpers for artifact placement. New execution artifacts should live under `missions/sessions/` so they remain discoverable and compatible with archive flows.
- For event-stream features, key durable correlation off stable IDs already present in events (`toolCallId`, `sessionId`) rather than stage names or display labels.
- Test event-driven modules with synthetic `ChainEvent` sequences and real temp-directory file IO. That gives stable coverage for timing, scope tagging, JSONL output, and partial flush behavior.

## Files Changed
- `lib/orchestration/chain-profiler.ts` — Added the profiler module, trace-entry/tool-span types, tool start/end pairing, parallel scope tracking, JSONL writing, and summary generation.
- `cli/main.ts` — Registered `--profile`, resolved output directories from existing plan/session helpers, composed logger + profiler event handlers, and flushed output in `finally`.
- `cli/types.ts` — Added the CLI option shape for `profile`.
- `tests/orchestration/chain-profiler.test.ts` — Added/updated coverage for tool pairing, orphan handling, JSONL validity, parallel fan-out scope tags, summary sections, and partial writes on incomplete runs.

## Gotchas & Lessons
- Plan-scoped output depends on `derivePlanSlug(options.completionLabel)`. If a run has no derivable plan slug, profile files go to `missions/sessions/_profiles` instead of a plan-specific session directory.
- Fan-out profiling cannot use role or stage name alone for attribution; repeated roles in the same parallel group require session-based scope mapping.
- Scope tags must persist after `parallel_end` for later events from those sessions, otherwise tool events and completions lose their reviewer-specific identity.
- Grep-targeted test commands were sensitive to suite naming: describe blocks had to include `chain-profiler` or most of the suite was silently skipped during filtered runs.
