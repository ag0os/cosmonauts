# Orchestration Surface Consolidation

## Purpose

Consolidate Cosmonauts orchestration surfaces after durable-runtime Wave 1. Agents and humans should see one run-oriented lifecycle for graph-backed orchestration: named compilers start runs, run IDs identify them, normalized read tools observe them, and the CLI uses one `cosmonauts run` front door.

## Users

- Cosmonauts agents that call orchestration tools (`chain_run`, `run_driver`, `spawn_agent`, `run_status`, `run_watch`, `watch_events`).
- Humans and external agents invoking the CLI for chains and Drive runs.
- Maintainers working on the durable orchestration runtime and its docs/prompts.

## User Experience

- A user starts a chain with `cosmonauts run chain <expr-or-name> "prompt"` and receives machine-readable JSON on stdout containing run metadata; progress goes to stderr.
- A user starts Drive with `cosmonauts run drive --plan <slug> ...` and receives current Drive start/result data plus `runId` and `scope`.
- A user or agent observes graph-backed runs with `run_status`/`run_watch` or `cosmonauts run status|watch|list`.
- Existing `watch_events` callers still receive the legacy event response shape and line-cursor behavior, but it is a deprecated compatibility view reconstructed from normalized events.
- Saved pipelines are called named chains, not workflows.
- `spawn_agent` remains an agent-only, non-blocking inline primitive returning `spawnId`; no `run spawn` CLI exists.

## Acceptance Criteria

- [ ] AC-001 - The new internal `runStart` seam owns graph-backed run creation/adoption, graph write, initial step seeding, `run_started`, and scheduler pass orchestration for durable chain and Drive paths while preserving existing on-disk run state, terminal results, resume recovery, and detached frozen-runner behavior.
- [ ] AC-002 - Graph-backed chain and Drive agent/CLI starts expose `{ runId, scope }` (`scope: "chain"` for durable chains, `scope: planSlug` for Drive) and are observable through the same `run_status`/`run_watch` normalized surface. Inline loop/completion chains remain legacy and are explicitly outside the durable run-ID guarantee.
- [ ] AC-003 - `watch_events` is reimplemented as a deprecated compatibility view over normalized runtime events, preserving its legacy `{ events, cursor }` response shape and **legacy event-count cursor semantics** for cursor 0 and non-zero `since`, with parity tests for representative Drive events.
- [ ] AC-004 - The CLI orchestration surface is `cosmonauts run chain|drive|status|watch|list`; all `run` subcommands, including `run chain list`, are JSON-native on stdout with progress on stderr; no `run spawn` exists and `-p/--print` remains the single-agent CLI path.
- [ ] AC-005 - “Workflow” is collapsed into “chain”: saved pipelines are named chains with `{ name; description; chain }`; domain files use `chains.ts`; project config uses `chains?: Record<string, { description?: string; chain: string }>` with key-as-name and project-over-domain precedence; registry, CLI listing, tests, and active docs/prompts use named-chain terminology.
- [ ] AC-006 - Spawn is modeled with a tested inline-default 1-node compiler shape on the `cosmonauts-subagent` backend, while current `spawn_agent` runtime behavior remains `spawnId`-based and no durable nested-run lifecycle is built.
- [ ] AC-007 - Docs, prompts, capabilities, and external skills teach the consolidated surface: `cosmonauts run`, named chains, `runId`, `run_status`/`run_watch`, `watch_events` compatibility, Drive durable-location vocabulary, and spawn’s agent-only scope.
- [ ] AC-008 - Non-goals remain absent: no chain loop/coordinator migration off legacy inline execution, no `RunRecord.kind`/parent run fields, no `nested-run` backend, no parent/child lifecycle, no worktrees/merge finalizers/approval gates, no parallel mutable execution, and no read-only fan-out cap tuning in this plan.

## Scope

In scope:

- Internal `runStart` seam.
- Durable chain and Drive routing through that seam.
- Run-ID surfacing and normalized observation promotion.
- `run_activity` compatibility evidence for normalized `watch_events` reconstruction.
- `cosmonauts run` CLI surface.
- `workflow`→`named chain` rename.
- Spawn compiler modeling with unchanged `spawn_agent` behavior.
- Documentation/prompt/capability refresh.

Out of scope:

- Durable coordinator loops.
- Nested-run lifecycle and backend.
- Mutating run controls.
- Worktree isolation and parallel mutable execution.
- Fan-out cap tuning.
- Daemon/SQLite/runtime store backend changes.

## Assumptions

- Wave 1 durable runtime and graph-backed Drive/chain paths are present as inspected in `lib/durable-runtime`, `lib/orchestration`, and `lib/driver`.
- Back-compat for old CLI names is not a final product constraint; internal callers can move in lockstep.
- Temporary aliases may be used inside an implementation task but should not remain as the final documented surface.
- Project-native tests and static checks remain the verification substrate.

## Open Questions

- None for product scope.