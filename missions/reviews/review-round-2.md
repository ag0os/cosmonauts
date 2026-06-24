# Review Report

base: main
range: 0505ef9145b7a0a6e7e7a010489aa7626775ba80..HEAD
overall: incorrect

## Overall Assessment

The round-1 findings are resolved in the diff with targeted code and regression coverage. The branch still has correctness gaps in the new domain-binding integration: bound default-domain chains are not resolvable through the CLI named-chain path, internal-agent visibility uses the session default role rather than the actual caller domain in orchestration tools, and already-resolved binding targets can be rebound during spawn execution.

## Prior Findings

- id: F-001
  status: resolved
  evidence: `resolveHiddenSkillNames()` now subtracts only explicitly hidden internal skill names (`lib/agents/skills.ts:106`), and regressions cover recursive public skills plus project/extra skill-path skills remaining visible (`tests/agents/skills.test.ts:237`, `tests/agents/skills.test.ts:267`).
- id: F-002
  status: resolved
  evidence: `validateDomains()` now calls `validateInternalDenyList()` (`lib/domains/validator.ts:77`), which emits actionable diagnostics for absent internal entries (`lib/domains/validator.ts:121`), with test coverage for absent internal agents, skills, and chains (`tests/domains/validator.test.ts:101`).
- id: F-003
  status: resolved
  evidence: `resolveNamedChain()` now checks hidden chain provenance and throws `InternalNamedChainAccessError` (`lib/chains/loader.ts:105`), and the CLI regression verifies internal named-chain access no longer falls back to DSL (`tests/cli/run/subcommand.test.ts:326`).
- id: SR-001
  status: resolved
  evidence: package domain paths are normalized and rejected when absolute or escaping (`lib/packages/manifest.ts:149`), with manifest/install/scanner regressions for invalid absolute and traversal paths (`tests/packages/manifest.test.ts:312`, `tests/packages/installer.test.ts:259`, `tests/packages/scanner.test.ts:279`).
- id: UX-001
  status: resolved
  evidence: root-domain install errors now include corrective actions for mixed root packages and missing root `domain.ts` (`lib/packages/installer.ts:260`, `lib/packages/installer.ts:273`).
- id: UX-002
  status: resolved
  evidence: the domain authoring examples now use package imports instead of repo-relative `../../lib/...` paths (`docs/domains.md:78`, `docs/domains.md:105`).
- id: C-005
  status: resolved
  evidence: fallow dynamic-load patterns were updated for the migrated bundled root layout and chain files (`fallow.toml:31`, `fallow.toml:32`, `fallow.toml:36`), with matching documentation updates (`docs/fallow-exceptions.md:57`).

## Findings

- id: F-004
  priority: P2
  severity: medium
  confidence: 0.9
  complexity: simple
  dimensions: correctness
  title: "[P2] CLI named-chain lookup ignores bound default-domain chains"
  files: cli/run/subcommand.ts
  lineRange: cli/run/subcommand.ts:262-270
  location: cli/run/subcommand.ts:270
  summary: When project config binds the default domain role, `CosmonautsRuntime.create()` computes `runtime.chains` from the resolved target domain, but `cosmonauts run chain <name>` discards that list and rebuilds a domain source with the original `runtime.domainContext`. In a project with `domain: "coding"` and `domainBindings: { coding: "ruby-coding" }`, named chains defined only by `ruby-coding` are present in `runtime.chains` but `resolveNamedChain()` only searches the `coding` domain source here, so the CLI reports an unknown chain or falls back to DSL instead of executing the bound domain's chain.
  suggestedFix: Build the named-chain source with the effective bound domain context, or preserve unfiltered chain provenance on the runtime alongside the same resolved context used to populate `runtime.chains`.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. With a bound default domain role, `cosmonauts run chain <target-domain-chain>` resolves a chain from the bound target domain.
      2. Internal-chain diagnostics still distinguish hidden chains from missing names.

- id: F-005
  priority: P1
  severity: high
  confidence: 0.86
  complexity: complex
  dimensions: correctness|authorization
  title: "[P1] Orchestration tools check internal visibility as the default domain, not the caller"
  files: domains/shared/extensions/orchestration/spawn-tool.ts, domains/shared/extensions/orchestration/chain-tool.ts, lib/agents/resolver.ts
  lineRange: domains/shared/extensions/orchestration/spawn-tool.ts:469-492
  location: domains/shared/extensions/orchestration/spawn-tool.ts:489, domains/shared/extensions/orchestration/chain-tool.ts:115
  summary: `spawn_agent` resolves the target with `runtime.domainContext`, and `chain_run` parses stages with the same session context, while `AgentRegistry.isVisible()` grants internal access whenever the requester domain equals the target domain. In a session whose default domain is the target domain, a caller from another domain can resolve an agent listed in that target's `manifest.internal.agents` (subject to its subagent allowlist), so cross-domain internal assets are not consistently refused by consuming-agent paths.
  suggestedFix: Separate the default role used for unqualified resolution from the requester domain used for public-surface checks; extract the caller identity and pass the caller's domain into target visibility checks for both spawn and chain tools.
  task:
    title: Thread caller-domain visibility through orchestration tools
    labels: domains, orchestration, internal-visibility
    acceptanceCriteria:
      1. A non-owner caller cannot spawn an agent named in another domain's `manifest.internal.agents` when the session default domain is the target domain.
      2. `chain_run` uses the caller domain for internal-agent visibility while preserving default-domain binding for unqualified stage names.

- id: F-006
  priority: P2
  severity: medium
  confidence: 0.82
  complexity: complex
  dimensions: correctness
  title: "[P2] Resolved binding targets can be rebound during spawn execution"
  files: lib/orchestration/agent-spawner.ts, lib/orchestration/chain-runner.ts, lib/agents/resolver.ts
  lineRange: lib/orchestration/agent-spawner.ts:175-177
  location: lib/orchestration/agent-spawner.ts:177
  summary: Spawn execution uses `config.agentReference.resolved.qualifiedId` as the execution role, but then calls `registry.get()` with the binding-aware registry. If config binds `a -> b` and also binds `b -> c`, `resolveReference("a/worker")` records `b/worker` as the resolved target, while this later lookup re-applies the `b -> c` binding and can spawn `c/worker` (or fail if only `b/worker` exists), making execution inconsistent with the stored resolved reference.
  suggestedFix: When an `agentReference` is already present, look up the resolved qualified id without applying domain bindings again, or carry the resolved `AgentDefinition` through to spawn preparation.
  task:
    title: Avoid rebinding resolved agent references during execution
    labels: domains, orchestration, bindings
    acceptanceCriteria:
      1. A resolved agent reference is treated as the final execution target even when the target role has its own binding.
      2. Chain and durable-chain spawn paths use the same non-rebinding lookup behavior.
