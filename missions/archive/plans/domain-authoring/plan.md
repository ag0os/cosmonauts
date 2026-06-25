---
title: 'Domain Authoring Contract — Structure, Config & Inter-Domain Access'
status: active
createdAt: '2026-06-23T00:00:00.000Z'
updatedAt: '2026-06-23T21:05:57.000Z'
---

## Overview

Implement the Domain Authoring Contract as a planned feature/refactor slice of the domains track: formalize the existing convention loader, make single-domain package roots load as domains, move framework prompts out of domain `prompts/`, add provider-side visibility (an `internal` deny-list), add consumer-side domain-role bindings with project-config and live-session switching, and document the authoring model.

The work is not greenfield. It builds on the existing convention engine in `lib/domains/loader.ts`, four-layer assembly in `lib/domains/prompt-assembly.ts`, typed manifests/agent definitions in `lib/domains/types.ts` and `lib/agents/types.ts`, project config in `lib/config/types.ts`, the package scanner/installer in `lib/packages/`, and the existing interactive switch bridge in `lib/interactive/agent-switch.ts` / `domains/shared/extensions/agent-switch/index.ts`.

Non-goals for this plan remain: domain routing/auto-pick, TS-to-JSON/YAML declarative migration, domain inheritance/composition, extracting `coding` to a separate repo, and writing new domain content.

## Architecture Context

This plan implements the S1 boundary/contract slice described by `missions/architecture/domains.md`, plus the new visibility/binding mechanism from the product spec.

`missions/architecture/domains.md` is currently roadmap-shaped, not a structured architecture record with `D-###` decision IDs. Treat it as forward architecture context and boundary direction; this plan records the slice-specific implementation decisions below so workers have binding contracts even without architecture-record IDs.

Relevant durable context from the architecture record and spec:

- Domains are the packaging unit for agents, personas, capabilities, skills, extensions, tools, and chains.
- `domain.ts`, `agents/*.ts`, and `chains.ts` stay typed TypeScript; author-written prose stays markdown.
- A domain is discovered by convention; `domain.ts` is the manifest seam.
- `shared` remains the framework stdlib/fallback domain for capabilities, skills, and extensions, but framework base/runtime prompt templates are framework-owned, not domain personas.
- Qualified agent references keep the shape `<domain-role>/<agent-id>`; the domain-role segment is a string that defaults to the same-named domain and can be redirected by binding.
- Multi-source loading and precedence remain. Same-precedence active providers with the same manifest id are conflicts; different-precedence providers keep the existing override/merge customization model.

## Behaviors

Acceptance criteria IDs used below are assigned from the spec in order:

- AC-001: conventional domain folder loads with no registration.
- AC-002: single-domain package root is the domain.
- AC-003: adding an agent is `agents/<id>.ts` plus `prompts/<id>.md`.
- AC-004: domain `prompts/` contains only personas; framework base/runtime prompts are elsewhere.
- AC-005: no `internal` declared means public-all; declaring `internal` hides only the named assets; unnamed assets and omitted asset-type lists stay public.
- AC-006: a role with no binding resolves to the same-named domain.
- AC-007: one project-config binding redirects a role to another domain.
- AC-008: the same binding can change live during a session.
- AC-009: authoring documentation is sufficient to build a domain.
- AC-010: all listed failure flows produce actionable messages.

### B-001 - Conventional domain folder loads without registration

- Source: AC-001, AC-003
- Context: a domain source contains `alpha/domain.ts`, `alpha/agents/coach.ts`, and `alpha/prompts/coach.md`.
- Action: the runtime loads that source and resolves `alpha/coach`.
- Expected: the `alpha` domain and `coach` agent are registered without any separate registration file, and prompt assembly uses `prompts/coach.md` by agent id.
- Seam: `lib/domains/loader.ts`, `lib/agents/resolver.ts`, `lib/domains/prompt-assembly.ts`
- Test: `tests/domains/loader.test.ts` > `loads a conventional domain and its parallel persona without registration`
- Marker: `@cosmo-behavior plan:domain-authoring#B-001`

### B-002 - Installed single-domain package root is loaded as the domain

- Source: AC-002
- Context: an installed package has `cosmonauts.json` with one domain entry `{ "name": "alpha", "path": "." }` and `domain.ts` at the package root.
- Action: package sources are scanned and loaded.
- Expected: the package root is treated as the domain root; no `alpha/alpha` nesting is required, and multi-domain packages with subfolder paths still load through their parent directory.
- Seam: `lib/packages/scanner.ts`, `lib/packages/types.ts`, `lib/domains/types.ts`, `lib/domains/loader.ts`
- Test: `tests/packages/scanner.test.ts` > `treats an installed single-domain package path dot as a domain-root source`
- Marker: `@cosmo-behavior plan:domain-authoring#B-002`

### B-003 - Domain scaffold emits the canonical root layout

- Source: AC-001, AC-002, AC-009
- Context: an author runs the domain scaffold for `alpha`.
- Action: `scaffoldDomain("alpha")` creates the package.
- Expected: files are created under `alpha/domain.ts`, `alpha/agents/`, `alpha/prompts/`, `alpha/capabilities/`, `alpha/skills/`, `alpha/extensions/`, and `alpha/cosmonauts.json` declares `path: "."`.
- Seam: `cli/create/subcommand.ts`
- Test: `tests/cli/create/subcommand.test.ts` > `scaffolds a single-domain package with the domain at package root`
- Marker: `@cosmo-behavior plan:domain-authoring#B-003`

### B-004 - Framework prompts load from framework-owned paths

- Source: AC-004
- Context: framework base and sub-agent runtime templates live under `lib/prompts/framework/`, while a domain `prompts/` directory contains only agent persona files.
- Action: prompt assembly builds a top-level and sub-agent prompt.
- Expected: layer 0 uses `lib/prompts/framework/base.md`, layer 3 uses `lib/prompts/framework/runtime/sub-agent.md`, layer 2 still uses `<domain>/prompts/<agent-id>.md`, and no runtime path requires framework prompts from a domain persona directory.
- Seam: `lib/prompts/loader.ts`, `lib/domains/prompt-assembly.ts`, `lib/agents/session-assembly.ts`
- Test: `tests/domains/prompt-assembly.test.ts` > `loads framework base and runtime prompts outside domain persona directories`
- Marker: `@cosmo-behavior plan:domain-authoring#B-004`

### B-005 - Default-public exposes all agents, skills, and chains when no `internal` is declared

- Source: AC-005
- Context: a target domain declares agents, skills, and chains but omits `manifest.internal`.
- Action: a different domain asks whether those assets are public.
- Expected: every discovered agent, skill, and chain in the target domain is public by default.
- Seam: `lib/domains/public-surface.ts`
- Test: `tests/domains/public-surface.test.ts` > `treats all assets as public when internal is omitted`
- Marker: `@cosmo-behavior plan:domain-authoring#B-005`

### B-006 - An `internal` deny-list hides only the named agents; unnamed agents stay public

- Source: AC-005, AC-010
- Context: a target domain declares `internal: { agents: ["internal-agent"] }` and also contains `public-agent`.
- Action: another domain resolves listed and unlisted agents.
- Expected: `internal-agent` is refused as internal to its domain, not reported as missing; `public-agent` (not named, and any agent in a domain without an `internal.agents` list) resolves normally. An asset type absent from the `internal` object (e.g. no `internal.skills`) leaves that whole asset type public.
- Seam: `lib/domains/types.ts`, `lib/domains/public-surface.ts`, `lib/agents/resolver.ts`
- Test: `tests/agents/resolver.test.ts` > `reports an internal-agent error distinct from not found for assets named in the internal deny-list`
- Marker: `@cosmo-behavior plan:domain-authoring#B-006`

### B-007 - Role references default to the same-named active domain

- Source: AC-006
- Context: active domains include `ruby-coding`, with no binding override for role `ruby-coding`.
- Action: a consumer resolves `ruby-coding/worker`.
- Expected: the role `ruby-coding` resolves to domain `ruby-coding` and the `worker` agent is resolved from that domain.
- Seam: `lib/domains/bindings.ts`, `lib/agents/resolver.ts`
- Test: `tests/domains/bindings.test.ts` > `resolves an unbound role to the same-named domain`
- Marker: `@cosmo-behavior plan:domain-authoring#B-007`

### B-008 - Project-config binding redirects a role without changing consumers

- Source: AC-007
- Context: `.cosmonauts/config.json` contains `domainBindings: { "ruby-coding": "ruby-experimental" }`, both domains are active, and a consumer still references `ruby-coding/worker`.
- Action: the runtime resolves that agent reference.
- Expected: the reference resolves to `ruby-experimental/worker`; subagent allowlists that contain the requested reference `ruby-coding/worker` remain valid without edits.
- Seam: `lib/config/loader.ts`, `lib/runtime.ts`, `lib/domains/bindings.ts`, `lib/agents/resolver.ts`, `domains/shared/extensions/orchestration/authorization.ts`
- Test: `tests/runtime.test.ts` > `applies project domain bindings when resolving qualified agent references`
- Marker: `@cosmo-behavior plan:domain-authoring#B-008`

### B-009 - Binding to a missing or inactive target fails at startup/use

- Source: AC-010
- Context: project config binds role `ruby-coding` to target `ruby-experimental`, but `ruby-experimental` is not installed or is excluded by `activeDomains`.
- Action: the runtime validates config and/or the consumer resolves `ruby-coding/worker`.
- Expected: the error names the unresolved role and target domain and says the target is not active/installed.
- Seam: `lib/domains/bindings.ts`, `lib/runtime.ts`, `lib/config/loader.ts`
- Test: `tests/runtime.test.ts` > `rejects a binding whose target domain is not active`
- Marker: `@cosmo-behavior plan:domain-authoring#B-009`

### B-010 - Live binding switch affects future resolutions without restarting

- Source: AC-008
- Context: an interactive session has role `ruby-coding` currently resolving to `ruby-coding`.
- Action: the operator runs `/domain-bind ruby-coding ruby-experimental`.
- Expected: the command records the switch in the session, updates the shared live binding store, and future agent/spawn/chain resolutions of `ruby-coding/*` use `ruby-experimental/*` without restarting the session. Already-running agents and spawned children keep the agent definition they started with.
- Seam: `domains/shared/extensions/domain-bindings/index.ts`, `lib/domains/bindings.ts`, `lib/interactive/domain-bindings.ts`, `cli/main.ts`, `cli/session.ts`, `domains/shared/extensions/orchestration/spawn-tool.ts`, `domains/shared/extensions/orchestration/chain-tool.ts`
- Test: `tests/extensions/domain-bindings.test.ts` > `updates the live binding and persists the switch as a session custom entry`
- Marker: `@cosmo-behavior plan:domain-authoring#B-010`

### B-011 - Live switch with no target leaves the current binding intact

- Source: AC-010
- Context: live role `ruby-coding` currently resolves to `ruby-coding`, and the operator requests `/domain-bind ruby-coding missing-domain`.
- Action: the command validates the target against the same active-domain registry used by future resolution.
- Expected: the command reports that `missing-domain` is not active/installed and leaves the previous effective binding unchanged.
- Seam: `domains/shared/extensions/domain-bindings/index.ts`, `lib/domains/bindings.ts`, `lib/interactive/domain-bindings.ts`
- Test: `tests/extensions/domain-bindings.test.ts` > `rejects an unavailable live target without changing the current binding`
- Marker: `@cosmo-behavior plan:domain-authoring#B-011`

### B-012 - Live binding state rehydrates from the session record

- Source: AC-008, AC-010
- Context: a session branch contains prior `cosmonauts.domain-binding` custom entries for role switches.
- Action: the domain-binding extension receives `session_start` after resume, fork, or `/agent` new-session replacement.
- Expected: the latest valid entry per role is replayed into the project-scoped live binding store before future resolutions; invalid/stale entries are ignored with a warning rather than fabricating defaults.
- Seam: `domains/shared/extensions/domain-bindings/index.ts`, `lib/domains/bindings.ts`, `lib/interactive/domain-bindings.ts`
- Test: `tests/extensions/domain-bindings.test.ts` > `rehydrates live bindings from session custom entries on session_start`
- Marker: `@cosmo-behavior plan:domain-authoring#B-012`

### B-013 - Same-precedence active domain ID conflicts are explicit

- Source: AC-010
- Context: two active domain providers at the same precedence both declare manifest id `alpha`.
- Action: domains are loaded from sources with provenance.
- Expected: loading fails with a domain ID conflict naming `alpha` and both source origins; higher-precedence override/merge providers continue to use the existing merge semantics.
- Seam: `lib/domains/loader.ts`, `lib/domains/types.ts`
- Test: `tests/domains/loader.test.ts` > `reports same-precedence domain id conflicts instead of silently merging`
- Marker: `@cosmo-behavior plan:domain-authoring#B-013`

### B-014 - Missing persona errors name the expected file path

- Source: AC-003, AC-010
- Context: a non-shared domain declares `agents/worker.ts` but does not have `prompts/worker.md`.
- Action: domain validation runs.
- Expected: validation reports an authoring error naming the domain, agent, and expected `prompts/worker.md` path.
- Seam: `lib/domains/validator.ts`
- Test: `tests/domains/validator.test.ts` > `reports the expected persona path when an agent prompt is missing`
- Marker: `@cosmo-behavior plan:domain-authoring#B-014`

### B-015 - Authoring documentation covers every domain part

- Source: AC-009
- Context: an author reads the documentation for domain authoring.
- Action: the documentation is checked for manifest, agent, persona, capability, skill, extension, chain, the `internal` visibility deny-list, project active domains, and bindings sections.
- Expected: the docs state where each part goes, its file format, how it is declared, and what belongs in `domain.ts` versus `.cosmonauts/config.json`.
- Seam: `docs/domains.md`, `docs/prompts.md`, `README.md`
- Test: `tests/docs/domain-authoring.test.ts` > `documents every domain authoring asset and config split`
- Marker: `@cosmo-behavior plan:domain-authoring#B-015`

### B-016 - Bundled dev-mode root packages remain discoverable

- Source: AC-002
- Context: framework dev mode discovers `bundled/coding` as a bundled package directory, and that package manifest declares `domains: [{ "name": "coding", "path": "." }]`.
- Action: `scanDomainSources()` builds bundled sources and the runtime loads them.
- Expected: `bundled/coding` is routed through the same manifest-aware `domain-root` source logic as installed packages, so `coding/domain.ts` at the package root is loaded and `coding/cody` remains available.
- Seam: `lib/packages/dev-bundled.ts`, `lib/packages/scanner.ts`, `lib/domains/loader.ts`, `lib/runtime.ts`
- Test: `tests/packages/scanner.test.ts` > `routes bundled single-domain package roots through manifest domain-root sources`
- Marker: `@cosmo-behavior plan:domain-authoring#B-016`

### B-017 - Inactive domains are filtered before validation and conflict checks

- Source: AC-010
- Context: project config sets `activeDomains: ["alpha"]`; loaded sources also contain an inactive malformed `beta` domain and two inactive same-id `gamma` providers.
- Action: the runtime loads domains with the active set.
- Expected: inactive `beta` and `gamma` providers do not participate in validation or same-precedence conflict checks; active binding targets still must be present in the filtered active set.
- Seam: `lib/runtime.ts`, `lib/domains/loader.ts`, `lib/domains/validator.ts`, `lib/domains/bindings.ts`
- Test: `tests/runtime.test.ts` > `filters inactive domains before validation and same-precedence conflict checks`
- Marker: `@cosmo-behavior plan:domain-authoring#B-017`

### B-018 - An `internal` deny-list hides named chains from outside the owner domain

- Source: AC-005, AC-010
- Context: domain `ruby-coding` declares `internal: { chains: ["internal-chain"] }` and also defines `public-chain`.
- Action: an outside consumer lists or resolves domain chains, and a same-domain consumer lists or resolves chains.
- Expected: the outside consumer sees/resolves `public-chain` (and any unnamed chain) but gets an internal-chain message for `internal-chain`; same-domain resolution can still use `internal-chain`.
- Seam: `lib/domains/public-surface.ts`, `lib/chains/loader.ts`, `cli/run/subcommand.ts`, `domains/shared/extensions/orchestration/chain-tool.ts`
- Test: `tests/chains/named-chain-loader.test.ts` > `hides chains named in the internal deny-list from outside the owning domain`
- Marker: `@cosmo-behavior plan:domain-authoring#B-018`

### B-019 - An `internal` deny-list hides named skills from cross-domain agents

- Source: AC-005
- Context: domain `ruby-coding` declares `internal: { skills: ["internal-skill"] }` and also contains `public-skill`; another domain's wildcard-skill agent can otherwise see all discovered skills.
- Action: session assembly builds the skills override/catalog for the outside agent.
- Expected: `public-skill` (and any unnamed skill) remains available, `internal-skill` is absent from the outside agent's effective Pi skill catalogue, and same-domain agents can still see `internal-skill`.
- Seam: `lib/domains/public-surface.ts`, `lib/agents/skills.ts`, `lib/agents/session-assembly.ts`, `lib/skills/discovery.ts`
- Test: `tests/agents/skills.test.ts` > `filters internal-listed domain skills from cross-domain agents`
- Marker: `@cosmo-behavior plan:domain-authoring#B-019`

### B-020 - Cached orchestration runtimes observe live binding changes

- Source: AC-008
- Context: the orchestration extension has already cached a `CosmonautsRuntime` for the project, then `/domain-bind ruby-coding ruby-experimental` runs in the interactive session.
- Action: a later `spawn_agent` or `chain_run` resolves `ruby-coding/worker` through the cached orchestration runtime.
- Expected: the cached runtime reads the shared project-scoped live binding store and resolves `ruby-coding/worker` to `ruby-experimental/worker` without rebuilding the runtime.
- Seam: `domains/shared/extensions/orchestration/index.ts`, `domains/shared/extensions/domain-bindings/index.ts`, `lib/domains/bindings.ts`, `lib/interactive/domain-bindings.ts`
- Test: `tests/extensions/domain-bindings.test.ts` > `updates the shared live store used by cached orchestration runtimes`
- Marker: `@cosmo-behavior plan:domain-authoring#B-020`

### B-021 - Package validation rejects root-domain packages without domain.ts

- Source: AC-002, AC-010
- Context: a package manifest declares `domains: [{ "name": "alpha", "path": "." }]` but the package root has no `domain.ts`.
- Action: the package is installed or validated.
- Expected: installation fails before writing to the store with a message naming domain `alpha`, path `.`, and missing `domain.ts`.
- Seam: `lib/packages/installer.ts`, `lib/packages/manifest.ts`
- Test: `tests/packages/installer.test.ts` > `rejects a single-domain root package without a root domain manifest`
- Marker: `@cosmo-behavior plan:domain-authoring#B-021`

### B-022 - `path: "."` is rejected when it is not the only domain in a package

- Source: AC-002, AC-010
- Context: a package manifest declares `domains: [{ "name": "alpha", "path": "." }, { "name": "beta", "path": "beta" }]`.
- Action: the package is installed/validated, or its sources are scanned.
- Expected: validation fails with a message naming the package and the offending `path: "."` entry, stating that a root-domain (`path: "."`) must be the only domain in its package. The package store parent is never scanned as a domains directory.
- Seam: `lib/packages/manifest.ts`, `lib/packages/installer.ts`, `lib/packages/scanner.ts`
- Test: `tests/packages/installer.test.ts` > `rejects a root-domain path when other domains are declared in the same package`
- Marker: `@cosmo-behavior plan:domain-authoring#B-022`

### B-023 - The default `domain` role is redirected by bindings across every default-domain path

- Source: AC-006, AC-007
- Context: project config sets `domain: "ruby-coding"` and `domainBindings: { "ruby-coding": "ruby-experimental" }`, with both domains active.
- Action: the runtime resolves the default lead, lists/resolves domain chains, and looks up per-role model/thinking for the default-domain context (no explicit qualified reference given).
- Expected: all default-domain flows resolve against `ruby-experimental` — the lead comes from `ruby-experimental`, its chains and model/thinking apply — while the requested role string `ruby-coding` is preserved for display and messages. The redirect is not limited to explicit `ruby-coding/<agent>` references.
- Seam: `lib/agents/resolve-default-lead.ts`, `lib/runtime.ts`, `lib/chains/loader.ts`, `lib/orchestration/model-resolution.ts`, `lib/domains/bindings.ts`
- Test: `tests/runtime.test.ts` > `redirects the default domain role through bindings for lead, chains, and model lookup`
- Marker: `@cosmo-behavior plan:domain-authoring#B-023`

### B-024 - A malformed `domainBindings` entry warns instead of being silently dropped

- Source: AC-010
- Context: `.cosmonauts/config.json` contains a malformed `domainBindings` entry (e.g. a non-string value, or an empty target).
- Action: project config is loaded.
- Expected: config still loads (no throw), but the malformed entry produces an actionable diagnostic naming the offending key/value and stating it was skipped; the entry does not silently take effect or silently vanish. Well-formed entries in the same map still apply.
- Seam: `lib/config/loader.ts`
- Test: `tests/config/loader.test.ts` > `warns on a malformed domainBindings entry instead of dropping it silently`
- Marker: `@cosmo-behavior plan:domain-authoring#B-024`

## Design

### Resolved open questions

- **Visibility shape (deny-list, not allow-list):** use a per-asset object naming the assets to *hide*:

  ```ts
  export interface DomainInternal {
    readonly agents?: readonly string[];
    readonly skills?: readonly string[];
    readonly chains?: readonly string[];
  }
  ```

  `internal === undefined` means default-public for all supported asset types. If `internal` is present, only the explicitly named assets are hidden from other domains; **everything not named — and every asset type whose list is omitted — stays public.** This is a deliberate inversion of an allow-list: the failure mode of forgetting to list an asset is that it stays visible (harmless), never that it silently disappears from consumers. Per-asset typing avoids collisions between an agent, skill, and chain with the same name and keeps the type extensible.

- **Live switch surface:** implement a session slash command, not a separate CLI subcommand in this slice. Project config is the persistent surface; `/domain-bind <role> <target-domain>` is the live mid-session surface.

- **In-flight behavior:** a live binding switch affects future resolution only. Already-running top-level sessions, chain stages, and spawned child sessions keep the resolved agent definition, prompt, tools, model, and skills they started with. No cancellation and no prompt mutation occur.

- **Binding target compatibility:** do not enforce a typed shape contract between old and new target domains. Any active domain can be a target. Missing agent/skill/chain names surface as normal resolution errors at use time; internal assets surface as internal-access errors.

- **Role model:** no new typed role registry. A role is a string domain qualifier that resolves to the same-named domain unless `domainBindings` or a live binding redirects it.

- **Framework prompt home:** move base/runtime prompt markdown to `lib/prompts/framework/base.md` and `lib/prompts/framework/runtime/sub-agent.md`. Keep `lib/prompts/loader.ts` as the low-level framework prompt loader and update prompt assembly to inject these paths explicitly.

- **Nested package migration:** hard cut the bundled/scaffolded single-domain convention to root-as-domain. Keep explicit manifest subfolder paths because multi-domain packages require them; do not keep a special same-name nested convention or scaffold. An old package that explicitly declares `path: "coding"` still loads by the generic multi-domain path rule, but docs and first-party layout move to `path: "."`.

### Domain manifest and public surface

Update `DomainManifest` in `lib/domains/types.ts`:

```ts
export interface DomainInternal {
  readonly agents?: readonly string[];
  readonly skills?: readonly string[];
  readonly chains?: readonly string[];
}

export interface DomainManifest {
  readonly id: string;
  readonly description: string;
  readonly lead?: string;
  readonly defaultModel?: string;
  readonly portable?: boolean;
  readonly internal?: DomainInternal;
}
```

Create `lib/domains/public-surface.ts` as the only module that interprets `manifest.internal`. Responsibilities:

- Convert a `LoadedDomain` into public `Set`s for agents, skills, and chains.
- Apply default-public when `internal` is absent (and per asset type, when that type's list is omitted).
- Hide only the named assets when `internal` is present; everything else stays public.
- Validate that names listed in `internal` exist in the loaded domain (you cannot hide what the domain does not provide) and produce authoring diagnostics through `validateDomains()`.
- Distinguish cross-domain `internal` from `not-found` for agents, skills, and chains.

Dependency rule: `public-surface.ts` imports only domain types and has no filesystem or CLI dependencies.

### Domain-role binding, active set, and requested-vs-resolved references

Extend `ProjectConfig` in `lib/config/types.ts`:

```ts
export interface ProjectConfig {
  readonly domain?: string; // default domain role, not necessarily the final target id
  readonly activeDomains?: readonly string[];
  readonly domainBindings?: Readonly<Record<string, string>>;
  readonly skills?: readonly string[];
  readonly skillPaths?: readonly string[];
  readonly chains?: Readonly<Record<string, ProjectChainConfig>>;
}
```

Parsing rules in `lib/config/loader.ts`:

- `activeDomains` accepts only string entries and preserves order.
- `domainBindings` accepts only string-to-string entries. Unlike inert optional arrays (e.g. `skills`), a binding is execution identity: a malformed or typo'd entry silently reverting a role to same-named resolution would surface later as a misleading not-found or wrong-domain error. So a malformed `domainBindings` entry is **not** silently dropped — it emits an actionable config diagnostic (AC-010 style) naming the offending key/value and is skipped only after warning. Do not throw on it (config stays loadable), but never swallow it silently.
- `domain` remains the default domain role and can itself be redirected by `domainBindings`. The redirect must flow through every default-domain path, not just explicit `role/agent` references (see B-023).

Add `lib/domains/bindings.ts` with these contracts:

```ts
export interface DomainBindingResolution {
  readonly role: string;
  readonly domainId: string;
  readonly source: "default" | "project" | "live";
}

export interface QualifiedAgentReference {
  readonly role: string;
  readonly agentId: string;
  readonly qualifiedId: string; // `${role}/${agentId}` for requested, `${domainId}/${agentId}` for resolved
}

export interface ResolvedAgentReference {
  readonly requested: QualifiedAgentReference;
  readonly resolved: QualifiedAgentReference;
  readonly binding: DomainBindingResolution;
}

export type DomainBindingErrorCode =
  | "target-domain-missing"
  | "role-domain-missing";

export interface DomainBindingErrorDetail {
  readonly code: DomainBindingErrorCode;
  readonly role: string;
  readonly targetDomain: string;
  readonly message: string;
}
```

`DomainBindingResolver` is the stable API used by runtime, agent registry, chain/spawn tooling, and live command code. It resolves a role by applying live overrides first, then project `domainBindings`, then defaulting to the role string itself. It validates against the active `DomainRegistry`.

Requested-vs-resolved separation is required across orchestration:

- `AgentRegistry.resolveReference()` returns `ResolvedAgentReference` plus the `AgentDefinition` without rewriting the caller's requested role.
- `ChainStage.name` remains the requested stage string for existing display and DSL compatibility. Add `ChainStage.resolvedAgent?: ResolvedAgentReference` only after resolution/preparation, or carry an equivalent prepared-stage field; do not mutate `name` to the target domain.
- `SpawnConfig.role` remains the requested role string. Add `SpawnConfig.resolvedAgent?: ResolvedAgentReference` or compute the same shape once in `spawn-tool.ts` and pass it to authorization/session creation.
- Durable chain compilation persists both requested and resolved fields: `requestedRole`, `resolvedDomain`, and `resolvedAgentId` (or a serialized `ResolvedAgentReference`). This keeps resumed/detached work auditable and prevents allowlist regressions.

Active-domain filtering happens in runtime bootstrapping before validation, merging conflict checks, registries, prompt assembly, and binding validation:

- If `activeDomains` is absent, all loaded domain providers are active.
- If present, keep `shared` automatically and keep only non-shared providers whose manifest ids are listed.
- `main` is not forced active; projects that omit it are allowed, but the existing no-domain/default-lead errors still apply.
- A binding target must be in the active set; otherwise startup/use fails with the role and target named.

### Loader provenance and conflict contract

Extend domain source/provenance types in `lib/domains/types.ts`:

```ts
export type DomainSourceKind = "domains-dir" | "domain-root";

export interface DomainSource {
  readonly domainsDir: string;
  readonly origin: string;
  readonly precedence: number;
  readonly kind?: DomainSourceKind; // omitted means "domains-dir"
}

export interface DomainProvenance {
  readonly origin: string;
  readonly precedence: number;
  readonly kind: DomainSourceKind;
  readonly rootDir: string;
}

export interface LoadedDomain {
  // existing fields...
  readonly provenance: readonly DomainProvenance[];
}
```

Internal loader flow:

1. Convert every `DomainSource` into `LoadedDomainProvider` entries: `{ domain, provenance }`.
2. If runtime passed an active set, filter providers by manifest id before validation, conflict detection, and merge strategy. `shared` is included by runtime before passing the set.
3. For two providers with the same manifest id and the same precedence, throw `DomainIdConflictError` with the domain id and both origins.
4. For same-id providers at different precedence, use the existing merge/replace/skip strategy. Merged domains combine provenance and rootDirs in precedence order.
5. `validateDomains()` runs only on the merged active domains.

This contract is mandatory for B-013 and B-017. Do not implement active filtering only after `loadDomainsFromSources()` returns; that would leave inactive domains able to fail validation/conflict checks.

### Live binding state and runtime bridge

Live binding state is session-scoped state with process-global access because Pi extension modules are loaded across jiti boundaries. It must not be correctness-critical memory that cannot be reconstructed.

Add `lib/interactive/domain-bindings.ts` (or an equivalently named bridge module) using `Symbol.for()` slots, parallel to `lib/interactive/agent-switch.ts`:

```ts
export interface SharedDomainRuntime {
  readonly projectRoot: string;
  readonly domainRegistry: DomainRegistry;
  readonly bindingResolver: DomainBindingResolver;
  readonly domainContext: string | undefined;
}

export function setSharedDomainRuntime(runtime: SharedDomainRuntime): void;
export function getSharedDomainRuntime(projectRoot: string): SharedDomainRuntime | undefined;
```

Add a project-scoped mutable live store in `lib/domains/bindings.ts`:

```ts
export interface LiveDomainBindingStore {
  get(role: string): string | undefined;
  set(role: string, targetDomain: string): void;
  clear(role: string): void;
  snapshot(): Readonly<Record<string, string>>;
}

export function getLiveDomainBindingStore(projectRoot: string): LiveDomainBindingStore;
```

Rules:

- `CosmonautsRuntime.create()` always obtains `getLiveDomainBindingStore(projectRoot)` and constructs `DomainBindingResolver` with that store by reference, not a copied map.
- `cli/main.ts` calls `setSharedDomainRuntime()` for interactive sessions, alongside the existing agent registry bridge.
- `domains/shared/extensions/domain-bindings/index.ts` validates targets with `getSharedDomainRuntime(ctx.cwd)` when available. If absent, it may reconstruct `CosmonautsRuntime`, but the reconstructed runtime must use the same `getLiveDomainBindingStore(ctx.cwd)` store.
- The orchestration extension's independent runtime cache is safe only because cached runtimes also hold a resolver pointing at the same mutable live store. B-020 locks this down.
- A live `/domain-bind` command appends a custom session entry with `customType: "cosmonauts.domain-binding"` and data `{ role, targetDomain, action: "set", createdAt }` using `pi.appendEntry()`.
- The extension rehydrates by scanning `ctx.sessionManager.getBranch()` on `session_start`, taking the latest valid entry per role, and applying it to the project-scoped live store before future resolutions.
- Invalid or stale entries are ignored with an actionable warning; the resolver never fabricates a target domain.
- If the CLI process restarts without resuming a session, only `.cosmonauts/config.json` bindings apply. That is intentional and documented.

Add `domains/shared/extensions/domain-bindings/index.ts` rather than expanding `agent-switch`; the extension owns only live binding commands and rehydration. Inject it into interactive sessions through `cli/main.ts` alongside `agent-switch` via `extraExtensionPaths`, so every switched agent keeps the command available.

### Agent resolution and authorization

Update `AgentRegistry` in `lib/agents/resolver.ts` to understand domain-role bindings without changing existing call sites unnecessarily:

- Existing `get(id, domainContext?)`, `resolve(id, domainContext?)`, and `has(id, domainContext?)` continue to work for simple callers, but internally use the binding resolver when present.
- When `id` is qualified, the domain segment is treated as a role and resolved through `DomainBindingResolver`.
- When `id` is unqualified and `domainContext` is present, `domainContext` is treated as a role and resolved through `DomainBindingResolver`.
- Add a diagnostic method, for example `resolveForConsumer(id, { domainContext, consumerDomain, allowInternal? })`, returning a discriminated result for `ok`, `not-found`, `internal`, and binding errors. The `ok` result includes `ResolvedAgentReference`.
- Direct operator paths such as `/agent` may pass `allowInternal: true`; consuming-agent paths such as `spawn_agent` and `chain_run` pass the caller's domain so cross-domain internal access is refused.

Update subagent authorization in `domains/shared/extensions/orchestration/authorization.ts` so binding redirects do not require consumer edits:

- Accept `ResolvedAgentReference` (or separate requested/resolved references) as well as `callerDef` and `targetDef`.
- Allow a subagent entry that matches the requested reference (`ruby-coding/worker`), the resolved target reference (`ruby-experimental/worker`), or the unqualified id when existing semantics allow it.
- Still enforce the caller's `subagents` allowlist before launching.

### Chains and skills public-surface filtering

Use `public-surface.ts` for domain-provided chains and skill discovery:

- `lib/chains/loader.ts` should filter domain chains by the `internal` deny-list when listing/resolving chains visible outside their owner domain. Same-domain consumers can see internal chains. Unknown chains and internal chains should produce distinct messages.
- `lib/agents/skills.ts` should build the effective skill allowlist from agent-level skills, project skill filters, and the public-surface (provided skills minus the owner domain's `internal.skills`) for domains other than the agent's own domain. Wildcard agents must still get a `skillsOverride` when public-surface filtering is needed; returning `undefined` would expose all Pi-discovered skills.
- The current Pi `skillsOverride` API filters by skill name, not source domain. This plan does not redesign Pi skill loading. Tests should cover the no-name-collision case used by this repo; if duplicate skill names make enforcement ambiguous, add a validator warning and document the limitation rather than adding a new skill identity system in this slice.

Capabilities and extensions are not part of the visibility surface in this plan (they cannot be named in `internal`). They remain internal assembly/runtime dependencies resolved by agent definitions and the resolver's existing domain/portable/shared rules.

### Package root loading, including bundled dev packages

Extend the source contract used by package scanning and domain loading:

```ts
export type DomainSourceKind = "domains-dir" | "domain-root";
```

`domains-dir` means the current behavior: `domainsDir` contains child domain directories. `domain-root` means `domainsDir` itself contains `domain.ts` and is loaded as one domain.

Implementation details:

- `loadDomainsFromSources()` dispatches by `source.kind`.
- Keep `loadDomains(domainsDir)` for callers/tests that scan child directories.
- Add/export `loadDomainRoot(domainDir)` for root sources; the existing `loadSingleDomain()` can become that implementation.
- Introduce a manifest-aware helper in `lib/packages/scanner.ts`, e.g. `addPackageDomainSources(sources, { packageRoot, manifest, origin, precedence })`.
- Use that helper for installed packages and for dev-mode `bundledDirs`. Do not push bundled dirs directly as raw `domains-dir` sources.
- The helper emits `kind: "domain-root"` only for package manifests with exactly one domain and `path: "."`.
- Multi-domain packages and explicit subfolder paths continue to emit `domains-dir` sources deduplicated by parent directory.
- **`path: "."` is only valid when it is the sole domain in the manifest.** A manifest mixing `path: "."` with any other domain (e.g. `[{ name: "alpha", path: "." }, { name: "beta", path: "beta" }]`) is rejected at validation. This closes the store-parent-exposure hole: without this rule the `.` entry — not being a single-domain manifest — would fall into the `domains-dir`/parent-directory branch and scan the package store parent, exposing sibling packages as domains. (Multi-domain packages must place every domain in its own subfolder, per the spec's package-layout assumption.)
- Installer validation must assert that each declared domain path is a directory and contains `domain.ts`, including `path: "."`, producing a package-authoring error before installation; and must reject a `path: "."` entry that co-exists with other domain entries.

### Framework prompt relocation

Move these files:

- Former shared base prompt path → `lib/prompts/framework/base.md`
- Former shared runtime sub-agent prompt path → `lib/prompts/framework/runtime/sub-agent.md`

Update `assemblePrompts()`:

- Add `frameworkPromptsDir?: string` to `AssemblePromptsOptions` for tests and nonstandard embeddings.
- Layer 0 always loads `${frameworkPromptsDir}/base.md` or the default framework prompt dir.
- Layer 3 always loads `${frameworkPromptsDir}/runtime/sub-agent.md` for sub-agent mode.
- Layer 2 still uses `resolver.resolvePersonaPath(agentId, domain)` or `<domainsDir>/<domain>/prompts/<agent-id>.md`.

Remove runtime reliance on `DomainResolver.resolveBasePath()` and `resolveRuntimeTemplatePath()`; leave deprecated methods only if needed for a staged test update, then remove or update tests so shared `prompts/` is no longer a framework-prompt contract.

### First-party migration

Collapse the bundled coding package:

- Move bundled coding agents to `bundled/coding/agents/`.
- Move bundled coding prompts to `bundled/coding/prompts/`.
- Move bundled coding capabilities, skills, drivers, `chains.ts`, and `domain.ts` similarly.
- Change `bundled/coding/cosmonauts.json` to `domains: [{ "name": "coding", "path": "." }]`.
- Update moved TypeScript relative imports, for example agent files from `../../../../lib/...` to `../../../lib/...` and root domain files from `../../../lib/...` to `../../lib/...`.
- Update references in tests/docs to the `bundled/coding/...` layout.
- Verify B-016 before deleting the nested directory; otherwise dev-mode Cosmonauts can lose the coding domain.

Update built-in domains:

- Remove framework base/runtime prompts from the shared domain prompt directory.
- Keep `domains/main/prompts/cosmo.md` and `bundled/coding/prompts/*.md` as persona directories.
- If the shared domain prompt directory becomes empty, delete it rather than keeping an empty persona namespace.

### Documentation

Create `docs/domains.md` as the authoring contract. It must include:

- Canonical layout tree.
- A table for manifest, agent, persona, capability, skill, extension, and chain: path, format, declaration rule, and whether it is intrinsic domain content.
- `internal` deny-list semantics with default-public and hide-by-naming examples for agents, skills, and chains (including that an omitted asset-type list stays fully public).
- Project config split: `domain`, `activeDomains`, `domainBindings`, `skills`, `skillPaths`, `chains`.
- Live binding command, in-flight behavior, session-entry persistence, and replay rules.
- Package layout examples for single-domain root and multi-domain package subfolders.
- Failure messages and how to fix each.

Update `docs/prompts.md` so the four layers name the new framework prompt paths and state that domain `prompts/` contains personas only.

Update `README.md` only where it references the old nested coding path or old prompt locations.

## Files to Change

- `lib/domains/types.ts` — add `DomainInternal`; extend `DomainManifest` with `internal?`; extend `DomainSource` with source kind; add provenance/reference types or re-export them from focused modules.
- `lib/domains/public-surface.ts` — new helper for default-public/`internal` deny-list visibility, validation that named-internal assets exist, and internal-access decisions.
- `lib/domains/bindings.ts` — new domain-role binding resolver, `ResolvedAgentReference` contracts, live binding store, rehydration helpers, and error formatting.
- `lib/domains/loader.ts` — support `domain-root` sources; export/load exact domain roots; preserve provenance; filter inactive providers before conflict checks; report same-precedence domain-id conflicts.
- `lib/domains/registry.ts` — expose enough domain lookup/listing for bindings/public-surface checks if current methods are insufficient.
- `lib/domains/resolver.ts` — stop owning framework prompt paths; keep resource resolution for capabilities/personas/extensions/skills.
- `lib/domains/validator.ts` — validate that names listed in `internal` exist in the domain, and improve missing-persona diagnostics with expected paths.
- `lib/domains/prompt-assembly.ts` — load framework base/runtime prompts from `lib/prompts/framework/`; keep persona lookup by domain prompt name.
- `lib/domains/index.ts` — export new domain APIs.
- `lib/prompts/loader.ts` — point `PROMPTS_DIR`/framework prompt helpers at `lib/prompts/framework/`.
- `lib/prompts/framework/base.md` — moved framework base prompt.
- `lib/prompts/framework/runtime/sub-agent.md` — moved runtime prompt template.
- `lib/agents/resolver.ts` — bind domain-role segments during agent resolution and expose diagnostic consumer resolution with requested/resolved references.
- `lib/agents/resolve-default-lead.ts` — resolve default `domain` config as a role before looking up the target domain lead.
- `lib/agents/session-assembly.ts` — thread optional `frameworkPromptsDir` if needed by tests; pass agent-domain context to skill public-surface filtering.
- `lib/agents/skills.ts` — apply public-surface skill visibility to cross-domain skill exposure, including wildcard agents.
- `lib/skills/discovery.ts` — keep domain metadata available for public-surface skill filtering; avoid losing source domain before filtering.
- `lib/config/types.ts` — add `activeDomains` and `domainBindings`.
- `lib/config/loader.ts` — parse `activeDomains` and `domainBindings`; tolerate optional arrays but emit an actionable diagnostic for malformed `domainBindings` entries (warn-and-skip, never silently drop; never throw).
- `lib/runtime.ts` — compute active domain ids from config; pass active set to loader; create/expose `DomainBindingResolver`; use project-scoped live store; validate bindings before registries are used.
- `lib/chains/loader.ts` — filter visible domain chains with public-surface rules and binding-aware domain context; distinguish internal from unknown where possible.
- `lib/orchestration/types.ts` — add requested/resolved role fields to `ChainStage`, `SpawnConfig`, or equivalent prepared-stage types.
- `lib/orchestration/chain-parser.ts` — keep requested stage name; use binding-aware registry loop lookup without rewriting the role.
- `lib/orchestration/chain-runner.ts` — use diagnostic agent resolution for internal/not-found/binding errors; carry requested and resolved references into spawn config.
- `lib/orchestration/agent-spawner.ts` — preserve binding-aware role resolution for spawned chain stages.
- `lib/orchestration/model-resolution.ts` — use binding-aware registry lookups for per-role models/thinking.
- `lib/orchestration/durable-chain-compiler.ts` — persist requested and resolved role fields for detached/resumed chains.
- `domains/shared/extensions/orchestration/authorization.ts` — authorize against requested and resolved references.
- `domains/shared/extensions/orchestration/spawn-tool.ts` — resolve target agents with caller-domain public-surface enforcement and clearer errors.
- `domains/shared/extensions/orchestration/chain-tool.ts` — pass caller domain into chain resolution and use binding-aware runtime state.
- `domains/shared/extensions/orchestration/index.ts` — cached runtimes must use the project-scoped live binding store.
- `domains/shared/extensions/domain-bindings/index.ts` — new `/domain-bind` live switch command and rehydration extension.
- `lib/interactive/domain-bindings.ts` — new process-global bridge for shared domain runtime and live binding store access.
- `lib/interactive/agent-switch.ts` — keep or extend shared registry setup so `/agent` and `/domain-bind` bridges do not diverge.
- `cli/main.ts` — set shared domain runtime; inject `domain-bindings` extension into interactive sessions; update list/dump behavior for bound default domain if needed.
- `cli/session.ts` — ensure switched sessions keep the domain-bindings extension and the binding-aware registry/resolver shared state.
- `cli/runtime-bootstrap.ts` — no behavior change expected beyond threading runtime options if tests reveal it.
- `lib/packages/types.ts` — mirror `DomainSourceKind` on package scanner source type.
- `lib/packages/scanner.ts` — route installed and bundled package manifests through the same `addPackageDomainSources()` helper; emit `domain-root` for single-domain `path: "."` packages.
- `lib/packages/dev-bundled.ts` — no behavior change expected, but tests should prove its returned package dirs are manifest-routed by scanner.
- `lib/packages/installer.ts` — validate declared domain paths contain `domain.ts`, including `path: "."`; reject a `path: "."` entry that co-exists with other domain entries (B-022).
- `lib/packages/manifest.ts` — keep manifest shape but ensure `path: "."` remains valid; enforce that `path: "."` is the only domain in the manifest when present.
- `cli/create/subcommand.ts` — scaffold root-domain package layout and update output.
- `bundled/coding/cosmonauts.json` — change domain path to `"."`.
- `bundled/coding/**` — keep files in the root-domain layout and fix relative imports.
- `domains/shared/domain.ts` — update description after framework prompts move.
- `docs/domains.md` — new authoring contract documentation.
- `docs/prompts.md` — update prompt layer paths and persona-only domain prompt rule.
- `README.md` — update stale path examples.
- `tests/domains/loader.test.ts` — root source, conventional loading, provenance, and conflict tests with markers.
- `tests/packages/scanner.test.ts` — installed and bundled root-domain source tests with markers.
- `tests/packages/installer.test.ts` — `domain.ts` validation for package domains, including `path: "."`; and rejection of `path: "."` co-existing with other domains (B-022).
- `tests/config/loader.test.ts` — malformed `domainBindings` diagnostic (B-024) and `activeDomains`/`domainBindings` parsing.
- `tests/cli/create/subcommand.test.ts` — root scaffold layout tests with markers.
- `tests/domains/prompt-assembly.test.ts` — framework prompt path tests with markers.
- `tests/agents/session-assembly.test.ts` — updated minimal framework prompt fixture paths and skill filtering integration.
- `tests/domains/public-surface.test.ts` — new default-public / `internal` deny-list tests with markers.
- `tests/domains/bindings.test.ts` — new role binding resolver and requested/resolved reference tests with markers.
- `tests/agents/resolver.test.ts` — binding-aware and internal-agent diagnostic tests with markers.
- `tests/runtime.test.ts` — config active set, project binding, and inactive-domain filtering integration tests with markers.
- `tests/extensions/domain-bindings.test.ts` — live slash command, rejection, rehydration, and cached-runtime tests with markers.
- `tests/domains/validator.test.ts` — missing-persona path and invalid `internal`-name diagnostics with markers.
- `tests/chains/named-chain-loader.test.ts` — chain visibility (deny-list) filtering tests with marker.
- `tests/agents/skills.test.ts` — skill visibility (deny-list) filtering tests with marker.
- `tests/docs/domain-authoring.test.ts` — documentation coverage test with marker.
- Any tests/docs currently importing or referencing former bundled coding or pre-relocation shared prompt paths.

## Risks

- **Bundled dev-mode can lose `coding`.** If bundled dirs continue to be pushed as raw `domains-dir` sources, root-domain `bundled/coding/domain.ts` will be missed. The scanner must route bundled package manifests through the same helper as installed packages before migration lands.
- **Root package source semantics can accidentally scan sibling packages.** Pivot if `path: "."` is implemented by exposing a package store parent to `loadDomains()`. The required design is an exact `domain-root` source kind, plus the rule that `path: "."` is valid only as the sole domain (B-022) — a mixed manifest must not fall back to parent-directory scanning.
- **Active filtering can happen too late.** Inactive malformed/conflicting domains must be filtered before validation and same-precedence conflict detection. Filtering only after merge is a design failure.
- **The `internal` deny-list can silently become documentation-only if not integrated into resolution.** Agent resolution, chain listing, and skill filtering must all use `public-surface.ts`; otherwise assets named `internal` remain reachable cross-domain.
- **Skill filtering is limited by Pi's name-only override.** If duplicate skill names appear across public/internal domains, name-based filtering may be ambiguous. Warn/document rather than inventing a new skill identity model in this slice.
- **Binding redirects can break subagent allowlists.** Authorization must compare both requested and resolved qualified references so existing consumers do not need edits.
- **Live binding state can drift if only held in extension-local memory.** The design requires a project-scoped live store shared by CLI runtime, orchestration runtime cache, `/agent` switches, and `/domain-bind` rehydration.
- **Prompt relocation can break every agent spawn.** Move framework prompt files and update assembly/tests in the same stage; do not delete old paths until new prompt assembly tests pass.
- **Coding package collapse can break imports at runtime.** Update relative imports as part of the move and run typecheck before proceeding to binding work.
- **Same-ID conflict policy can undermine customization if too broad.** Only same-precedence active providers are conflicts. Different-precedence sources continue to merge/override per the existing customization model.

## Quality Contract

Plan-specific assertions:

1. A package manifest with `path: "."` never causes the scanner to expose the package store parent as a domain directory.
2. Bundled package dirs discovered in framework dev mode are manifest-routed, so `bundled/coding` with root `domain.ts` remains active.
3. Inactive domains do not participate in validation or same-precedence conflict checks.
4. After prompt relocation, no runtime code path reads framework prompts from domain persona directories.
5. Visibility is a deny-list: an asset is hidden cross-domain only if it is named in `manifest.internal` for its type. Assets not named, and asset types whose list is omitted, remain public. Forgetting to name an asset must never hide it.
6. Bound role resolution preserves the requested role string for authorization and error messages while resolving the actual target domain for execution.
7. Live binding rejection is non-mutating: failed target validation leaves the previous effective binding intact.
8. Cached orchestration runtimes observe the same project-scoped live binding store as the interactive `/domain-bind` command.
9. Same-precedence domain ID conflicts fail with both origins named; higher-precedence override/merge behavior remains covered by existing loader tests.

The `artifact-conformance` gate is evaluated after implementation tasks create their referenced RED tests and marker comments. Task acceptance criteria must require workers to create the named test file and exact `@cosmo-behavior plan:domain-authoring#B-###` marker before marking a behavior complete. Pre-implementation absence of those new test files is not a waiver; it is task work that must be complete before the final gate runs.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native correctness evidence passes for package loading, prompt assembly, visibility (`internal` deny-list), bindings, live switch, and migration | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | After implementation, every behavior-owned test/evidence file exists and contains the exact behavior marker | artifact evidence | hard fail at final quality gate; task ACs create the evidence |
| 3 | `boundary-conformance` | universal | bound | Domain logic remains in `lib/domains/*`; CLI/extensions depend on domain APIs rather than reimplementing binding/visibility rules | reviewer evidence | hard fail for duplicated binding/visibility logic |
| 4 | `mutation` | bindable | unbound | Project-specific mutation checks would catch deny-list inversion (a hidden asset leaking, or an unnamed asset being hidden), late active filtering, and live-switch mutation-on-failure | pending | unbound, not enforced; reviewer judgment required |
| 5 | `dead-code` | bindable | bound | Old framework prompt paths and old bundled nested path references are removed or intentionally documented as archived-only | project-discovered | hard fail for active runtime references |

## Implementation Order

1. **Lock package root semantics with failing tests.** Add tests for `DomainSource.kind`, installed package `path: "."`, bundled package `path: "."`, installer `domain.ts` validation, and scaffold root layout. Implement `domain-root` loading and manifest-aware package-source routing for both installed and bundled packages. Only then migrate bundled coding to `bundled/coding/**` and fix imports. Run the package/domain/scaffold test subset and typecheck before deleting old nested references.

2. **Add loader provenance and active filtering before validation.** Add `DomainProvenance`, provider collection, active-set filtering before merge/conflict/validation, and same-precedence `DomainIdConflictError`. Add B-013 and B-017 tests before wiring config to runtime.

3. **Move framework prompts test-first.** Add prompt-assembly tests that pass a temp `frameworkPromptsDir` and assert domain `prompts/` only supplies personas. Move base/runtime prompt markdown to `lib/prompts/framework/`, update `lib/prompts/loader.ts` and `lib/domains/prompt-assembly.ts`, then remove runtime reliance on shared domain prompt files. Grep for active pre-relocation shared prompt references and update docs/tests.

4. **Add visibility/public-surface core.** Add `DomainInternal` types and `lib/domains/public-surface.ts` with default-public behavior and the `internal` deny-list (hide only named assets; unnamed assets and omitted type lists stay public). Add validator checks that names listed in `internal` exist in the domain, plus missing-persona expected-path diagnostics. Keep this pure and unit-tested before integrating it into agent/chain/skill resolution.

5. **Add project config active domains and bindings.** Extend config parsing and runtime active-domain filtering. Add `lib/domains/bindings.ts` with `ResolvedAgentReference`, project-scoped live store, and tests for default role resolution, project binding redirects, missing/inactive targets, requested-vs-resolved references, and error formatting. Expose the binding resolver on `CosmonautsRuntime`.

6. **Integrate binding-aware access.** Update `AgentRegistry`, default lead resolution, model/thinking lookup, chain parsing/running, spawn tool resolution, durable chain compilation, and subagent authorization to use the binding resolver and public-surface diagnostics. Preserve requested role strings in stage/spawn configs so allowlists, persistence, and messages refer to what the consumer wrote.

7. **Integrate skill and chain visibility.** Filter domain chains and effective skill names through `public-surface.ts` for cross-domain consumers. Add B-018 and B-019 tests before touching runtime session assembly; ensure wildcard agents do not bypass skill filtering when public-surface filtering applies. Do not change capability or extension resolution in this slice.

8. **Implement live `/domain-bind`.** Add the process-global shared runtime bridge and `domains/shared/extensions/domain-bindings/index.ts`. Register the slash command, persist successful switches with `pi.appendEntry()`, rehydrate from `ctx.sessionManager.getBranch()` on `session_start`, mutate the shared project live store, and inject the extension through `cli/main.ts`/`cli/session.ts` so it survives `/agent` switches. Confirm B-020 against the orchestration extension runtime cache.

9. **Write authoring docs and update references.** Create `docs/domains.md`, update `docs/prompts.md`, README path examples, and all stale test/doc imports. Add the docs coverage test.

10. **Migration verification.** Run targeted tests after each stage, then run the full project verification commands: `bun run test`, `bun run lint`, and `bun run typecheck`. If any stage reveals broader domain-routing or Pi skill-loader limitations, stop and revise the plan rather than expanding scope silently.
