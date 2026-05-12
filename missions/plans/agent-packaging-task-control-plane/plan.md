---
title: Agent Packaging and Task Control Plane Architecture
status: active
createdAt: '2026-05-11T20:48:11.194Z'
updatedAt: '2026-05-11T21:22:59.423Z'
---

## Overview

Define the target architecture that makes agent packages portable across internal Pi sessions, external CLIs, standalone Bun binaries, chains, and Drive. The center of gravity is now a declarative **`AgentPackageDefinition`**: a human- or agent-authored artifact that may derive from a Cosmonauts internal `AgentDefinition`, or may describe a completely standalone external agent with no Cosmonauts source agent at all.

This is an umbrella architecture record. It captures the shared vocabulary, dependency direction, and phased implementation boundaries so follow-up plans can ship small slices without drifting. The first implementation slice remains `external-agent-orchestration`: package a declarative agent definition as a Claude CLI-backed standalone binary. Later slices introduce shared runtime dispatch, make Drive consume packaged agents, and evolve Drive into a durable/live task control plane.

## Scope

Included:
- Define the durable concepts: `AgentPackageDefinition`, `AgentPackage`, runtime target adapters, managed/steerable sessions, workflows/chains, and the Drive task control plane.
- Preserve current chain/workflow behavior as the static phase graph.
- Recast Drive as the task execution control plane rather than the general pipeline system.
- Establish phased implementation order and non-overlap between phases.
- Support package definitions for both Cosmonauts-derived agents and standalone external agents that use runtimes such as Claude Code, Codex, Gemini CLI, or future open-code backends.
- Establish that runtime-specific features are encoded in target blocks, not by mutating internal `AgentDefinition`s.

Explicitly excluded from this umbrella plan:
- Direct implementation tasks. Each phase gets its own implementation plan.
- Rewriting the current chain runner.
- Replacing the current Drive loop in one migration.
- Full Codex/Gemini parity before Claude export proves the packaging seam.
- Full mid-turn steering for external CLIs before runtime capability detection exists.

## Decision Log

- **D-001 — Package definitions before unifying orchestration**
  - Decision: Introduce declarative package definitions as the shared authoring unit, then compile them into packages consumed by exports, chains, Drive, and future live orchestration.
  - Alternatives: Export `AgentDefinition` directly; make Drive the primary abstraction for all external execution; refactor chains and Drive into one runtime first.
  - Why: Package definitions are the smallest shared seam that supports conversational design, external-safe prompt adaptation, and future non-Cosmonauts agents without destabilizing existing chains.
  - Decided by: user-directed

- **D-002 — Cosmonauts `AgentDefinition` is optional input, not the package source of truth**
  - Decision: A package definition may reference a source internal agent for defaults/provenance, but it can also define an agent with no Cosmonauts source at all.
  - Alternatives: Require every export to start from an internal `AgentDefinition`; create hard-coded export-only agents such as `standalone-planner`.
  - Why: Many useful packages will be designed for a target runtime's native affordances, or for backends unrelated to Cosmonauts internal agents.
  - Decided by: user-directed

- **D-003 — Keep chains as the static workflow/phase graph**
  - Decision: Chains continue to express deterministic stage order such as `planner -> task-manager -> coordinator -> quality-manager`.
  - Alternatives: Replace chains with live orchestrators; merge Drive semantics directly into the chain runner.
  - Why: The current chain system works well and should remain the reliable phase-level composition surface.
  - Decided by: user-directed

- **D-004 — Evolve Drive into the task control plane**
  - Decision: Drive owns durable task execution concerns: ready-task selection, worker runs, pre/postflight, task status transitions, events, verification, commits, and later live supervision.
  - Alternatives: Keep Drive as a thin backend runner; eliminate Drive and make task execution just another chain stage.
  - Why: Drive's original value is real-time/durable orchestration around task work. That responsibility is distinct from a static chain graph.
  - Decided by: user-chose-among-options

- **D-005 — Runtime-specific features live in target blocks**
  - Decision: Claude Code, Codex, Gemini CLI, and future backend features are represented as target-specific options under one package definition shape.
  - Alternatives: Add one-off top-level package fields for each runtime; pass arbitrary raw CLI args as the primary extension model.
  - Why: Target blocks keep the core schema stable while allowing each runtime adapter to own feature detection, safety rules, and command mapping.
  - Decided by: user-directed

- **D-006 — Add an agent-packaging skill for conversational authoring**
  - Decision: Teach Cosmo/Cody/Planner how to help a human create package definitions through conversation, including checking runtime docs/features and validating tool assumptions.
  - Alternatives: Hard-code specific exported agents; expect users to hand-author definitions without guidance.
  - Why: Export-safe prompts often require judgment: internal tools may not exist, but target runtimes may provide native todos, subagents, MCP, sandboxing, or other features.
  - Decided by: user-directed

- **D-007 — Phase implementation rather than one mega-plan**
  - Decision: Use one umbrella architecture plan plus multiple implementation plans.
  - Alternatives: One large implementation plan; large refactor-first rewrite.
  - Why: The architecture spans prompts, skills, CLI export, chain dispatch, Drive, task state, live sessions, and target runtimes. Phasing keeps each slice testable and reduces risk to working orchestration.
  - Decided by: user-chose-among-options

## Current State

- `AgentDefinition` in `lib/agents/types.ts` is the authoritative declaration for internal domain agent identity, capabilities, tools, skills, model, and sub-agent permissions.
- Internal agent execution uses `AgentSpawner` in `lib/orchestration/types.ts` and `createPiSpawner()` in `lib/orchestration/agent-spawner.ts`.
- Chains and workflows are static stage graphs: workflows from `bundled/coding/coding/workflows.ts` resolve to chain DSL strings, and `lib/orchestration/chain-runner.ts` executes stages through `AgentSpawner`.
- Drive is separate. `lib/driver/` runs plan-linked tasks through `Backend` adapters (`codex`, `claude-cli`, `cosmonauts-subagent`). Backends receive rendered task prompt files, not full packaged agents.
- `cosmonauts-subagent` is the only bridge between Drive and the internal Pi agent world: it wraps an `AgentSpawner` and defaults to a `worker` role.
- External Drive backends currently run raw task prompts (`claude -p`, `codex exec`) without Cosmonauts-composed system prompts, skill content, model/thinking mapping, or reusable export artifacts.

## Target Architecture

### Concept map

```txt
AgentPackageDefinition
  -> AgentPackage
      -> AgentRuntimeAdapter: pi | claude-cli | codex | gemini-cli | open-code | bun-binary
          -> Orchestration policy: chain | drive batch | supervised Drive | standalone user CLI
```

`AgentDefinition` sits to the side as an optional source:

```txt
Cosmonauts AgentDefinition ─┐
                            ├─> AgentPackageDefinition -> AgentPackage
Standalone external design ─┘
```

### Stable concepts

**`AgentDefinition`** remains the source declaration owned by Cosmonauts domains. It should not grow runtime-specific command-line flags. Domain authors continue to declare internal agents in terms of identity, capabilities, tools, skills, model, thinking level, and sub-agent allowlist.

**`AgentPackageDefinition`** is the declarative authoring artifact for exported/portable agents. It can be written by a human, generated during a Cosmo/Cody/Planner conversation, or normalized from a source-agent shorthand. It may reference a source `AgentDefinition`, but it does not have to.

Target shape:

```ts
interface AgentPackageDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly description: string;
  readonly sourceAgent?: string;
  readonly prompt: PackagePromptSource;
  readonly tools: PackageToolPolicy;
  readonly skills: PackageSkillSelection;
  readonly projectContext: "omit" | "embed" | "runtime"; // Phase 1 supports "omit" only.
  readonly targets: Partial<Record<ExternalRuntimeTarget, TargetPackageOptions>>;
}

type ExternalRuntimeTarget =
  | "claude-cli"
  | "codex"
  | "gemini-cli"
  | "open-code";
```

Rule: runtime-specific capabilities belong in `targets.<runtime>`, not in the core definition or in internal `AgentDefinition`.

**`AgentPackage`** is a portable, runtime-neutral compiled artifact derived from an `AgentPackageDefinition`. It contains the final prompt, selected skills or skill index, tool policy, model/thinking preferences, target metadata, and source metadata needed by runtime adapters.

Target shape:

```ts
interface AgentPackage {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly description: string;
  readonly sourceAgentId?: string;
  readonly systemPrompt: string;
  readonly tools: AgentToolSet;
  readonly skills: readonly PackagedSkill[];
  readonly model?: string;
  readonly thinkingLevel?: ThinkingLevel;
  readonly projectContext: "omit" | "embed" | "runtime";
  readonly targetOptions: TargetPackageOptions;
}

interface PackagedSkill {
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly sourcePath: string;
}
```

Dependency rule: package building may depend on agent/domain/prompt/skill modules, but `AgentDefinition` and domain definitions must not import package/export/runtime modules.

**`AgentRuntimeAdapter`** is the future shared one-shot contract used by chains, Drive, and standalone execution. It runs an `AgentPackage` with an input prompt and returns output plus stats when available.

Target shape:

```ts
interface AgentRunInput {
  readonly package: AgentPackage;
  readonly prompt: string;
  readonly cwd: string;
  readonly signal?: AbortSignal;
}

interface AgentRunOutput {
  readonly success: boolean;
  readonly stdout: string;
  readonly messages?: readonly unknown[];
  readonly stats?: SpawnStats;
  readonly error?: string;
}

interface AgentRuntimeAdapter {
  readonly id: string;
  readonly capabilities: RuntimeCapabilities;
  runOnce(input: AgentRunInput): Promise<AgentRunOutput>;
}

interface RuntimeCapabilities {
  readonly oneShot: boolean;
  readonly observable: boolean;
  readonly steerable: boolean;
  readonly abortable: boolean;
}
```

Dependency rule: adapters depend on package types; package building does not depend on adapters.

**`ManagedAgentSession`** is a later extension for live Drive. It represents a steerable/observable session when a runtime supports more than one-shot execution.

Target shape:

```ts
interface ManagedAgentSession {
  readonly runId: string;
  readonly packageId: string;
  readonly capabilities: RuntimeCapabilities;
  send(message: string): Promise<void>;
  steer?(message: string): Promise<void>;
  abort(): Promise<void>;
  events(): AsyncIterable<AgentRuntimeEvent>;
  result: Promise<AgentRunOutput>;
}
```

Runtime rule: one-shot external CLIs may implement only `runOnce`; supervised Drive must degrade to between-task supervision when `steerable` is false.

### Orchestration responsibilities

**Chains/workflows** remain static phase graphs.
- Own: stage topology, loop-stage iteration caps, phase-level stats, chain events.
- Do not own: task dependency resolution, commits, per-task pre/postflight, durable worker queue state.
- Later change: optionally dispatch a stage through an external/package runtime, but default internal Pi behavior remains unchanged.

**Drive/task control plane** owns task execution inside a phase.
- Own: ready-task queue, dependency/status transitions, preflight/postflight, worker run records, driver events, verification, commit policy, resume/detach semantics.
- Later supervised mode: an orchestrator agent gets tools to start/observe/steer/abort workers and ask the human mid-run.
- Do not own: static multi-phase workflow ordering; chains already do that.

**Standalone exports** are packaged agents compiled into Bun binaries.
- Own: hermetic artifact, temp materialization, runtime CLI invocation, auth diagnostics, shell-friendly stdin/stdout.
- Do not own: task state, commits, chain events, or Drive queues.

**Agent-packaging skill** guides conversational authoring.
- Own: method for inspecting source agents and target runtimes, surfacing trade-offs, checking docs/help, and producing package definitions.
- Do not own: implementation of runtime adapters or hidden automatic prompt rewriting.

## Phased Implementation Roadmap

### Phase 1 — Declarative package definitions + Claude export (`external-agent-orchestration`)

Prove `AgentPackageDefinition -> AgentPackage -> Claude CLI binary`.

Included:
- Define and validate `AgentPackageDefinition`.
- Build packages from either explicit prompts or safe source-agent prompts.
- Allow definitions with no Cosmonauts source agent.
- Inline selected full skill markdown.
- Add `cosmonauts export --definition <path> --out <path>` plus source-agent shorthand.
- Compile a standalone Bun binary that materializes prompt assets and shells out to `claude`.
- Protect subscription billing by removing `ANTHROPIC_API_KEY` from child env unless explicitly opted in.
- Add `/skill:agent-packaging` for conversational package creation.

Excluded:
- Chain-stage external runtime dispatch.
- Drive migration.
- Codex/Gemini parity.
- Claude plugin-dir skill packaging.

### Phase 2 — Shared one-shot runtime dispatch

Introduce an `AgentRuntimeAdapter` contract and implement:
- Pi adapter backed by existing `createPiSpawner()` behavior.
- Claude CLI/package adapter backed by Phase 1 mapping.
- Chain runner dispatch that defaults to Pi and can opt into external/package runtimes without changing existing workflow behavior.

### Phase 3 — Drive consumes packaged agents

Replace raw `BackendName`-first external execution with task runs that select:

```txt
package: worker-package | package-definition-path | source-agent-derived-package
runtime: pi | claude-cli | codex | gemini-cli
```

Drive keeps task status, reports, verification, commits, events, and detached runs. Existing `codex`/`claude-cli` backend names can remain as compatibility aliases while the internal implementation routes through packaged-agent runtime adapters.

### Phase 4 — Supervised task control plane

Add a Drive mode where an orchestrator agent supervises task execution in real time.

Control-plane tools exposed to the orchestrator:
- `list_ready_tasks`
- `start_worker(taskId, packageOrAgent, runtime)`
- `observe_worker(agentRunId)`
- `send_worker_message(agentRunId, message)` when supported
- `abort_worker(agentRunId)`
- `run_verification(taskId)`
- `mark_task_done/task_blocked/task_partial`
- `ask_human(question)`

Durable layout extends current run workdirs:

```txt
missions/sessions/<plan>/runs/<runId>/
  spec.json
  events.jsonl
  task-queue.txt
  agents/<agentRunId>/
    package.json
    input.md
    output.md
    transcript.md
    status.json
  run.completion.json
```

### Phase 5 — Runtime expansion and richer skill delivery

Add Codex/Gemini/open-code export/runtime support, Claude plugin-dir packaging, feature detection for CLI flag drift, target-doc/help inspection workflows, and steerable external sessions where the external runtime supports it.

## Dependency Direction

```txt
internal domain agent definitions ┐
                                  ├─> package definition -> package builder -> runtime adapters -> orchestration policies
standalone package definitions ───┘
```

Rules:
- `lib/agents/types.ts` remains runtime-neutral until an implementation phase proves a discriminator is necessary.
- Package definitions are the portable authoring artifact for external/runtime-specific agents.
- Package-building code may import from `lib/agents`, `lib/domains`, and `lib/skills` only when a source agent is referenced.
- Runtime adapters may import package types and process/CLI helpers.
- Chain and Drive orchestration import runtime adapters; adapters do not import chain or Drive.
- Drive can use runtime events, but package/runtime modules must not update task files or write commits.
- Runtime-specific features should be typed target options. Escape hatches such as raw extra args, if added later, must be explicit and safety-reviewed.

## Behavior Story

No user-facing behavior changes are expected from this umbrella architecture by itself. Each implementation phase must provide its own behavior specs.

The invariants every phase must preserve:
- Existing chains/workflows continue to run internal Pi agents unless explicitly configured otherwise.
- Existing `drive run` behavior remains compatible until a migration phase explicitly changes the CLI contract.
- External runtime failures must identify the runtime, binary, and likely remediation.
- Packaged binaries are hermetic with respect to prompt/skill content: they must not require the Cosmonauts source repo after compilation.
- Package definitions can be authored without a Cosmonauts source agent.
- Source-agent-derived packages must not blindly export prompts that mention unavailable tools unless the package provides an explicit target-safe prompt.

## Risks

- **Package definitions become too broad too early**
  - Blast radius: workers overbuild future runtimes before Claude proves the seam.
  - Countermeasure: Phase 1 keeps runtime-specific fields minimal and typed, with future targets nested under `targets` but not implemented until later phases.

- **A shared runtime abstraction becomes too broad too early**
  - Blast radius: chains and Drive both inherit unnecessary complexity.
  - Countermeasure: Phase 1 exposes package definitions, package building, and Claude invocation mapping only; `AgentRuntimeAdapter` lands in Phase 2 after one real package exists.

- **Drive and chains drift into overlapping responsibilities again**
  - Blast radius: duplicate task selection, event semantics, and runtime dispatch paths.
  - Countermeasure: keep chains phase-level and Drive task-level. Follow-up plans must state which side owns each new behavior.

- **External runtime semantics differ from Pi sessions**
  - Blast radius: skills, tool restrictions, streaming, steering, and stats are inconsistent.
  - Countermeasure: model runtime capability flags explicitly and degrade supervised behavior when a runtime is only one-shot.

- **Packaged agents create security/auth confusion**
  - Blast radius: users accidentally bill API keys or run external CLIs with unexpected local context.
  - Countermeasure: Phase 1 defaults to subscription-safe environment handling and hermetic Claude flags.

- **Conversational package authoring creates misleading prompts**
  - Blast radius: binaries compile but instruct the model to use unavailable runtime features.
  - Countermeasure: `/skill:agent-packaging` requires target runtime feature review and human validation before export.

## Quality Contract

- **QC-001 — Chain behavior preserved**: Any phase that touches chain execution must include tests proving existing Pi-backed chains still dispatch through the current default path.
- **QC-002 — Drive remains task-owner**: No runtime adapter may directly update task files, write commits, or decide task status. Those remain Drive/control-plane responsibilities.
- **QC-003 — Package definition is the portable source of truth**: Export paths normalize through `AgentPackageDefinition`; internal `AgentDefinition` is optional input, not the direct external-runtime contract.
- **QC-004 — Package mapping single-sourced**: Claude/Codex/Gemini/open-code command mapping must live behind runtime/package modules, not duplicated in chain, Drive, and export code.
- **QC-005 — Hermetic export invariant**: Exported binaries must embed prompt/skill content needed for their agent identity and fail visibly when the external CLI is unavailable.
- **QC-006 — Runtime capability honesty**: Supervised orchestration must check `observable`, `steerable`, and `abortable` capability flags before offering live control operations.
- **QC-007 — Target feature declarations are explicit**: Runtime-native features such as Claude todos/subagents, Codex sandbox modes, or Gemini-specific options must be declared in target blocks or omitted; no hidden prompt assumptions.

## Follow-up Plans

1. `external-agent-orchestration` — Phase 1 declarative package definitions + Claude export.
2. `agent-runtime-dispatch` — Phase 2 shared one-shot runtime adapters and optional chain dispatch.
3. `drive-packaged-agents` — Phase 3 Drive migration from backend names to package/runtime selection.
4. `supervised-task-control-plane` — Phase 4 live orchestrator over Drive-managed task runs.
5. `external-runtime-expansion` — Phase 5 Codex/Gemini/open-code/plugin-dir/feature-detection improvements.
