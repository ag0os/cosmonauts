---
source: archive
plan: orchestration-refactor
distilledAt: 2026-04-17T00:00:00.000Z
---

# Orchestration Module Decomposition

## What Was Built

Two monolithic files — `lib/orchestration/agent-spawner.ts` (470 lines) and `domains/shared/extensions/orchestration/index.ts` (630 lines) — were each split into focused, single-responsibility modules. The spawner produced `model-resolution.ts`, `definition-resolution.ts`, and `session-factory.ts`; the extension produced `rendering.ts`, `authorization.ts`, `chain-tool.ts`, and `spawn-tool.ts`. Both original files were slimmed to thin entry points that re-export their extracted symbols. No behavior was changed; all 836 tests continued to pass throughout.

## Key Decisions

- **`session-factory.ts` was the primary motivation.** The 60-line session creation block in `spawn()` was extracted into `createAgentSessionFromDefinition()` specifically so the upcoming `parallel-agent-spawning` plan can reuse session setup without duplication. The other extractions were opportunistic cleanup done in the same pass.
- **`isSubagentAllowed()` got its own module despite being 15 lines.** Authorization is a distinct security-policy concern — independently readable, replaceable, and eventually testable in isolation. Size is not the threshold for extraction; conceptual responsibility is.
- **No new tests were added.** This is a pure structural refactor. Internal modules (`model-resolution.ts`, `session-factory.ts`, etc.) are not tested in isolation — coverage flows through the re-export surface of `agent-spawner.ts`. Acceptable trade-off for a no-behavior-change pass.

## Patterns Established

- **Extract pure leaf modules first, then compositional pieces, then slim the entry point.** This ordering avoids temporary circular dependencies during the refactor. `model-resolution.ts` and `definition-resolution.ts` went first (no internal deps), then `session-factory.ts` (depends on both leaves), then the spawner was slimmed.
- **Re-export from the original file to preserve the public API.** `agent-spawner.ts` does `export * from './model-resolution.ts'` etc., so all external import paths remain valid. Never rename or remove the original file mid-refactor if it has consumers.
- **Pi extension tools use a `register*(pi, getRuntime)` function signature.** Each tool lives in its own file (`chain-tool.ts`, `spawn-tool.ts`), imports its own rendering and authorization helpers, and exports a single registration function. `index.ts` calls them in order and stays ~30 lines.
- **Four-layer decomposition model for large orchestration files:** (1) pure resolution/mapping leaf modules, (2) factory/builder composing the leaves, (3) one-tool-per-file registration functions taking `(pi, getRuntime)`, (4) thin entry point wiring and re-exporting. Follow this pattern when any orchestration or extension file grows unwieldy.

## Files Changed

- `lib/orchestration/model-resolution.ts` *(new)* — `getModelForRole()`, `getThinkingForRole()`, `resolveModel()`, `FALLBACK_MODEL`. Pure functions; no internal deps. `chain-runner.ts` now imports directly from here.
- `lib/orchestration/definition-resolution.ts` *(new)* — `resolveTools()`, `resolveExtensionPaths()`, `isDirectory()`, `ResolveExtensionOptions`. Pure helpers for resolving agent definition fields.
- `lib/orchestration/session-factory.ts` *(new)* — `createAgentSessionFromDefinition()`. Assembles prompts, builds resource loader, creates session options, calls `createAgentSession()`. The key reuse seam for parallel spawning.
- `lib/orchestration/agent-spawner.ts` *(slimmed)* — Retains `AgentSpawner` interface, `createPiSpawner()`, event mapping, stats extraction. Re-exports everything from the three extracted modules.
- `lib/orchestration/chain-runner.ts` *(updated)* — Imports `getModelForRole`/`getThinkingForRole` from `model-resolution.ts` directly.
- `domains/shared/extensions/orchestration/rendering.ts` *(new)* — `roleLabel()`, `ROLE_LABELS`, `formatDuration()`, `chainEventToProgressLine()`, `buildProgressText()`, `buildCostTable()`, `renderTextFallback()`. Pure rendering helpers with no Pi/runtime dep.
- `domains/shared/extensions/orchestration/authorization.ts` *(new)* — `isSubagentAllowed()` only.
- `domains/shared/extensions/orchestration/chain-tool.ts` *(new)* — `registerChainTool(pi, getRuntime)`. Full `chain_run` tool: execute handler, renderCall, renderResult.
- `domains/shared/extensions/orchestration/spawn-tool.ts` *(new)* — `registerSpawnTool(pi, getRuntime)`. Full `spawn_agent` tool: execute handler, renderCall, renderResult.
- `domains/shared/extensions/orchestration/index.ts` *(slimmed)* — Runtime cache, `getRuntime()`, calls to `registerChainTool()` then `registerSpawnTool()`. ~37 lines.

## Gotchas & Lessons

- **Tool registration order is load-bearing.** `registerChainTool()` must be called before `registerSpawnTool()` in `index.ts`. This is invisible from the tool files themselves and only documented in the plan. Reversing the order changes tool presentation order in agent context.
- **Large files accumulate partial extractions.** When TASK-097 ran, `definition-resolution.ts` already existed on disk from a prior incomplete pass, but `agent-spawner.ts` still had inline duplicates. The worker had to reconcile both before doing a clean extraction. Don't leave half-extracted modules — finish the extraction or don't start it.
- **AC checkboxes require direct markdown editing.** The `task_edit` tool does not toggle checkboxes inside `AC:BEGIN/AC:END` blocks. Workers must edit the raw markdown file, replacing `- [ ]` with `- [x]`. Multiple tasks in this plan were closed with unchecked ACs despite complete implementations because workers didn't know this.
- **Dependency direction must be enforced at review time.** `session-factory.ts` must import from `model-resolution.ts` and `definition-resolution.ts`, not from `agent-spawner.ts`. If `agent-spawner.ts` is ever changed, check that `session-factory.ts` hasn't inadvertently been made to depend on it, creating a cycle.
