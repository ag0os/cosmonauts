---
title: Test decoupling ledger
plan: coding-agnostic-framework
updatedAt: '2026-06-29T00:00:00.000Z'
---

# Test Decoupling Ledger

Regenerated for TASK-426 from a fresh post-implementation search over `tests/` using the same executable matcher as `tests/coding-agnostic-fixtures.test.ts` and the plan watch-item equivalent to `grep -rl coding tests/`:

```bash
rg -l 'coding' tests
rg -l 'bundled/coding' tests
```

Allowed buckets:

- `A`: Wave-1 keeps real bundled coding validation in place. These rows must continue to reference the real bundled coding tree until Wave 2.
- `B`: Wave-1 framework tests that intentionally use synthetic coding fixtures rather than real bundled coding.
- `Keep`: Explicit behavior, tool/capability naming, catalog, marker, or compatibility references that are not neutral placeholder domain ids.

| File | Bucket | Disposition | Rationale |
| --- | --- | --- | --- |
| `tests/agent-packages/build.test.ts` | Keep | keep-source-scan | Keeps a negative assertion that domainless source-agent fallback does not read a coding prompt or capability. |
| `tests/agent-packages/claude-binary-runner.test.ts` | Keep | keep-grep-false-positive | Matched only because file APIs use `encoding`; no coding domain or bundled coding reference is present. |
| `tests/agent-packages/claude-cli.test.ts` | Keep | keep-capability-or-tool-preset | Covers package tool preset serialization where `coding` is a tool policy, not a domain id. |
| `tests/agent-packages/codex-binary-runner.test.ts` | Keep | keep-capability-or-tool-preset | Covers package tool preset serialization where `coding` is a tool policy, not a domain id. |
| `tests/agent-packages/codex-cli.test.ts` | Keep | keep-capability-or-tool-preset | Covers package tool preset serialization where `coding` is a tool policy, not a domain id. |
| `tests/agent-packages/compatibility.test.ts` | Keep | keep-capability-or-tool-preset | Remaining references are coding capability names used to test source-agent export compatibility. |
| `tests/agent-packages/definition.test.ts` | Keep | keep-capability-or-tool-preset | Remaining references are coding capability names after neutralizing the package source domain to `alpha`. |
| `tests/agents/resolver.test.ts` | Keep | keep-capability-or-tool-preset | Remaining references are coding tool and capability values, while generic domain fixtures use neutral ids. |
| `tests/agents/session-assembly.test.ts` | Keep | keep-capability-or-tool-preset | Covers `tools: "coding"` resolution and coding-agnostic behavior markers. |
| `tests/agents/skills.test.ts` | B | bucket-b-synthetic-coding-behavior | Uses synthetic coding-package and visibility fixtures to prove Bucket B no longer reads real bundled coding. |
| `tests/chains/named-chain-loader.test.ts` | Keep | keep-domain-binding-variant | Uses `ruby-coding` as a domain-binding variant, not the bundled coding domain. |
| `tests/cli/drive/run.test.ts` | Keep | keep-legacy-envelope | Covers framework default envelope behavior while preserving explicit legacy bundled-envelope compatibility assertions. |
| `tests/cli/drive/status.test.ts` | Keep | keep-grep-false-positive | Matched only because text assertions mention `encoding`; no coding domain or bundled coding reference is present. |
| `tests/cli/dump-prompt.test.ts` | B | bucket-b-synthetic-coding-behavior | Explicit `coding/cody` behavior is proven through a synthetic installed coding package fixture. |
| `tests/cli/export/main-dispatch.test.ts` | Keep | keep-explicit-coding-flow | CLI export dispatch examples intentionally include explicit `coding/explorer` agent ids. |
| `tests/cli/export/subcommand.test.ts` | Keep | keep-package-catalog-helper | Package/export CLI tests keep B-024 markers and coding tool preset coverage after neutral package fixtures. |
| `tests/cli/main.test.ts` | Keep | keep-explicit-coding-flow | CLI argument parsing and no-domain messaging tests intentionally cover explicit `-d coding` user input. |
| `tests/cli/no-domain-guard.test.ts` | Keep | keep-explicit-coding-flow | Guard tests compare main-only behavior with an explicitly present coding domain. |
| `tests/cli/packages/subcommand.test.ts` | Keep | keep-package-catalog-helper | Package CLI output keeps catalog/package references covered by B-024 classification. |
| `tests/cli/resolve-default-lead.test.ts` | Keep | keep-explicit-coding-flow | Default-lead behavior intentionally keeps explicit coding-domain cases and B-023 markers. |
| `tests/cli/run/subcommand.test.ts` | Keep | keep-explicit-coding-flow | Run CLI parsing and binding tests intentionally cover explicit `coding/*` inputs. |
| `tests/cli/session-per-domain-leads.test.ts` | Keep | keep-explicit-coding-flow | Session directory behavior intentionally distinguishes the coding lead from other agents. |
| `tests/cli/session.test.ts` | Keep | keep-explicit-coding-flow | Session bootstrap tests intentionally cover explicit coding domain context. |
| `tests/cli/sessions/subcommand.test.ts` | Keep | keep-explicit-coding-flow | Sessions CLI fixtures intentionally include a coding agent/session name for filtering and rendering behavior. |
| `tests/cli/skills/subcommand.test.ts` | Keep | keep-package-catalog-helper | Skills CLI B-024 behavior is a package/catalog reconciliation marker with neutralized package fixtures. |
| `tests/cli/update/subcommand.test.ts` | Keep | keep-package-catalog-helper | Update CLI B-024 behavior uses neutral catalog names while retaining the plan marker. |
| `tests/cli/workflow-resolution.test.ts` | Keep | keep-explicit-coding-flow | Workflow resolution tests intentionally exercise explicit coding domain workflow lookup. |
| `tests/coding-agnostic-fixtures.test.ts` | Keep | keep-ledger-validator | The executable ledger gate contains the plan markers and matcher that enforce this ledger. |
| `tests/coding-agnostic-framework.test.ts` | Keep | keep-source-scan | Source scan intentionally searches for forbidden coding defaults. |
| `tests/coding-domain-rename.test.ts` | A | bucket-a-wave2-real-bundled-coding | Directly validates the real bundled coding domain rename state until Wave 2 extraction. |
| `tests/config/loader.test.ts` | Keep | keep-domain-binding-variant | Config loader tests include coding examples for binding diagnostics and existing domain-authoring behavior. |
| `tests/config/scaffold.test.ts` | B | bucket-b-synthetic-coding-behavior | Scaffold tests keep B-017 coverage for synthetic package/domain fixture behavior. |
| `tests/docs/domain-authoring.test.ts` | Keep | keep-explicit-coding-flow | Documentation tests intentionally preserve explicit coding examples for domain authoring docs. |
| `tests/domains/agent-models.test.ts` | A | bucket-a-wave2-real-bundled-coding | Validates real bundled coding and main agent model IDs resolve against Pi's built-in catalog until Wave 2 extraction. |
| `tests/domains/bindings.test.ts` | Keep | keep-domain-binding-variant | Domain binding tests use coding references as requested-vs-resolved binding examples. |
| `tests/domains/coding-agents.test.ts` | A | bucket-a-wave2-real-bundled-coding | Validates invariants of the real bundled coding agent definitions for Wave 1. |
| `tests/domains/coding-chains.test.ts` | A | bucket-a-wave2-real-bundled-coding | Imports the real bundled coding chains that remain bundled until Wave 2. |
| `tests/domains/default-domain.test.ts` | Keep | keep-source-scan | Source-scan tests intentionally search for forbidden coding default-domain fallbacks. |
| `tests/domains/loader.test.ts` | Keep | keep-explicit-coding-flow | Domain loader tests retain explicit coding-domain cases for loaded domain semantics. |
| `tests/domains/main-domain.test.ts` | B | bucket-b-synthetic-coding-behavior | Main-domain validation intentionally uses a synthetic coding package because main/cosmo still delegates to coding roles. |
| `tests/domains/prompt-assembly.test.ts` | Keep | keep-explicit-coding-flow | Prompt assembly tests include explicit coding prompt/capability examples. |
| `tests/domains/registry.test.ts` | Keep | keep-explicit-coding-flow | Registry tests retain explicit coding-domain examples for lookup semantics. |
| `tests/domains/resolver.test.ts` | Keep | keep-explicit-coding-flow | Resolver tests retain explicit coding-domain examples for source precedence behavior. |
| `tests/domains/shared-main-leakage.test.ts` | Keep | keep-source-scan | Source-scan artifact validator intentionally contains the coding-agnostic plan marker and scan-pattern assertions. |
| `tests/domains/validator.test.ts` | Keep | keep-capability-or-tool-preset | Validator tests include coding tool/capability values and explicit validation messages. |
| `tests/driver/backends/cosmonauts-subagent-resolution.test.ts` | Keep | keep-explicit-coding-flow | TASK-423 B-020 proof intentionally loads real bundled coding to verify dogfood Drive resolves default `worker` to `coding/worker`. |
| `tests/driver/backends/cosmonauts-subagent.test.ts` | Keep | keep-explicit-coding-flow | Backend tests intentionally preserve dogfood Drive worker resolution through `coding/worker`. |
| `tests/driver/default-envelope.test.ts` | Keep | keep-legacy-envelope | Default envelope tests assert the framework path while retaining missing legacy bundled path coverage. |
| `tests/driver/driver-script.test.ts` | Keep | keep-grep-false-positive | Matched only because generated-script assertions mention UTF-8 `encoding`; no coding domain or bundled coding reference is present. |
| `tests/driver/run-step.test.ts` | Keep | keep-grep-false-positive | Matched only because file-read test fixtures mention `encoding`; no coding domain or bundled coding reference is present. |
| `tests/extensions/agent-switch.test.ts` | Keep | keep-explicit-coding-flow | Agent switch tests intentionally cover explicit `coding/*` switching behavior. |
| `tests/extensions/architecture-memory.test.ts` | A | bucket-a-wave2-real-bundled-coding | Verifies architecture-memory is attached to exactly the real bundled coding consuming agents until Wave 2. |
| `tests/extensions/domain-bindings.test.ts` | Keep | keep-domain-binding-variant | Extension binding tests use coding-like domain names as binding variants. |
| `tests/extensions/orchestration-chain-tool-durable.test.ts` | Keep | keep-explicit-coding-flow | Durable chain tool tests intentionally include coding domain context fixtures. |
| `tests/extensions/orchestration-chain-tool-observation.test.ts` | Keep | keep-explicit-coding-flow | Observation tests intentionally include coding domain context fixtures. |
| `tests/extensions/orchestration-driver-detached.test.ts` | Keep | keep-explicit-coding-flow | Detached driver tests intentionally include coding domain context fixtures. |
| `tests/extensions/orchestration-driver-tool-graph.test.ts` | Keep | keep-explicit-coding-flow | Graph driver tool tests intentionally include coding domain context fixtures. |
| `tests/extensions/orchestration-driver-tool.test.ts` | Keep | keep-legacy-envelope | Driver tool tests cover framework default envelope plus explicit legacy bundled-envelope path behavior. |
| `tests/extensions/orchestration-helpers.ts` | B | bucket-b-synthetic-coding-behavior | Shared orchestration helper builds synthetic coding fixtures for B-017 tests. |
| `tests/extensions/orchestration-lineage.test.ts` | Keep | keep-explicit-coding-flow | Lineage tests intentionally include coding domain context fixtures. |
| `tests/extensions/orchestration-run-control-surface.test.ts` | Keep | keep-explicit-coding-flow | Run control surface tests intentionally include coding domain context fixtures. |
| `tests/extensions/orchestration-spawn-inline-compiler.test.ts` | Keep | keep-explicit-coding-flow | Spawn compiler tests intentionally include explicit `coding/worker` roles. |
| `tests/helpers/domain-package-fixture.test.ts` | B | bucket-b-synthetic-coding-behavior | Declared synthetic domain package fixture seam intentionally proves ruby-coding and synthetic-coding package behavior. |
| `tests/helpers/packages.test.ts` | B | bucket-b-synthetic-coding-behavior | Synthetic package helper test intentionally proves ruby-coding and synthetic-coding package behavior. |
| `tests/orchestration/agent-spawner.completion-loop.test.ts` | B | bucket-b-synthetic-coding-behavior | Bucket B spawner fixture uses synthetic package/domain behavior instead of real bundled coding. |
| `tests/orchestration/agent-spawner.lineage.test.ts` | Keep | keep-explicit-coding-flow | Lineage fixtures intentionally include coding domain context examples. |
| `tests/orchestration/agent-spawner.spawn.test.ts` | B | bucket-b-synthetic-coding-behavior | Bucket B spawner test preserves dogfood `coding/worker` resolution with synthetic fixtures. |
| `tests/orchestration/agent-spawner.test.ts` | Keep | keep-domain-binding-variant | Agent spawner tests keep binding and resolved-reference examples, not real bundled coding. |
| `tests/orchestration/chain-compiler.test.ts` | Keep | keep-domain-binding-variant | Chain compiler tests intentionally cover requested coding role binding semantics. |
| `tests/orchestration/chain-parser.test.ts` | Keep | keep-explicit-coding-flow | Chain parser examples intentionally include explicit `coding/*` syntax. |
| `tests/orchestration/chain-routing.test.ts` | Keep | keep-explicit-coding-flow | Chain routing tests intentionally cover explicit coding-domain route examples. |
| `tests/orchestration/chain-runner-cosmo-migration.test.ts` | Keep | keep-explicit-coding-flow | Migration characterization intentionally includes coding-domain chain context. |
| `tests/orchestration/chain-runner.test.ts` | Keep | keep-explicit-coding-flow | Chain runner tests intentionally include explicit coding-domain roles and context. |
| `tests/orchestration/chain-steps.test.ts` | Keep | keep-explicit-coding-flow | Chain step parser tests intentionally include explicit `coding/*` DSL examples. |
| `tests/orchestration/run-start-chain-characterization.test.ts` | Keep | keep-explicit-coding-flow | Run-start characterization intentionally covers coding-domain chain behavior. |
| `tests/orchestration/session-factory.security.test.ts` | Keep | keep-explicit-coding-flow | Session factory security tests intentionally include coding domain context fixtures. |
| `tests/orchestration/spawn-compiler.test.ts` | Keep | keep-explicit-coding-flow | Spawn compiler tests intentionally include explicit coding domain context. |
| `tests/packages/catalog.test.ts` | Keep | keep-package-catalog-wave2 | Production catalog assertions keep the real `coding` entry and `./bundled/coding` source until Wave 2. |
| `tests/packages/installer.test.ts` | Keep | keep-package-catalog-helper | Package installer fixtures were neutralized to `alpha`; remaining coding text is a production diagnostic example. |
| `tests/packages/scanner.test.ts` | B | bucket-b-synthetic-coding-behavior | Scanner Bucket B behavior uses synthetic bundled root fixtures and retains the B-017 marker. |
| `tests/pi-contract/pi-behavior-contract.test.ts` | Keep | keep-grep-false-positive | Matched only because comments name the `pi-coding-agent` package; no coding domain or bundled coding reference is present. |
| `tests/prompts/cody.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding Cody prompt until prompt extraction in Wave 2. |
| `tests/prompts/healthy-codebase-harness.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding capability/skill prompt surface until Wave 2. |
| `tests/prompts/integration-verifier.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding prompt until Wave 2. |
| `tests/prompts/loader.test.ts` | B | bucket-b-synthetic-coding-behavior | Prompt loader Bucket B block uses synthetic package/domain fixtures instead of real bundled coding. |
| `tests/prompts/plan-reviewer.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding prompt until Wave 2. |
| `tests/prompts/planner.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding prompt until Wave 2. |
| `tests/prompts/quality-manager.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding prompt until Wave 2. |
| `tests/prompts/reviewer.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding prompt until Wave 2. |
| `tests/prompts/spec-writer.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding prompt until Wave 2. |
| `tests/prompts/task-manager.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding prompt until Wave 2. |
| `tests/prompts/tdd-skill.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding TDD skill until Wave 2. |
| `tests/prompts/verifier.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding prompt until Wave 2. |
| `tests/prompts/worker.test.ts` | A | bucket-a-wave2-real-bundled-coding | Reads the real bundled coding prompt until Wave 2. |
| `tests/runtime.test.ts` | Keep | keep-domain-binding-variant | Runtime tests retain explicit coding and ruby-coding binding cases for domain-authoring behavior. |
| `tests/skills/discovery.test.ts` | B | bucket-b-synthetic-coding-behavior | Skill discovery Bucket B behavior uses synthetic coding fixtures and B-017 marker coverage. |
