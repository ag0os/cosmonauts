# Cosmonauts

An **agent-first** AI orchestration library built on [Pi](https://github.com/earendil-works/pi). Declare your agents, compose their system prompts, expose skills, and wire up chains, for any domain. You bring the domain; Cosmonauts gives you the tooling to build, coordinate, and run the agents.

What makes it different from using a single assistant directly:

- **Agent-first**: you build your *own* agents and the chains that run them automatically, instead of working inside someone else's fixed assistant.
- **Backend-agnostic**: run whatever model is available: OpenAI, Anthropic, or open-source. Each agent names its model; nothing picks one for you.
- **Orchestrate internally *or* externally**: drive agents from your own code or the Cosmonauts CLI, or from another agent harness that calls Cosmonauts' tools (chains and the drive system).

> **Alpha.** Cosmonauts is a library. It ships no agents, prompts, skills or domains of its own, and it has no stability guarantees yet.

## What It Does

Cosmonauts is domain-agnostic. You supply the content, and the library provides the substrate: declarative agent definitions, four-layer prompt composition, on-demand skills, multi-agent orchestration (chains and Drive runs), and a persistent plan/task/memory spine so work compounds instead of drifting.

What you supply:

- **Agents**: declarative definitions with their own instructions (inline text or an absolute file path), model, tools, skills and sub-agent permissions.
- **Chains**: named multi-agent pipelines, each stage run by one of your agents.
- **Memory grants**: each agent opts into authored memory, episodes, proposals or architecture memory. Knowledge recall is on by default and applies only when the project enables the knowledge surface; the other groups stay off unless you grant them.
- **Policies and extensions**: session policies, chain adapters and extension providers, when you need them.
- **Domains** (optional): a directory with a `domain.ts` manifest that packages agents, prompts, capabilities, skills, extensions and named chains together. The CLI loads domains; your own code can pass agents and chains directly.

There is no bundled persona. If no agent is declared, there is nothing to run.

## Requirements

- Cosmonauts ships TypeScript source (`.ts` files and `.ts` import paths), so it needs a TypeScript-capable ESM runtime such as [Bun](https://bun.sh/).
- The Pi packages (`@earendil-works/pi-*`) are dependencies, pinned to one exact version.

Cosmonauts is not published to a registry. Install it from a git checkout or a packed tarball.

## Quick Start

Declare an agent and a chain, build a runtime from them, and create a Pi session for the agent:

```ts
import {
	type AgentDefinition,
	CosmonautsRuntime,
	type NamedChain,
} from "cosmonauts";
import { selectChain } from "cosmonauts/chains";
import { createAgentSessionFromDefinition } from "cosmonauts/orchestration/session-factory";

// Your agent: its own instructions, model, tools and memory grants.
const researcher: AgentDefinition = {
	id: "notes/researcher",
	description: "Reads the project and reports facts",
	instructions: { kind: "inline", content: "Read files and report what you find." },
	model: "anthropic/claude-sonnet-5-5",
	tools: "readonly",
	capabilities: [],
	extensions: [],
	skills: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	memory: { authored: true },
};

// Your chain: one stage, run by your agent.
const survey: NamedChain = {
	name: "survey",
	description: "Report the project's facts once",
	stages: [{ name: "notes/researcher", prompt: "Report the project facts." }],
};

const runtime = await CosmonautsRuntime.create({
	projectRoot: process.cwd(),
	agents: [researcher],
	chains: [survey],
});

console.log(selectChain("survey", runtime.chains).steps);

// A Pi session built from the definition. Nothing is sent to a model here.
const { session } = await createAgentSessionFromDefinition(
	runtime.agentRegistry.resolve("notes/researcher"),
	{ runtime, role: "notes/researcher", cwd: process.cwd(), prompt: "" },
	undefined,
	runtime.domainResolver,
);
console.log(session.getActiveToolNames());
session.dispose();
```

The session gets the readonly tools plus `remember` and `recall`, because the agent was granted authored memory. `cosmonauts/chains` also runs named chains (`runConfiguredChain`); see [docs/orchestration.md](./docs/orchestration.md).

## Imports

Import from `cosmonauts` and these entry points. They are the supported surface:

| Entry point | What it holds |
|---|---|
| `cosmonauts` | `CosmonautsRuntime`, agent types and registry |
| `cosmonauts/agents` | agent declarations, registry, identity markers |
| `cosmonauts/runtime` | `CosmonautsRuntime` and its errors |
| `cosmonauts/runtime-host` | the host locator (`setRuntimeHost`, `getHostRuntime`) |
| `cosmonauts/domains` | domain manifests, registry, resolver, bindings, prompt assembly |
| `cosmonauts/chains` | chain parsing, selection, normalization and running |
| `cosmonauts/orchestration/chain-runner` | the inline chain runner |
| `cosmonauts/orchestration/durable-chain-runner` | the durable chain runner |
| `cosmonauts/orchestration/session-factory` | `createAgentSessionFromDefinition` |
| `cosmonauts/orchestration/agent-spawner` | the Pi spawner and model/tool resolution |
| `cosmonauts/orchestration/definition-resolution` | tool allowlists and extension resolution |
| `cosmonauts/orchestration/types` | orchestration types (type-only) |
| `cosmonauts/orchestration/message-bus` | `MessageBus` |
| `cosmonauts/orchestration/spawn-tracker` | `SpawnTracker` |
| `cosmonauts/orchestration/chain-profiler` | `ChainProfiler` |
| `cosmonauts/extensions/orchestration` | the orchestration extension (spawn, chain and Drive tools) |
| `cosmonauts/durable-runtime` | durable run store, scheduler, `runStart` and `runStatus` |
| `cosmonauts/memory` | the memory interface and its stores |
| `cosmonauts/config` | project config loading |
| `cosmonauts/plans` | plan files and lifecycle |
| `cosmonauts/prompts` | prompt loading and runtime templates |
| `cosmonauts/skills` | skill discovery, export and harness sync |
| `cosmonauts/sessions` | session manifests |
| `cosmonauts/packages`, `cosmonauts/packages/scanner` | domain packages and source scanning |
| `cosmonauts/envelope` | the run report envelope schema |
| `cosmonauts/architecture-map` | the architecture map generator and reader |
| `cosmonauts/artifact-viewer` | the local artifact viewer |
| `cosmonauts/artifacts` | plan conformance checks |
| `cosmonauts/analysis` | analysis capability contracts |

Support boundary:

- The entry points above are the supported spelling.
- The `cosmonauts/lib/<path>.ts` spellings of the same modules (for example `cosmonauts/lib/agents/index.ts`) are compatibility aliases. They stay through the current library strip and may be removed later.
- Every other path is private: the package `exports` map rejects it.

## The CLI

The `cosmonauts` binary is an optional host for your content. It loads domains from installed packages, from `.cosmonauts/domains/`, or from a directory you pass with `--plugin-dir`.

A domain is a directory with a `domain.ts` manifest and an `agents/` directory:

```ts
// domains/ops/domain.ts
import type { DomainManifest } from "cosmonauts/domains";

export const manifest: DomainManifest = {
	id: "ops",
	description: "Operations helpers",
	lead: "helper",
	default: true,
	init: {
		kind: "inline",
		content: "Ask what the project deploys, then propose AGENTS.md.",
	},
};
```

```ts
// domains/ops/agents/helper.ts
import type { AgentDefinition } from "cosmonauts";

const helper: AgentDefinition = {
	id: "helper",
	description: "Answers operations questions",
	instructions: { kind: "inline", content: "You help with deployments." },
	model: "anthropic/claude-sonnet-5-5",
	tools: "readonly",
	capabilities: [],
	extensions: [],
	skills: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	memory: {},
};

export default helper;
```

```sh
cosmonauts --plugin-dir ./domains --list-domains
cosmonauts --plugin-dir ./domains --list-agents
cosmonauts --plugin-dir ./domains --dump-prompt
```

With a domain loaded, `cosmonauts --plugin-dir ./domains` starts an interactive session with its lead, and `--print "<prompt>"` processes one prompt and exits.

`cosmonauts init` bootstraps project instructions with the lead. It gives the lead the `init` instructions from the lead's domain manifest, and it refuses to start when the domain declares none.

These work with no domain at all:

```sh
cosmonauts scaffold missions
cosmonauts task list
cosmonauts plan list
cosmonauts run chain list
cosmonauts run list
```

`scaffold missions` creates `missions/`, `memory/`, and `knowledge/` for tasks, plans, machine memory/proposals, and curated knowledge, plus a minimal `.cosmonauts/config.json`. The knowledge surface remains OFF unless `knowledgeSurface.enabled` is literally `true`; see [docs/memory.md](./docs/memory.md).

The other commands, each with `--help`:

- `cosmonauts run chain <name|dsl> "<prompt>"` runs a named chain or a chain DSL expression.
- `cosmonauts run drive --plan <slug> --envelope <path>` runs approved plan-linked tasks through the driver loop. Cosmonauts ships no envelope, so every run names its own.
- `cosmonauts run status <runId>` and `cosmonauts run watch <runId>` observe runs.
- `cosmonauts task ...` and `cosmonauts plan ...` manage tasks and plans.
- `cosmonauts harness sync` and `cosmonauts skills export` synchronize skills into Claude Code and Codex.
- `cosmonauts export` builds a standalone Claude Code or Codex binary from an agent package definition.

## Developing Cosmonauts

- `lib/`: the library (agents, domains, orchestration, chains, memory, tasks, plans)
- `cli/`: the CLI host
- `bin/cosmonauts`: the CLI entry point
- `themes/`: the Pi theme
- `tests/`: Vitest suites
- `docs/`: reference documentation

The checks: `bun run typecheck`, `bun run lint`, `bun run check:reachability`, `bun run check:suppressions -- --base <revision>`, and `bun run test`.

Tech stack:

- **Runtime**: Bun
- **Language**: TypeScript (ESM, strict mode)
- **Agent Framework**: `@earendil-works/pi-coding-agent`, pinned exactly, lockstep with the other `pi-*` packages (see `package.json`)
- **Schema**: TypeBox (`typebox`)
- **Tests**: Vitest
- **Linter**: Biome

## Documentation

- **[AGENTS.md](./AGENTS.md)**: Project conventions and instructions for agents working on this codebase.
- **[docs/domains.md](./docs/domains.md)**: Domain package layout, authoring contract, visibility, active domains, and bindings.
- **[docs/orchestration.md](./docs/orchestration.md)**: Chains, Drive, normalized run observation, CLI surface.
- **[docs/memory.md](./docs/memory.md)**: Authored memory, curated knowledge, proposal authority, retrieval bounds, and gate adoption.
- **[docs/prompts.md](./docs/prompts.md)**: Four-layer prompt composition.
- **[docs/testing.md](./docs/testing.md)**: Testing standards and patterns.
- Pi itself: the [Pi repository](https://github.com/earendil-works/pi) and its docs.

## License

TBD
