# Plan Review: domain-authoring

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Root package migration omits the bundled-package scanner path"
  plan_refs: plan.md:54-62, plan.md:341-365, plan.md:383-392, plan.md:508
  code_refs: lib/packages/scanner.ts:59-67, lib/packages/scanner.ts:145-157, lib/packages/dev-bundled.ts:37-52, bundled/coding/cosmonauts.json:1-6
  description: |
    The plan makes `path: "."` a `domain-root` source and then collapses `bundled/coding/coding/**` into `bundled/coding/**`. That contract is described for package manifests generally, but the actual dev-mode bundled path does not go through `addPackageSources()` or manifest-aware installed-package handling: `scanDomainSources()` directly pushes each `bundledDir` as a `domainsDir` with no manifest read and no source kind.

    After `bundled/coding/cosmonauts.json` changes to `domains: [{ "name": "coding", "path": "." }]`, `discoverBundledPackageDirs()` will still return the package root, and scanner lines 59-67 will expose that root as a directory containing child domains. With the domain moved to the package root, `loadDomains()` will scan child directories and miss `domain.ts` at the root. The dogfooded coding domain can disappear in framework dev mode unless the plan explicitly routes bundled package dirs through the same manifest-to-`domain-root` logic as installed packages.

- id: PR-002
  dimension: state-sync
  severity: high
  title: "Active-only conflict policy cannot be implemented with the current loader contract"
  plan_refs: plan.md:27, plan.md:164-172, plan.md:297-302, plan.md:479-485
  code_refs: lib/domains/types.ts:26-50, lib/domains/types.ts:60-88, lib/domains/loader.ts:143-185, lib/runtime.ts:123-145
  description: |
    The plan requires same-precedence conflicts only for active providers and requires the error to name both origins. The current loader merges conflicts inside `loadDomainsFromSources()` before runtime has an active-domain set, and `LoadedDomain`/`DomainMergeConflict` do not carry source origin or source precedence beyond the transient `DomainSource` currently being iterated.

    Runtime also validates the fully loaded domain list before any planned active-domain filtering point. A worker who follows "filter after source loading and before registries" can still leave inactive domains participating in validation or conflict handling, and the loader still cannot produce the B-013 error with both origins. The plan needs a concrete provenance/active-filtering contract for loaded source entries before conflict detection and validation.

- id: PR-003
  dimension: state-sync
  severity: medium
  title: "Live binding extension has no specified bridge to the resolver it must mutate"
  plan_refs: plan.md:304-314, plan.md:420, plan.md:446-449, plan.md:520
  code_refs: lib/interactive/agent-switch.ts:7-59, cli/main.ts:522-546, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:208-218, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:246-252, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:870-871
  description: |
    The live `/domain-bind` command must validate active targets, update the live binding used by future resolution, and rehydrate from custom session entries. But an injected Pi extension factory receives only `pi`; command handlers receive an `ExtensionCommandContext` with `cwd` and a read-only `sessionManager`, not the CLI runtime, `DomainRegistry`, or binding resolver. The existing process-global bridge (`lib/interactive/agent-switch.ts`) exposes only an `AgentRegistry` and `domainContext` for `/agent` validation.

    The plan says the extension will be injected through `extraExtensionPaths` and says sharing registry/binding resolver slots is optional. For B-010/B-011/B-012 this is not optional: the extension must either receive or reconstruct exactly the same active-domain/binding state used by `AgentRegistry`, chain tools, spawn tools, and session switching. Otherwise `/domain-bind` can validate against one runtime and future resolutions can read another, especially with the orchestration extension's independent runtime cache.

- id: PR-004
  dimension: behavior-spec
  severity: medium
  title: "Exports behavior is only executable for agents, not for skills and chains"
  plan_refs: plan.md:84-102, plan.md:332-338, plan.md:433, plan.md:437, plan.md:512-518
  code_refs: lib/agents/skills.ts:73-130, lib/chains/loader.ts:13-25, lib/runtime.ts:143-154
  description: |
    The spec and plan include agents, skills, and chains in the `exports` contract, and the design says chains and skills must use `public-surface.ts`. The behavior spine, however, only names a public-surface unit test and an agent resolver internal-access test. There is no behavior that proves an unexported skill is absent from a cross-domain agent's Pi skill catalogue, and no behavior that proves an unexported chain is refused or hidden for an outside consumer while remaining visible same-domain.

    This matters because the current seams are not close to the agent resolver. Skill exposure currently returns `undefined` for wildcard agents with no project skill filter, which means Pi sees all discovered skills, and chain selection currently filters only by `domainContext`/`shared`. Without executable chain/skill behaviors, a worker can satisfy B-006 for agents and leave two-thirds of AC-005 reachable.

- id: PR-005
  dimension: interface-fidelity
  severity: medium
  title: "Requested role and resolved target need explicit type-level separation"
  plan_refs: plan.md:316-330, plan.md:439-445, plan.md:516
  code_refs: lib/orchestration/types.ts:27-37, lib/orchestration/types.ts:340-345, domains/shared/extensions/orchestration/authorization.ts:7-20, domains/shared/extensions/orchestration/spawn-tool.ts:489-518, lib/orchestration/durable-chain-compiler.ts:253-263
  description: |
    The plan correctly requires authorization and errors to preserve the requested role string while execution uses the resolved target domain. The current orchestration types have only `ChainStage.name` and `SpawnConfig.role`, and durable compilation persists `role: stage.name`; there is no separate field for `requestedRole`, `resolvedDomain`, or `resolvedAgentId`. Authorization currently receives only `callerDef` and `targetDef`, so it cannot match the requested bound reference except through ad hoc call-site parameters.

    If workers implement binding by rewriting `stage.name` or `params.role` to the target (`ruby-experimental/worker`), allowlists and user-facing messages that should still accept/report `ruby-coding/worker` will regress. The plan should define the shared data shape for requested-vs-resolved references before tasks split across parser, runner, durable compiler, spawn tool, and authorization.

- id: PR-006
  dimension: behavior-spec
  severity: medium
  title: "Behavior-spine artifact gate will fail before implementation evidence exists"
  plan_refs: plan.md:84-192, plan.md:498-504
  code_refs: domains/shared/skills/work-artifacts/references/behavior-spine.md:47-51, tests/domains/public-surface.test.ts:missing, tests/domains/bindings.test.ts:missing, tests/extensions/domain-bindings.test.ts:missing, tests/docs/domain-authoring.test.ts:missing
  description: |
    The Quality Contract makes `artifact-conformance` a bound hard-fail gate, and the artifact contract says referenced test files must exist and contain the exact behavior marker. Several referenced test files do not exist yet, and none of the `@cosmo-behavior plan:domain-authoring#B-###` markers are present in the existing test tree.

    If this gate is intended to run only after workers add the tests, the plan should say that the task acceptance criteria include creating the referenced files/markers before artifact-conformance is evaluated. As written, the plan's own hard-fail gate has no current evidence path.

- id: PR-007
  dimension: architecture-record
  severity: low
  title: "Architecture Context cites decisions that are not structured in the architecture record"
  plan_refs: plan.md:16-27
  code_refs: missions/architecture/domains.md:1-7, missions/architecture/domains.md:37-63, missions/architecture/domains.md:122-145, domains/shared/skills/work-artifacts/references/architecture-format.md:15-32
  description: |
    The plan says it implements durable decisions from `missions/architecture/domains.md`, but that record is roadmap-shaped and does not contain the canonical `## Decision Log` with `D-###` entries, nor the required `## Boundary Model` / `## Current Architecture` / `## Target Architecture` / `## Plan Links` sections. The plan therefore paraphrases decisions instead of naming durable decision IDs and boundary rules.

    This is not a code-breaker, but it weakens architecture review: workers and reviewers cannot tell which statements are binding decisions versus background roadmap context. Either the architecture record needs a small structural update, or the plan should stop presenting paraphrased roadmap bullets as decision-log references.

## Missing Coverage

- Active-domain filtering needs an explicit behavior for an invalid or conflicting inactive domain not breaking startup when it is excluded by `activeDomains`.
- The bundled dev-mode package path needs its own `path: "."` behavior; B-002 only describes installed package scanning.
- AC-005 needs executable integration behaviors for unexported skills and unexported chains, not only agents/public-surface units.
- Live binding rehydration needs a behavior covering the orchestration extension's cached runtime after resume/fork, not just the command extension's local store.
- Package installation validation should cover `path: "."` with a missing root `domain.ts`, not only missing subfolder directories.

## Assessment

The plan is directionally viable, but it needs revisions before task handoff. The most important fix is the domain-source/provenance model: root package loading, bundled package migration, active-domain filtering, and same-precedence conflict diagnostics all depend on getting that contract right before workers split across scanner, loader, and runtime.
