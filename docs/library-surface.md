# Library surface

Cosmonauts is a library. Consumers supply agents, prompts, skills, domains and chains. The optional CLI hosts that content. The [README](../README.md) lists the public entry points and gives a complete agent/session example.

## Import boundary

The supported spellings are `cosmonauts` and the short entry points listed in the README. Existing `cosmonauts/lib/<path>.ts` exports are compatibility aliases through the current library strip and may be removed later. Every other path is private: the package exports map rejects it. `tests/public-surface.test.ts` pins that map.

Nothing under library or CLI core imports consumer domain content. `tests/coding-agnostic-framework.test.ts` checks static imports, type imports, re-exports and dynamic/resolver forms across `lib/` and `cli/`. Extension implementations live in `lib/extensions/`.

## Agent declarations

`AgentDefinition` remains the single programmatic declaration. Directory loading is an adapter into the same session assembly; consumer code can supply inline or file instructions without a persona directory.

```ts
import { CosmonautsRuntime, type AgentDefinition } from "cosmonauts";
import { loadAgentDeclarations } from "cosmonauts/agents";
```

File instructions require absolute paths and are read on assembly. Session cwd is not a declaration root; relative paths are rejected. `loadAgentDeclarations` takes an absolute consumer directory, loads default-exported TS/JS/MJS modules in deterministic order, and ignores hidden, declaration-only, nested and non-module files. File-loaded declarations require explicit `memory` grants; programmatic declarations may omit them.

Every identity segment uses `[a-z0-9][a-z0-9-]*`, validated without normalization before provider/model preparation. An id is one segment or exactly `segment/segment`. A supplied domain is one segment and requires a one-segment id; omit domain for a pre-qualified id. `{ domain: "archive", id: "writer" }` and `{ id: "archive/writer" }` yield the same identity. Proposals require a qualified writer. `resourceDomain` remains lookup only, never identity authority.

`tools` is a preset or exact name array. Empty exact arrays expose no executable tools; presets retain extension-tool exposure. Capability and skill text alone does not grant executable tools. Unknown executable names fail after provider loading and before a model request. Host policies do not expand exact grants.

Declared instructions have identity markers stripped before the host appends its marker. Prompt markers are compatibility metadata, not a trust boundary or an operating-system sandbox. Project context can append later text. Resource-domain selection must not change delegation identity or grant internal-skill visibility.

Resume/fork rebuild from the current declaration: these are restore-by-id paths with accepted drift, not restoration of an immutable configuration snapshot.

## Consumer runtime

`CosmonautsRuntime.create` accepts explicit `agents`, `chains`, `domains`, `domainSources`, and `projectConfig`; no built-in directory is required. Explicit `domainSources` (including `[]`) overrides source scanning. Package/domain stores are opt-in via `discoverPackages`; directory and plugin roots are explicit inputs. Relative `pluginDirs` resolve against `projectRoot`.

Duplicate agent, domain and chain declarations in a runtime collection fail before execution. This does not change the layering overwrite contract of `AgentRegistry.register`. Qualified programmatic agents need no resource-domain manifest.

A consumer chooses roots, model default, chain adapter, worker and session policies. `defaultModel` is host runtime input; an adapter default is used only when that explicit option is absent. A session model resolves explicit override, declaration, then consumer default. Missing all three fails before requesting a model. The CLI supplies its own model fallback.

`SpawnConfig.runtime`, `ChainConfig.runtime` and the options to `createPiSpawner` require an explicit runtime. A spawner accepts only the runtime object it was created with; another runtime fails without creating a session. The durable runner and Drive subagent backend forward the supplied runtime. The required-runtime type tests and runtime-isolation suites pin this contract.

`createAgentSessionFromDefinition`, from `cosmonauts/orchestration/session-factory`, creates a configured Pi session without prompting it. The caller owns prompting and disposal. Pass the definition, spawn config, optional domain directory (or `undefined`), and optional resolver. The README shows the complete call.

The host locator is a separate entry, `cosmonauts/runtime-host` (`setRuntimeHost`, `getHostRuntime`). Equal project/domain/plugin requests share construction, failed construction can retry, and an unconfigured host fails explicitly. Explicit library session assembly and nested orchestration retain the supplied runtime.

The CLI's inline orchestration factories use its base host request (project root only), excluding interactive plugin directories and domain override. Those flags still govern interactive selection, resources and agent switching. A caller available only in that added scope cannot resolve for spawn/chain. Inline factories stay bound to the launch runtime after a cross-project resume; chain/Drive still receive the current cwd. No cross-project refusal guard is claimed.

Configured chains are a runtime collection: edits to project config require runtime reconstruction. There is no per-call config reread.

## Memory grants

Model-facing memory operations and episode capture use host-approved `AgentDefinition.memory` grants, rather than privileged names or shim paths. Permissions do not replace project gates, storage policy, human promotion, scope restrictions or retirement policy.

| Group | Contract |
| --- | --- |
| `knowledge` | Defaults true; enables knowledge recall/index only when the project knowledge gate is on. Explicit false opts out. |
| `authored` | Defaults false; enables authored remember/recall and context. |
| `proposals` | Defaults false; enables proposal writing with the declared qualified writer. |
| `architecture` | Defaults false; enables architecture-map detail reads and context. |
| `episodes` | Defaults false; authorizes agent-owned capture, still subject to the project episodic-log gate. |

The enabled mode uses one grant-selected knowledge-surface composer. The disabled mode uses grant-bound authored/architecture factories and retains its record filtering; it does not acquire universal knowledge recall merely because that grant defaults on. Knowledge opt-out disables the knowledge index and recall while authored recall remains available with its own grant.

Runner-owned chain capture is independent of agent grants. New consumers default `episodes` to false; a declaration or consumer adapter can opt in. Operator memory/architecture CLIs perform maintenance independently of model-facing grants. They do not silently confer those operations on an agent. See [Memory](memory.md) for stores, retrieval bounds and authority.

## Extension providers and session policy

Selected directory/resolver providers take precedence. When a selected name is absent, host `extensionProviders` and native providers are fallback inputs. Native names include tasks, plans, init, agent-switch, observability, project-tools and todo. Legacy memory extension selections are rejected; use memory grants instead.

A provider may explicitly value-export `createSessionExtension(context)` as a named function, variable or named re-export. The context carries host identity, resolved grants, execution runtime and discovery runtime. Providers can return a Pi inline factory or `undefined` when central memory composition owns registration. Only selected providers are evaluated. Ordinary extension directories without that hook continue through Pi's path loader.

The host session-policy port provides assembly/tool/resource/transcript policy and child admission. It is host code, never model tool input. Explicit runtime `sessionPolicies` wins over manifest composition. One active declaring provider can supply policy; two distinct provider objects fail with `AmbiguousSessionPolicyProviderError`. Omitted higher-layer policy inherits the lower provider.

Resource policy accepts only `appendSystemPrompt`, `agentsFilesOverride`, `additionalExtensionPaths` and `extensionFactories`. It cannot override arbitrary session settings through that object. The policy types have no dedicated package export.

## Domains and bindings

| Field | Meaning | Layering and host rule |
| --- | --- | --- |
| `id`, `description` | Resource-provider identity and description | Names have no built-in significance |
| `lead` | Agent used when a mode selects the domain lead | Optional; not a prerequisite for general runnability |
| `portable` | Allows its resources to participate in portable lookup | Independent of activation, fallback and default |
| `alwaysActive` | Participates despite an active-domain filter | Highest layer wins; dropping a lower true flag warns |
| `resourceFallback` | Final resource-lookup tier | Highest layer wins; no implicit provider name |
| `default` | Consumer-selected default resource domain/lead | At most one active default; omission drops and warns |
| `internal.agents`, `.skills`, `.chains` | Hide listed assets from outside the owning domain | Resource borrowing grants no private visibility |
| `sessionPolicies` | Optional composed policy metadata | Omission inherits; distinct providers conflict; explicit host choice wins |


`init` is optional inline or absolute-file bootstrap instructions. The CLI and `/init` require it before starting bootstrap. Domain authoring and activation are documented in [domains.md](domains.md).

The CLI mounts `lib/extensions/agent-switch/` and `lib/extensions/domain-bindings/` directly, including with zero discovered domains. Live binding changes affect future resolution; running sessions and stages retain their resolved declarations. Resume/fork replays validated session entries through the resolver before updating the project-scoped live store.

## Chains and Drive

`NamedChain` requires exactly one DSL `chain` string or explicit `stages`, and accepts `episodes`. Import selection and dispatch from `cosmonauts/chains` (`selectChain`, `runConfiguredChain`). The parser returns topology only: sequence, bracket group or fan-out. It infers no role purpose, completion policy or terminal executor.

The runtime carries consumer `chainAdapter` and `workerAgent`. An adapter can classify stages, build prompts, supply terminal gates and set defaults. Stage bindings and declaration defaults are collected once; execution retains the bound reference.

| Stage field | Contract |
| --- | --- |
| `stageId` | Validated unique occurrence identity; generated deterministically if omitted. Declared ids map to safe durable topology ids, and producer selectors persist that mapping. Repeated and parallel actors remain distinct. |
| `purpose` | `default`, `plan-review` or `plan-revision`; review/revision carry `targetStageIds`. Author identity is derived by the consumer. |
| `reviewTarget` | Active-plan-review selector with eligible `producerStageIds`; addressed evidence must match both that occurrence and the current review round. |
| `requiresPlanReviewTarget` | Explicit pre-spawn artifact gate, including strict preceding topology order. |
| `expectedPlanSlug` | Top-level restriction on every normalized stage. Core retains the `plan:<slug>` completion-label convention as part of its plans-tool protocol. |
| `completionPolicy` | `once` or function-bearing `state`; boolean `completionCheck` is wrapped into state and cannot conflict with an explicit policy. A public loop without a state policy is an immediate error outcome, with no implicit task-store evaluator. |
| `prompt`, `instruction` | Raw stage override and adapter-built operational instruction respectively. `User request:` retains append semantics. Terminal executors receive the raw override; both strings persist separately. |
| `terminalGate` | Consumer executor key; terminal sequential non-loop placement and key availability validate before any execution. Errors remain typed values so a consumer can retain durable refusal artifacts. |
| `model`, `thinkingLevel` | Resolved once from stage/consumer overrides, the bound declaration and host defaults. Model/thinking maps accept open declaration keys. Missing model/default is an input error. |


Function-bearing policies, loops and completion labels route inline. The durable compiler refuses inline-only input before graph writes; callbacks and opaque terminal host context are never serialized. Durable chains cannot resume.

Drive requires consumer `workerAgent`, with no worker spelling or domain fallback. Capture still requires the selected worker's episodes grant. Frozen execution uses its stored identity without live rebinding. Missing actors skip capture non-fatally rather than inventing provenance. Every Drive run supplies its own envelope.

See [Orchestration](orchestration.md) for runners, events, CLI and observation.

## Consumer proof

`tests/packed-package.test.ts` packs the actual package and exercises exports, the binary and a consumer without repository content. `tests/library-consumer.test.ts` verifies programmatic declarations, grant-bound memory and consumer policies; `tests/consumer-runtime.test.ts` verifies collection and runtime construction. The package includes library code, CLI and theme; developer records and domain content are not required.

## Compatibility model metadata

`DomainManifest.defaultModel` is unused metadata. Agent declarations and explicit host runtime options supply model policy; no production reader uses the manifest field.
