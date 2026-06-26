---
title: Make the framework coding-agnostic (coding-extraction Wave 1)
status: active
createdAt: '2026-06-26T00:00:00.000Z'
updatedAt: '2026-06-26T15:34:42.000Z'
---

## Overview

Make the framework coding-agnostic in place. Wave 1 changes framework fallback semantics and framework test fixtures only: `coding` remains bundled, explicit `coding/*` flows keep working, and physical extraction stays in Wave 2.

Acceptance-criteria IDs used by this plan:

- **AC-001**: no framework hardcoded `"coding"` default domain remains; every fixed fallback site is tested and falls back to `main`.
- **AC-002**: default-domain and default-envelope failure paths are clear and actionable.
- **AC-003**: Drive's default envelope is framework-owned and used by both CLI Drive and Pi `run_driver`.
- **AC-004**: Bucket C synthetic test fixtures use neutral domain ids.
- **AC-005**: Bucket B framework tests use a synthetic installable-package fixture instead of real bundled `coding`.
- **AC-006**: full correctness/static gates pass with `coding` still bundled.
- **AC-007**: existing explicit coding flows, including dogfood Drive resolution, remain unchanged and have observable evidence.
- **AC-008**: the shared/main leakage scan produces a written findings list with a disposition per item.
- **AC-009**: shared+main-only CLI operation is coherent; the no-domain/init guards no longer require installing `coding` when `main` is present.

## Architecture Context

This plan implements `missions/architecture/domains.md` slice **S2 — Extract coding**, Wave 1 only. Relevant architecture rules:

- The core bundle is **framework + `shared` + `main`**; `main` owns the default assistant (`main/cosmo`).
- `shared` is the cross-domain stdlib and must not require `coding`.
- `coding` remains bundled during this wave, but framework code must not require `coding` to exist.
- Wave 2 owns physical extraction, catalog URL changes, `bundled/` removal, import rewrites, load parity, and Bucket A test moves.

Planner resolutions for the spec open questions:

- **Per-site fallback**: use `main` for all fixed `?? "coding"` sites. Requiring explicit domains would be stricter than current behavior and would break synthetic/domainless definitions used by tests and package-building; loaded runtime agents already receive an explicit `domain` from `lib/domains/loader.ts`.
- **No-default behavior**: enforce the clear no-default-domain error only on resolver-backed paths where the loaded domain registry can prove `main` is absent. No-resolver, `domainsDir`-only callers return `main` and must have tests/fixtures updated to provide `main` resources; if those files are missing, the existing path-specific prompt/extension error is the correct diagnostic.
- **CLI no-domain guard**: `shared` + `main` is now a runnable installation because `main/cosmo` is the default assistant. The guard should fire only when no runnable default domain/lead is available, not merely because no third-party or coding domain is installed. Guard copy must not tell users to install `coding` as the required path forward.
- **Envelope home**: copy the default Drive envelope to `lib/prompts/framework/drive/envelope.md` and update defaults to resolve there. Leave the old `bundled/coding/drivers/templates/envelope.md` file as a compatibility copy in Wave 1 so coding remains bundled/unchanged for external callers or stale run specs.
- **Bucket B fixture**: create one reusable synthetic installable-domain package helper under `tests/helpers/`, then use it for all framework tests that need a package/domain fixture.
- **Shared/main leakage**: scan-only in this wave. The deliverable is `missions/plans/coding-agnostic-framework/leakage-findings.md`; fixes are out of scope unless a finding blocks this wave's own behavior.

## Behaviors

### B-001 - Default-domain helper returns main for synthetic definitions

- Source: AC-001
- Context: framework code needs a fallback domain for a synthetic or hand-built agent definition that has no `domain` field.
- Action: the default-domain helper resolves the missing domain while `main` is present.
- Expected: the resolved domain is `main`, not `coding`.
- Seam: `lib/domains/default-domain.ts`
- Test: `tests/domains/default-domain.test.ts` > `returns main for missing explicit domain when main is installed`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-001`

### B-002 - Resolver-backed missing main default fails clearly

- Source: AC-002
- Context: a resolver-backed fallback site has no explicit domain and the resolver registry does not contain `main`.
- Action: the default-domain helper is asked for the fallback domain.
- Expected: it throws an actionable `No default domain "main" is installed; ... set an explicit domain` message and never fabricates `coding`.
- Seam: `lib/domains/default-domain.ts`
- Test: `tests/domains/default-domain.test.ts` > `throws a no default domain error when main is unavailable`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-002`

### B-003 - Session prompt assembly uses main for domainless definitions

- Source: AC-001
- Context: `buildSessionParams()` receives a domainless synthetic `AgentDefinition`; `main/prompts/<agent>.md` exists and no `coding` prompt is needed.
- Action: session params are built.
- Expected: prompt assembly reads the `main` persona and succeeds without a `coding` directory.
- Seam: `lib/agents/session-assembly.ts` prompt assembly fallback
- Test: `tests/agents/session-assembly.test.ts` > `uses main prompts for a domain-less definition`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-003`

### B-004 - Session extension lookup uses main for domainless definitions

- Source: AC-001
- Context: a domainless synthetic agent declares an extension that exists under `main/extensions/` and not under `coding/extensions/`.
- Action: `buildSessionParams()` resolves extension paths.
- Expected: the returned extension path is under `main/extensions/`; no `coding` path is searched as the primary fallback.
- Seam: `lib/agents/session-assembly.ts` extension-resolution fallback
- Test: `tests/agents/session-assembly.test.ts` > `resolves main extension paths for a domain-less definition`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-004`

### B-005 - Session skill visibility uses main for domainless definitions

- Source: AC-001
- Context: a domainless synthetic agent uses wildcard skills with a resolver that has `main` internal skills and another domain's internal skills.
- Action: `buildSessionParams()` constructs its Pi `skillsOverride`.
- Expected: `main` internal skills remain visible to the default requester, while another domain's internal skills are hidden.
- Seam: `lib/agents/session-assembly.ts` requester-domain fallback into `resolveHiddenSkillNames()`
- Test: `tests/agents/session-assembly.test.ts` > `uses main as requester domain for domain-less skill visibility`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-005`

### B-006 - Omitted requester domain in skill helper means main

- Source: AC-001
- Context: `resolveHiddenSkillNames()` is called directly with a resolver and no `requesterDomain`.
- Action: skill visibility is resolved.
- Expected: `main` is treated as the requester; the helper does not default to `coding`.
- Seam: `lib/agents/skills.ts`
- Test: `tests/agents/skills.test.ts` > `defaults omitted requester domain to main`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-006`

### B-007 - Agent-package source prompts use main as final fallback

- Source: AC-001
- Context: `buildAgentPackage()` builds a `prompt.kind: "source-agent"` package from a domainless source agent with no `domainContext`; main prompt/capability files exist.
- Action: the package is built.
- Expected: the source-agent prompt is assembled from `main`, not `coding`, and the package identity remains otherwise unchanged.
- Seam: `lib/agent-packages/build.ts`
- Test: `tests/agent-packages/build.test.ts` > `assembles domain-less source-agent prompts from main`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-007`

### B-008 - Dump-prompt fallback uses main for domainless definitions

- Source: AC-001
- Context: CLI dump-prompt code receives a resolved default definition with no `domain` field. **Note:** in production `cli/main.ts:439`'s `definition.domain ?? "coding"` is effectively dead — `resolveDefaultLead()` only ever returns registry-resolved defs, and `loader.ts:164` stamps `domain` on every loaded agent, so the fallback never fires through that path. To make this site genuinely testable (the spec requires each fixed site be exercised), **extract a pure injectable helper** `resolveDumpPromptDomain(definition, resolver)` (consuming `resolveDefaultDomain(...)`) and call it directly with a hand-built domainless `AgentDefinition` (mirroring B-001/B-002) — do not rely on mocking `resolveDefaultLead`.
- Action: `resolveDumpPromptDomain` is invoked for a hand-built domainless definition.
- Expected: it returns `main`, and a resolver without `main` produces the same clear no-default-domain message as B-002.
- Seam: `cli/main.ts` dump-prompt domain selection (via the extracted `resolveDumpPromptDomain` helper)
- Test: `tests/cli/main.test.ts` > `dump-prompt domain fallback uses main for a domain-less definition`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-008`

### B-009 - Source completeness gate rejects coding coalescing defaults

- Source: AC-001
- Context: source code under `lib/` and `cli/` has been updated.
- Action: a source-scan test searches the edited files for coding domain-defaults — `?? "coding"` and also `|| "coding"` and bare `"coding"` literals used as a domain default in `session-assembly.ts`, `skills.ts`, `build.ts`, `cli/main.ts`.
- Expected: no matches remain; `AgentToolSet` / `tools: "coding"` preset names and the `lib/packages/catalog.ts` entry are explicitly carved out (they are not domain defaults).
- Seam: `lib/**`, `cli/**`
- Test: `tests/domains/default-domain.test.ts` > `finds no coding nullish-coalescing defaults in framework sources`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-009`

### B-010 - Framework default Drive envelope resolves outside coding

- Source: AC-003
- Context: no run-specific envelope is provided and the framework default envelope exists under `lib/prompts/framework/drive/`.
- Action: the default envelope resolver is called.
- Expected: it returns `lib/prompts/framework/drive/envelope.md`; the path does not include `bundled/coding`.
- Seam: `lib/driver/default-envelope.ts`
- Test: `tests/driver/default-envelope.test.ts` > `resolves the framework default Drive envelope outside bundled coding`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-010`

### B-011 - CLI Drive uses the framework default envelope when omitted

- Source: AC-003
- Context: `cosmonauts run drive` is invoked without `--envelope`.
- Action: the CLI builds a `DriverRunSpec`.
- Expected: the spec snapshots the framework default envelope content and stores an envelope path under `lib/prompts/framework/drive/`, not `bundled/coding`.
- Seam: `cli/drive/subcommand.ts`
- Test: `tests/cli/drive/run.test.ts` > `uses the framework default envelope when --envelope is omitted`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-011`

### B-012 - Pi run_driver uses the same framework default envelope

- Source: AC-003
- Context: an agent calls `run_driver` without `envelopePath`.
- Action: the shared orchestration driver tool prepares the run spec.
- Expected: the run spec uses the same framework default envelope resolver as the CLI path. **This is also a latent-bug fix, not a clean relocation:** the current `run_driver` omitted-envelope default (`BUNDLED_CODING_ENVELOPE` at `driver-tool.ts:385-392`) builds a **doubled** `bundled/coding/coding/drivers/templates/envelope.md` path that does not exist on disk and is never exercised (every test passes an explicit path), so it currently throws. Remove that doubled constant — do not preserve it for compatibility — and assert the resolved framework default both lives under `lib/prompts/framework/drive/` **and points at a file that exists** (`existsSync`/read it). Tool/skill copy no longer says "bundled coding envelope".
- Seam: `domains/shared/extensions/orchestration/driver-tool.ts`
- Test: `tests/extensions/orchestration-driver-tool.test.ts` > `run_driver uses the framework default envelope when envelopePath is omitted`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-012`

### B-013 - Missing default Drive envelope fails clearly

- Source: AC-002, AC-003
- Context: neither a run-specific envelope nor the framework default envelope exists at the expected path.
- Action: the default envelope resolver is called.
- Expected: it throws a message naming the missing default envelope path and telling the caller to pass `--envelope` / `envelopePath` explicitly.
- Seam: `lib/driver/default-envelope.ts`
- Test: `tests/driver/default-envelope.test.ts` > `throws an actionable error when the framework default envelope is missing`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-013`

### B-014 - Synthetic installable package fixture loads through real package seams

- Source: AC-005
- Context: a test needs an installable domain package but not the real coding domain.
- Action: the shared test helper writes a package root with `cosmonauts.json`, `domain.ts`, agent files, prompt/capability/skill files, and optional chains, then `scanDomainSources()` / `loadDomainsFromSources()` load it.
- Expected: the loaded domain has the requested id, lead, agents, prompts, capabilities, and root-domain provenance.
- Seam: `tests/helpers/domain-package-fixture.ts`
- Test: `tests/helpers/domain-package-fixture.test.ts` > `loads a synthetic installable domain package through the package scanner`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-014`

### B-015 - Main-domain tests use a synthetic coding package, not bundled coding

- Source: AC-005, AC-007
- Context: `main/cosmo` still intentionally delegates to `coding/*` while `coding` remains bundled, but the framework test must not depend on bundled coding content.
- Action: `tests/domains/main-domain.test.ts` loads built-in `shared` + `main` plus a synthetic minimal `coding` package containing the subagent ids `main/cosmo` declares.
- Expected: main/cosmo validation passes, subagent refs resolve, and the test has no dependency on `bundled/coding` files.
- Seam: `tests/domains/main-domain.test.ts`
- Test: `tests/domains/main-domain.test.ts` > `validates main/cosmo against a synthetic coding package fixture`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-015`

### B-016 - Explicit coding dump-prompt behavior uses a synthetic installed coding fixture

- Source: AC-005, AC-007
- Context: the black-box CLI dump-prompt test asks for `-d coding` / `-a cody`.
- Action: the temp project installs a synthetic local `coding` package with `cody`, then runs the CLI.
- Expected: explicit coding dump-prompt output still identifies `coding/cody`, but the test would pass without `bundled/coding` present.
- Seam: `tests/cli/dump-prompt.test.ts`
- Test: `tests/cli/dump-prompt.test.ts` > `explicit coding dump-prompt uses a synthetic installed coding fixture`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-016`

### B-017 - Bucket B framework tests no longer read real bundled coding

- Source: AC-005
- Context: Bucket B tests formerly imported or loaded `bundled/coding` as a convenient package/scaffold/prompt/skill/runtime fixture.
- Action: those tests use either the shared synthetic package helper or local synthetic definitions/chains.
- Expected: Bucket B files have no real `bundled/coding` dependency; Bucket A files and explicit Wave-2 catalog-source tests remain unchanged for Wave 2.
- Seam: Bucket B test files named in the Design section
- Test: `tests/coding-agnostic-fixtures.test.ts` > `validates ledger coverage for bundled coding references`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-017`

### B-018 - Bucket C synthetic fixtures use neutral domain ids

- Source: AC-004
- Context: framework tests use `coding` only as a placeholder domain id or config example.
- Action: Bucket C occurrences are renamed to neutral ids such as `alpha`, `beta`, or `test-domain`.
- Expected: unclassified `coding` test references are gone; every remaining reference is classified by the ledger as Bucket A, Bucket B explicit synthetic-coding behavior, tool-preset coverage, domain-binding variants, catalog/Wave-2 scope, or another Keep case.
- Seam: `tests/coding-agnostic-fixtures.test.ts` plus `missions/plans/coding-agnostic-framework/test-decoupling-ledger.md`
- Test: `tests/coding-agnostic-fixtures.test.ts` > `validates every coding test reference has a ledger disposition`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-018`

### B-019 - Leakage scan deliverable has dispositions

- Source: AC-008
- Context: Wave 1 must surface shared/main leakage but not fix it.
- Action: the scan artifact is written from searches over `domains/shared/**` for **cosmo-/main-specific** strings and agent refs (the spec's framing — content an extracted domain would wrongly inherit); incidental coding-coupling is noted as an extra, not the primary target.
- Expected: every finding row has a disposition (`escalate`, `fix-in-Wave-2`, `fix-now`, or `accepted/no-action`); zero findings is represented by an explicit zero-findings row.
- Seam: `missions/plans/coding-agnostic-framework/leakage-findings.md`
- Test: `tests/domains/shared-main-leakage.test.ts` > `records a disposition for every shared-main leakage finding`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-019`

### B-020 - Dogfood worker resolution remains coding when no domain context is set

- Source: AC-007
- Context: Drive's in-process backend uses the unqualified default role `worker`; this repo has no project `domain` override, and default lead/session behavior now points at `main`.
- Action: the spawner path used by `createCosmonautsSubagentBackend()` resolves role `worker` with no `domainContext` against a registry containing `main/cosmo` and `coding/worker`.
- Expected: the resolved definition is exactly `coding/worker`; the default-domain flip does not make Drive look for `main/worker`. The test must assert the resolved qualified id (`coding/worker`), not merely that `spawner.spawn()` received role `worker`. (This resolution relies on `main` defining **no** `worker` agent — state and assert that invariant so the test stays meaningful if `main` ever gains one.)
- Seam: `lib/orchestration/agent-spawner.ts` / `lib/driver/backends/cosmonauts-subagent.ts` integration boundary
- Test: `tests/orchestration/agent-spawner.spawn.test.ts` > `resolves unqualified Drive worker to coding worker when no domain context is set`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-020`

### B-021 - Actual dogfood Drive smoke records resolved coding worker evidence

- Source: AC-007
- Context: automated resolution tests pass, and a bounded real Drive smoke is run after the default-envelope and default-domain changes are in place.
- Action: run at least one real Drive task from this plan using `backend: "cosmonauts-subagent"`, no explicit `envelopePath`, no project `domain` override, and record the command/tool invocation, backend, run id, task id, frozen envelope path, and spawn-resolution evidence.
- Expected: `dogfood-drive-verification.md` shows the framework default envelope path and an inspectable event/transcript/test-linked assertion proving the spawned task agent resolved to `coding/worker` (or another intended `coding/*` Drive worker). A run id alone is not sufficient.
- Seam: evidence artifact
- Test: `missions/plans/coding-agnostic-framework/dogfood-drive-verification.md` > `actual dogfood Drive smoke`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-021`

### B-022 - CLI no-domain guard treats main as runnable

- Source: AC-009
- Context: the runtime has built-in `shared` + `main` and no `coding` or third-party domain. **Note:** `hasInstalledDomain()` (`cli/main.ts:295`) currently excludes BOTH `shared` and `main`, and it feeds `selectRunMode` (`:281`) AND the init guard (`:468`) from that single definition. The fix must **replace the predicate at its definition** (e.g. `hasRunnableDefaultDomain(runtime)` treating `main` as runnable) so `selectRunMode`, the no-domain guard, and init all consume the new predicate — not swap it only inside the guards while `selectRunMode` keeps gating on the old one (which would leave interactive/print blocked).
- Action: CLI mode selection runs for normal interactive/print use in a `shared`+`main`-only runtime.
- Expected: it selects `interactive` (and `print` with `--print`), not `no-domain-guard` — assert the resolved mode, not merely that the guard is skipped; when `main` is absent it still guards with a domain-neutral message.
- Seam: `cli/main.ts` `hasRunnableDefaultDomain` (single predicate) → mode dispatch + no-domain guard + init
- Test: `tests/cli/no-domain-guard.test.ts` > `treats main as a runnable default domain`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-022`

### B-023 - CLI init uses main instead of demanding coding

- Source: AC-009
- Context: `cosmonauts init` runs in a shared+main-only runtime.
- Action: the init guard checks whether initialization can proceed.
- Expected: it proceeds to create the init session from the default lead (`main/cosmo`) and does not print `cosmonauts install coding`; when no runnable default exists, the message is domain-neutral and actionable.
- Seam: `cli/main.ts` init guard
- Test: `tests/cli/no-domain-guard.test.ts` > `allows init when main is present`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-023`

### B-024 - Package/catalog CLI fixture tests are reconciled

- Source: AC-005
- Context: package/export/skills/update CLI tests use catalog or bundled-package paths as generic fixtures, while the real static `coding` catalog entry intentionally remains until Wave 2.
- Action: generic mocked package fixtures are renamed to neutral package/domain ids; true static catalog-source assertions are listed as Keep/Wave2 in the ledger.
- Expected: `tests/cli/packages/subcommand.test.ts`, `tests/cli/export/subcommand.test.ts`, `tests/cli/skills/subcommand.test.ts`, and `tests/cli/update/subcommand.test.ts` no longer depend on `/bundled/coding`; `tests/packages/catalog.test.ts` keeps only the production catalog-entry/source assertions and is explicitly marked Wave-2. The production catalog-source assertion (`coding` → `./bundled/coding`) stays **byte-for-byte unchanged** in Wave 1 — only mocked/generic fixtures are neutralized; no Wave-2 catalog-source change may leak in.
- Seam: package/catalog CLI tests and `test-decoupling-ledger.md`
- Test: `tests/coding-agnostic-fixtures.test.ts` > `validates package catalog coding references are classified`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-024`

### B-025 - Explicit legacy Drive envelope path remains usable in Wave 1

- Source: AC-003, AC-007
- Context: a caller explicitly passes the old bundled envelope path `bundled/coding/drivers/templates/envelope.md` (the real, single-`coding` CLI path — NOT the doubled `bundled/coding/coding/...` `run_driver` constant, which never existed and is removed per B-012).
- Action: CLI Drive or `run_driver` resolves the explicit envelope path.
- Expected: the explicit real path still works because the compatibility copy remains; only omitted-envelope defaults move to the framework path. This guarantee covers only the correct single-`coding` path; it does not preserve the doubled `run_driver` default.
- Seam: `cli/drive/subcommand.ts` / `domains/shared/extensions/orchestration/driver-tool.ts`
- Test: `tests/cli/drive/run.test.ts` > `honors an explicit legacy bundled coding envelope path`
- Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-025`

## Design

### Module boundaries and dependency direction

- `lib/domains/default-domain.ts` owns framework default-domain semantics. It may import the `DomainResolver` type and inspect `resolver.registry`, but it must not import CLI, package, prompt, or agent-session code.
- `lib/agents/session-assembly.ts`, `lib/agent-packages/build.ts`, `lib/agents/skills.ts`, and `cli/main.ts` consume the default-domain helper. They should not each open-code `main` fallback logic. The `cli/main.ts` dump-prompt path specifically gets a small extracted, injectable helper `resolveDumpPromptDomain(definition, resolver)` (consuming `resolveDefaultDomain`) so its fallback is testable with a hand-built domainless def (the in-production `?? "coding"` there is otherwise dead through `resolveDefaultLead`).
- `cli/main.ts` owns CLI run/init guard behavior. Its runnable-default check should be a small pure helper (for example `hasRunnableDefaultDomain(runtime)`) that treats `main` as usable. **Replace `hasInstalledDomain` at its single definition (`cli/main.ts:295`)** so `selectRunMode` (`:281`), the no-domain guard (`:468`), and init all consume the one predicate — do not swap it only inside the guards. It should not mention `coding` in required-next-step copy.
- `lib/driver/default-envelope.ts` owns the framework default Drive envelope path. It depends only on Node path/fs utilities. Both CLI Drive and shared `run_driver` import it.
- `lib/prompts/framework/drive/envelope.md` is framework orchestration prompt content. It is not a domain asset and must not be resolved through `DomainResolver`.
- `tests/helpers/domain-package-fixture.ts` owns synthetic installable-domain package creation for tests. Tests use it rather than reaching into `bundled/coding` when they need package/loader realism.
- Dogfood resolution evidence should come from the existing spawn/driver seam. If current artifacts do not expose the resolved agent identity, add the smallest observable event needed at spawn preparation time (requested role + resolved qualified agent id) and map it into Drive activity; do not add a second resolution path.

### Default-domain helper contract

Implement this small public contract (exact names may vary only if call sites and tests stay clearer):

```ts
export const DEFAULT_DOMAIN_ID = "main";

export function resolveDefaultDomain(options: {
  explicitDomain?: string;
  resolver?: DomainResolver;
  purpose: string;
}): string;
```

Rules:

1. Return `explicitDomain` when present.
2. If no explicit domain and a resolver is provided, require `resolver.registry.has("main")`; otherwise throw `No default domain "main" is installed; <purpose> requires an explicit domain.`
3. If no resolver is provided, return `"main"`. File-based callers and tests must provide `main` resources when they exercise domainless fallback; otherwise prompt/extension file errors remain path-specific.

Use one local `const agentDomain = resolveDefaultDomain(...)` in `buildSessionParams()` for prompt assembly, extension path resolution, and skill visibility. Do **not** change the runtime identity marker in `buildSessionParams()` from `qualifyAgentId(def.id, def.domain)`; a domainless synthetic definition remains unqualified for registry/authorization identity, while `agentDomain` is the resource lookup fallback.

### CLI runnable-default contract

Replace the current third-party-domain guard semantics with a default-lead/domain availability check:

- `shared` alone or an empty runtime is not runnable by default.
- `shared` + `main` is runnable because `main/cosmo` is the default lead.
- Additional domains such as `coding` remain runnable exactly as before.
- Normal interactive/print mode and `init` use the same predicate so they cannot diverge.
- Guard messages should say to install or enable a domain/default assistant; they must not say `cosmonauts install coding` as the required next command.

This is a CLI edge seam; do not route domain loading or registry logic through CLI helpers.

### Drive default envelope contract

Copy the existing envelope content from `bundled/coding/drivers/templates/envelope.md` to:

```text
lib/prompts/framework/drive/envelope.md
```

Add `lib/driver/default-envelope.ts` with:

```ts
export function resolveDefaultDriveEnvelopePath(frameworkRoot?: string): string;
```

Rules:

1. Resolve the omitted-envelope default to `<frameworkRoot>/lib/prompts/framework/drive/envelope.md`.
2. Throw an actionable error if it is absent.
3. CLI `--envelope` and tool `envelopePath` still override the default exactly as before.
4. The Pi `run_driver` tool and `/skill:drive` wording must say "framework default Drive envelope", not the bundled-coding wording. (The current wording lives in two `domains/shared/skills/drive/SKILL.md` spots — lines ~51 "bundled codebase-agnostic coding envelope" and ~66 — plus the `driver-tool.ts` tool-param description; `capabilities/drive.md` needs no change.)
5. **Remove the doubled `BUNDLED_CODING_ENVELOPE` constant in `driver-tool.ts:385-392`** — it points at a nonexistent `bundled/coding/coding/...` path (pre-existing bug) and must not be preserved as a compatibility default.
6. Leave the real `bundled/coding/drivers/templates/envelope.md` in place in Wave 1 as a compatibility copy for explicit callers of that (correct, single-`coding`) path. The framework must not reference it by default.

### Dogfood Drive resolution evidence contract

B-020 and B-021 require proof of the actual resolved agent domain:

- Automated test proof: the in-process Drive backend/spawner path must be exercised far enough that `createAgentSessionFromDefinition()` would receive `coding/worker` (B-020). This is the primary, no-runtime-change proof.
- Runtime evidence proof — **prefer existing artifacts.** The spec scopes this wave to "defaults and test fixtures, not runtime behavior," so the **preferred** evidence is an existing artifact: the `<!-- COSMONAUTS_AGENT_ID:coding/worker -->` session-artifact marker, or an existing durable run/event/transcript field that already shows the resolved qualified id. **Adding a new framework runtime event** (e.g. `agent_resolved` mapped into Drive activity) is an explicitly-conditional **last resort, only if no existing artifact can prove resolution — and because it adds runtime behavior beyond this wave's stated scope, flag it as a scope exception requiring human sign-off** rather than treating it as in-scope by default.
- The smoke command must use `backend: "cosmonauts-subagent"`, omit `envelopePath`, and run without a project `domain` override. It must not be replaced by a list-agents or chain-list check.

### Synthetic package fixture contract

Create `tests/helpers/domain-package-fixture.ts` with plain functions, not classes:

- `writeSyntheticDomainPackage(packageRoot, options)` writes a package root using `path: "."` and returns useful paths.
- `writeProjectInstalledDomainPackage(projectRoot, options)` writes under `<projectRoot>/.cosmonauts/packages/<packageName>` so black-box CLI tests exercise the same scanner/store path as real installed packages.

The options should cover only current needs: `packageName`, `domainId`, `lead`, agents, prompts, capabilities, skills, and chains. Keep generated agents minimal (`tools: "none"`, empty capabilities unless requested). Do not model every possible domain asset.

Specific uses:

- `main-domain.test.ts`: synthetic package with `domainId: "coding"` because `main/cosmo` intentionally references `coding/*` today.
- `dump-prompt.test.ts`: project-installed synthetic `coding` package with `cody` so explicit coding CLI behavior is preserved without bundled content.
- Agent-spawner Bucket B tests: give fixture agents an explicit synthetic domain such as `alpha`, and load a synthetic `alpha` package with matching persona/capability files. Do not leave the planner fixture domainless and do not rely on non-existent `main/prompts/planner.md`.
- Orchestration extension helper/tests: load a synthetic bundled/installable package fixture rather than `bundled/coding` when testing runtime wiring.
- Prompt/scaffold/package scanner tests: use neutral `alpha` package ids unless the test is explicitly about user-facing `coding`.
- CLI package/export/skills/update tests: use neutral mocked package names such as `alpha` and paths such as `/framework/bundled/alpha` or temp synthetic package roots. Do not use `/framework/bundled/coding` as a generic fixture.

### Test decoupling ledger

Create `missions/plans/coding-agnostic-framework/test-decoupling-ledger.md` from a fresh search equivalent to `grep -rl coding tests/` plus a separate `grep -R bundled/coding tests/`. Every matching file must be classified as A, B, C, or Keep with a one-line disposition. `tests/coding-agnostic-fixtures.test.ts` should validate that the ledger covers every current matching test/helper file and that every row has an allowed disposition; it should not try to encode semantic keep categories independently of the ledger.

Initial ledger from planning exploration and review reconciliation:

- **Bucket A — keep real bundled coding for Wave 1; move in Wave 2**: `tests/coding-domain-rename.test.ts`, `tests/domains/coding-agents.test.ts`, `tests/domains/coding-chains.test.ts`, `tests/prompts/{cody,worker,planner,reviewer,quality-manager,spec-writer,verifier,task-manager,plan-reviewer,integration-verifier,tdd-skill,healthy-codebase-harness}.test.ts`.
- **Bucket B — re-point away from real bundled coding in Wave 1**: `tests/domains/main-domain.test.ts`, `tests/cli/dump-prompt.test.ts`, `tests/prompts/loader.test.ts` real bundled block, the real bundled-root test in `tests/packages/scanner.test.ts`, `tests/orchestration/agent-spawner.spawn.test.ts`, `tests/orchestration/agent-spawner.completion-loop.test.ts`, `tests/config/scaffold.test.ts`, `tests/agents/skills.test.ts`, `tests/skills/discovery.test.ts` real bundled-skill assertion, `tests/extensions/orchestration.test.ts`, `tests/extensions/orchestration-helpers.ts`, `tests/cli/packages/subcommand.test.ts`, `tests/cli/export/subcommand.test.ts`, `tests/cli/skills/subcommand.test.ts`, and `tests/cli/update/subcommand.test.ts` when they use coding/bundled paths as generic package fixtures.
- **Catalog split**: `tests/packages/catalog.test.ts` assertions that the production catalog contains `coding` with source `./bundled/coding` are **Keep/Wave2** because `lib/packages/catalog.ts` is explicitly excluded from Wave 1. Any mocked catalog/package fixtures in CLI tests are Bucket B and should be neutralized.
- **Bucket C — rename neutral fixtures**: synthetic `coding` ids/config examples in `tests/runtime.test.ts`, `tests/skills/discovery.test.ts`, `tests/agent-packages/{build,compatibility,definition,skills}.test.ts`, `tests/agents/{qualified-role,resolver,runtime-identity,session-assembly}.test.ts`, `tests/packages/{installer,eject,manifest,store}.test.ts`, `tests/helpers/packages.ts`, `tests/config/loader.test.ts`, `tests/cli/{main,no-domain-guard,resolve-default-lead,run/subcommand,session-per-domain-leads,session,sessions/subcommand,workflow-resolution,eject/subcommand}.test.ts`, `tests/domains/{loader,validator,registry,resolver,prompt-assembly}.test.ts`, many orchestration/extension tests that use `coding` only as a placeholder domain context, and any additional files found by the fresh ledger search.
- **Keep**: `AgentToolSet` / `tools: "coding"` coverage, qualified-role/runtime-identity examples where `coding/worker` is intentionally exercising qualified ids, `ruby-coding` domain-binding variants, `encoding`/`_encoding` false positives, Wave-2 catalog source tests, and explicit coding-flow behavior backed by synthetic installed `coding` fixtures.

### Leakage scan deliverable

Create `missions/plans/coding-agnostic-framework/leakage-findings.md` with:

- Scan commands/patterns used.
- Findings table: `Path`, `Line/pattern`, `Why it may leak`, `Disposition`, `Owner wave`.
- Allowed dispositions: `escalate`, `fix-in-Wave-2`, `fix-now`, `accepted/no-action`.

The scan is limited to `domains/shared/**` for cosmo/main/coding-specific strings and agent refs. Do not fix leakage as part of Wave 1 unless the finding is actually a Wave-1 code dependency (for example, the `run_driver` envelope coupling is fixed by AC-003, not merely reported).

### Dogfood Drive verification protocol

- Automated guard: B-020 proves the unqualified Drive worker route still resolves to `coding/worker` when no domain context is set.
- Bounded real smoke: after implementation, run at least one real Drive invocation for this plan with no explicit envelope path, backend `cosmonauts-subagent`, and no project domain override. Record command/tool call, backend, run id, task id, frozen envelope path, and resolved-agent evidence in `dogfood-drive-verification.md`.
- Acceptable resolved-agent evidence is one of: a durable event/log field containing `resolvedAgentId: "coding/worker"`; a session artifact that includes `<!-- COSMONAUTS_AGENT_ID:coding/worker -->`; or a newly added spawn-resolution event mapped into Drive activity. A run id or successful completion alone is not enough.
- The evidence can be a completed run or a run that reaches worker spawn/resolution and is intentionally stopped; it must not be a mere `--list-agents` or chain-list check.

### Decision Log

- **Central default-domain helper vs. local replacements**: chose a helper because five call sites need the same fallback and clear resolver-backed no-default error. This avoids reintroducing `?? "coding"` under a different spelling.
- **Shared+main CLI guard vs. requiring an installed coding/third-party domain**: chose shared+main runnable because `main/cosmo` is the framework default assistant and the spec explicitly requires shared+main-only coherence. The guard remains only for truly missing default capability.
- **Envelope under `lib/prompts/framework/drive/` vs. `domains/shared/`**: chose `lib/prompts/framework/drive/` because the envelope is Drive orchestration substrate, not a domain capability or persona. A shared-domain home would still make a framework feature depend on domain loading.
- **Compatibility copy for old envelope path**: leave the old bundled file in Wave 1. The framework stops using it, satisfying coding-agnostic behavior, while existing external references and stale run specs are not broken during the reversible wave.
- **Synthetic `coding` package for main/cosmo tests**: accepted because `main/cosmo` currently has explicit `coding/*` subagents and Wave 1 must not redesign routing. The fixture removes the content dependency without changing the user-facing id.
- **Catalog tests split**: production catalog assertions for `coding -> ./bundled/coding` stay until Wave 2 because the catalog source flip is explicitly excluded. Mocked CLI/package fixtures using coding are neutralized now.
- **Scan-only leakage**: accepted per spec. Findings feed Wave 2's precondition gate.

## Files to Change

- `lib/domains/default-domain.ts` (new)
- `lib/agents/session-assembly.ts`
- `lib/agents/skills.ts`
- `lib/agent-packages/build.ts`
- `cli/main.ts`
- `lib/driver/default-envelope.ts` (new)
- `cli/drive/subcommand.ts`
- `domains/shared/extensions/orchestration/driver-tool.ts`
- `domains/shared/skills/drive/SKILL.md`
- `lib/prompts/framework/drive/envelope.md` (new compatibility copy of the current envelope content)
- **Scope exception (human sign-off required), only if no existing artifact can prove Drive resolution:** `lib/orchestration/types.ts`, `lib/orchestration/agent-spawner.ts`, `lib/driver/types.ts`, `lib/driver/backends/cosmonauts-subagent.ts` — these add runtime behavior beyond this wave's "defaults and fixtures, not runtime" scope; prefer the existing `COSMONAUTS_AGENT_ID` session marker first.
- `tests/domains/default-domain.test.ts` (new)
- `tests/agents/session-assembly.test.ts`
- `tests/agents/skills.test.ts`
- `tests/agent-packages/build.test.ts`
- `tests/cli/main.test.ts`
- `tests/cli/no-domain-guard.test.ts`
- `tests/driver/default-envelope.test.ts` (new)
- `tests/cli/drive/run.test.ts`
- `tests/extensions/orchestration-driver-tool.test.ts`
- `tests/helpers/domain-package-fixture.ts` (new)
- `tests/helpers/domain-package-fixture.test.ts` (new)
- `tests/domains/main-domain.test.ts`
- `tests/cli/dump-prompt.test.ts`
- `tests/prompts/loader.test.ts`
- `tests/packages/scanner.test.ts`
- `tests/orchestration/agent-spawner.spawn.test.ts`
- `tests/orchestration/agent-spawner.completion-loop.test.ts`
- `tests/extensions/orchestration.test.ts`
- `tests/extensions/orchestration-helpers.ts`
- `tests/config/scaffold.test.ts`
- `tests/skills/discovery.test.ts`
- `tests/cli/packages/subcommand.test.ts`
- `tests/cli/export/subcommand.test.ts`
- `tests/cli/skills/subcommand.test.ts`
- `tests/cli/update/subcommand.test.ts`
- `tests/packages/catalog.test.ts` (ledger classification; only edit if needed to isolate Wave-2 catalog assertions)
- `tests/coding-agnostic-fixtures.test.ts` (new)
- Bucket C files from the ledger, expected to include: `tests/runtime.test.ts`, `tests/skills/discovery.test.ts`, `tests/agent-packages/{build,compatibility,definition,skills}.test.ts`, `tests/agents/{qualified-role,resolver,runtime-identity,session-assembly}.test.ts`, `tests/packages/{installer,eject,manifest,store}.test.ts`, `tests/helpers/packages.ts`, `tests/config/loader.test.ts`, `tests/cli/{main,run/subcommand,workflow-resolution,no-domain-guard,resolve-default-lead,session-per-domain-leads,session,sessions/subcommand,eject/subcommand}.test.ts`, `tests/domains/{loader,validator,registry,resolver,prompt-assembly}.test.ts`, and any additional files found by the fresh ledger search.
- `tests/domains/shared-main-leakage.test.ts` (new)
- `missions/plans/coding-agnostic-framework/test-decoupling-ledger.md` (new)
- `missions/plans/coding-agnostic-framework/leakage-findings.md` (new)
- `missions/plans/coding-agnostic-framework/dogfood-drive-verification.md` (new evidence)

Do **not** edit `bundled/coding/**` content in Wave 1. In particular, do not delete the old envelope file; just stop framework defaults from referencing it. Do **not** change `lib/packages/catalog.ts` or `package.json` `files`; those are Wave 2.

## Risks

- **Hidden real-bundled dependency remains in tests**: a Bucket B test may still pass only because dev-mode also loads `bundled/coding`. Mitigation: the ledger/source-scan test must confine real `bundled/coding` references to Bucket A and explicit Wave-2 keep cases.
- **Main/cosmo explicit coding refs look like leakage**: they are existing behavior, not this wave's default fallback. Mitigation: use synthetic `coding` fixture in framework tests and record broader routing concerns outside Wave 1.
- **Default-domain helper could overreach into identity**: changing domainless session identity may break orchestration authorization for synthetic unqualified agents. Mitigation: use the helper for resource lookup/visibility only in `buildSessionParams()`; leave identity marker semantics unchanged there.
- **No-resolver callers can hide missing main fixtures until runtime**: tests using only `domainsDir` must be updated to create `main` resources. Mitigation: B-003/B-004 cover domainsDir-only resource fallback, while B-002 covers resolver-backed no-default errors.
- **CLI guard could drift from default-domain semantics**: if mode dispatch or init still treats `main` as non-runnable, shared+main-only use remains blocked. Mitigation: one pure predicate used by both paths and tested with shared-only, shared+main, and shared+main+coding runtimes.
- **Drive default path could diverge between CLI and Pi tool**: there are two Drive entrypoints. Mitigation: both import `lib/driver/default-envelope.ts` and both have behavior tests.
- **Explicit old envelope path breakage**: users may have copied the old bundled envelope path. Mitigation: leave the file in place and add an explicit-path compatibility test.
- **Dogfood Drive smoke can be expensive or flaky**: a real LLM-backed run is not a good unit test. Mitigation: automate resolution with B-020 and keep the actual smoke as a bounded recorded evidence artifact with inspectable resolution proof.
- **Leakage scan becomes shelfware**: a report with no dispositions does not help Wave 2. Mitigation: add a test that fails unless every finding row has a disposition.
- **Over-broad Bucket C rename changes explicit coding behavior**: some tests intentionally cover `tools: "coding"`, `coding/*`, or catalog behavior. Mitigation: each remaining `coding` match is recorded as Keep/A/B with rationale before renaming.

Pivot / abort conditions:

- If a fallback site cannot use `main` without breaking an existing explicit coding flow, stop and revise the plan rather than introducing a special-case fallback.
- If shared+main-only CLI use cannot proceed because `main/cosmo` lacks a needed resource, stop and revise the default-domain design rather than keeping an install-coding guard.
- If moving defaults to the framework envelope reveals another runtime consumer that requires the old path, stop and either update that consumer to the framework helper or document why the compatibility copy is sufficient.
- If dogfood Drive resolution cannot be observed from existing artifacts, add the minimal spawn-resolution event described above rather than accepting unprovable evidence.
- If the Bucket B fixture helper grows into a general domain factory with unused options, stop and trim to the current tests.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project-native correctness, static-analysis, type, source-grep, CLI shared+main guard tests, and dogfood Drive evidence all pass | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | behavior-spine markers and plan evidence artifacts are present, and leakage/test-decoupling ledgers have required dispositions | artifact evidence | hard fail |
| 3 | `boundary-conformance` | bindable | bound | framework/default-domain and Drive-envelope code do not import or resolve through `bundled/coding`; Bucket B tests use synthetic packages | reviewer + source-scan evidence | hard fail |
| 4 | `mutation` | bindable | unbound | fallback-to-`coding`, install-coding guard, missing-envelope, legacy explicit-envelope removal, unclassified-test-reference, and wrong Drive-worker-domain mutants would be caught by named tests | pending | unbound; reviewer judgment required |
| 5 | `duplication` | bindable | unbound | no second default-domain, runnable-default, or default-envelope resolver is introduced | pending | unbound; reviewer judgment required |

Project-specific verification bindings required before completion: the existing project correctness suite, lint, typecheck, `grep -rn '?? "coding"' lib/ cli/`, ledger coverage for `grep -rl coding tests/`, and a recorded dogfood Drive smoke as described in B-021.

## Implementation Order

1. **Red tests and helper seams first**
   - Add `lib/domains/default-domain.ts` tests (B-001, B-002, B-009) before production changes.
   - Add CLI no-domain/init guard tests (B-022, B-023) before changing `cli/main.ts`.
   - Add `lib/driver/default-envelope.ts` tests (B-010, B-013) and explicit legacy envelope test (B-025) before copying the envelope.
   - Add the synthetic package fixture helper tests (B-014) before repointing Bucket B.

2. **Default-domain and CLI runnable-default implementation**
   - Implement `lib/domains/default-domain.ts`.
   - Replace the verified fallback sites in `lib/agents/session-assembly.ts`, `lib/agents/skills.ts`, `lib/agent-packages/build.ts`, and `cli/main.ts` dump-prompt handling.
   - Replace `cli/main.ts` no-domain/init guard semantics so `main` is a runnable default and the guard copy is domain-neutral.
   - Add/adjust the per-site behavior tests B-003 through B-008 and B-022/B-023. Update no-resolver fixtures so domainless definitions have `main` prompt/extension resources.
   - Run the source-grep gate and targeted tests before continuing.

3. **Drive default envelope relocation**
   - Copy the envelope content to `lib/prompts/framework/drive/envelope.md`; leave `bundled/coding/drivers/templates/envelope.md` untouched as a compatibility copy.
   - Implement `lib/driver/default-envelope.ts` and update both `cli/drive/subcommand.ts` and `domains/shared/extensions/orchestration/driver-tool.ts` to use it for omitted-envelope defaults.
   - Preserve explicit `--envelope` / `envelopePath` behavior, including the legacy bundled path.
   - Update `domains/shared/skills/drive/SKILL.md` and tool parameter copy from "bundled coding envelope" to "framework default Drive envelope".
   - Add CLI/tool omitted-envelope tests B-011 and B-012.

4. **Dogfood resolution observability**
   - Add or extend tests so the in-process Drive backend/spawner route proves unqualified `worker` resolves to `coding/worker` with no `domainContext` (B-020).
   - If existing session/run artifacts cannot expose the resolved id, add the minimal spawn-resolution event described in the Design section and map it into Drive activity.

5. **Bucket B fixture migration**
   - Create the synthetic installable package helper.
   - Repoint `tests/domains/main-domain.test.ts`, `tests/cli/dump-prompt.test.ts`, `tests/prompts/loader.test.ts`, `tests/packages/scanner.test.ts`, `tests/orchestration/agent-spawner.spawn.test.ts`, `tests/orchestration/agent-spawner.completion-loop.test.ts`, `tests/extensions/orchestration.test.ts`, `tests/extensions/orchestration-helpers.ts`, `tests/config/scaffold.test.ts`, `tests/agents/skills.test.ts`, `tests/skills/discovery.test.ts`, `tests/cli/packages/subcommand.test.ts`, `tests/cli/export/subcommand.test.ts`, `tests/cli/skills/subcommand.test.ts`, and `tests/cli/update/subcommand.test.ts` according to the ledger.
   - For agent-spawner tests, use explicit synthetic domains such as `alpha`; do not rely on domainless planner fixtures falling back to `main`.
   - For catalog/package CLI tests, neutralize mocked fixtures but keep real `tests/packages/catalog.test.ts` source assertions as Wave-2 Keep entries.
   - Preserve explicit user-facing `coding` behavior by backing it with a synthetic installed `coding` package when the test needs a loaded domain.

6. **Bucket C neutral renames and ledger**
   - Generate/update `test-decoupling-ledger.md` from a fresh search.
   - Rename neutral placeholder domains to `alpha`, `beta`, or `test-domain` in Bucket C files.
   - Add `tests/coding-agnostic-fixtures.test.ts` to validate ledger coverage and dispositions for every remaining `coding` test reference, including package/catalog splits and grep false positives.

7. **Leakage scan deliverable**
   - Scan `domains/shared/**` for cosmo/main/coding-specific strings and agent refs.
   - Write `leakage-findings.md` with dispositions for every item.
   - Add `tests/domains/shared-main-leakage.test.ts`.

8. **Existing coding and dogfood verification**
   - Verify explicit `coding/*` flows still work with coding bundled, including `--dump-prompt -d coding` backed by a synthetic installed coding fixture and a coding chain/listing path backed by the real bundled domain where appropriate.
   - Run or reuse a bounded real dogfood Drive smoke with no explicit envelope path, backend `cosmonauts-subagent`, and record command/runId/taskId/envelope/resolved-agent evidence in `dogfood-drive-verification.md`.

9. **Full gates and handoff**
   - Run the project correctness, lint, and type gates. **Run typecheck/lint specifically after the Bucket C mass-rename** — renamed fixture ids commonly cause unused-import/type drift.
   - Run `grep -rn '?? "coding"' lib/ cli/` and record zero matches.
   - **Regenerate the ledger from a fresh `grep -rl coding tests/`** against the post-implementation tree (so this wave's OWN new coding-referencing test files are forced into a disposition), and re-run `tests/coding-agnostic-fixtures.test.ts` so it fails on any unclassified file.
   - Have `tests/coding-agnostic-fixtures.test.ts` assert that **Bucket A files still reference real `bundled/coding`** (so an accidental Wave-1 repoint of a Bucket A test fails, not just gets reclassified).
   - If any unexpected `coding` reference remains in tests, update the ledger disposition or rename it before marking the plan ready for Wave 2.
   - If any step uncovers physical-extraction work (catalog URL, `bundled/` removal, import rewrites), do not implement it here; record it as Wave 2 follow-up.
