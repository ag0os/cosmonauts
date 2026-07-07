# Analysis-tools audit

Plan: `code-structure-map`
Date: 2026-07-03

## Scope

This rider reviews the current static-analysis story that `architectural-memory` W1 must build beside: existing lint/typecheck/audit usage, how those signals reach the agent loop, and candidate substrates for the map analyzer. It owns only B-001 and does not implement analyzer adapters or new gates.

## Current-state evidence

### Lint, typecheck, and test gates

- `package.json` defines the project-native commands: `bun run lint` (`biome check .`), `bun run typecheck` (`tsc --noEmit`), `bun run test` (`node ./scripts/vitest-runner.mjs`), plus `format`, `format:check`, and coverage scripts.
- `AGENTS.md` names `bun run test`, `bun run lint`, and `bun run typecheck` as the verification commands after changes.
- `README.md` identifies the stack as Bun, TypeScript ESM, Vitest, and Biome.
- `biome.json` enables formatting and recommended lint rules while using git ignore handling.
- `tsconfig.json` uses `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `allowImportingTsExtensions: true`, and `verbatimModuleSyntax: true`.
- `vitest.config.ts` scopes coverage to `lib/**` with configured thresholds.

### Existing codebase audit usage

- `fallow.toml` configures public entry points and dynamically loaded domain/extension files so dead-code analysis understands Cosmonauts' public API and runtime discovery conventions.
- `docs/fallow-exceptions.md` says the intended full codebase-audit gate is `fallow audit`, with dead code, health, and duplication expected clean and no temporary duplication baseline.
- `domains/shared/extensions/project-tools/index.ts` detects `fallow.toml`, `.fallowrc.json`, `.fallowrc.toml`, or a package dependency named `fallow`, then appends a `## Detected Analysis Tools` block with audit command `npx fallow audit`.
- `tests/extensions/project-tools.test.ts` covers Fallow detection from config files and package dependencies, prompt injection, and the injected audit command.
- This repo has `fallow.toml`, but `package.json` and `bun.lock` do not list Fallow as a project dependency. Current Fallow usage is therefore configuration plus externally invoked CLI, not a runtime library Cosmonauts can assume is installed for map generation.

### Agent-loop surfacing

- `bundled/coding/agents/quality-manager.ts` loads the `project-tools` extension; worker, verifier, and fixer do not.
- `bundled/coding/prompts/quality-manager.md` instructs quality-manager to turn each item under `## Detected Analysis Tools` into a feature-branch `Codebase audit passes` verifier claim, appending `--base <merge-base-sha>` to the listed command.
- The same prompt routes verifier-native audit failures to fixer with the full audit output and a narrow-remediation constraint.
- `bundled/coding/capabilities/coding-readwrite.md` tells coding agents to discover and run the static-analysis, formatting, and build commands the project actually provides.
- `bundled/coding/prompts/verifier.md` validates explicit claims and runs checks detected from project configuration, but it does not independently discover Fallow unless quality-manager supplies the claim.

## Candidate static-analysis substrates

| Candidate | Fit for code-structure map | Fit for analysis-tools rider | Runtime/package impact | Decision |
|---|---|---|---|---|
| TypeScript compiler API | Strong. It is the canonical source for TS parsing, module resolution, exports, compiler options, `paths`, `baseUrl`, and NodeNext semantics. It can produce the planned `ModuleSkeleton` deterministically. | Narrow. It does not provide dead-code, duplication, or complexity findings by itself. | Already present as a dev dependency for `tsc`, but the published CLI would need `typescript` promoted to `dependencies` if the analyzer runs for consumers. | Select for W1 map analyzer. |
| `ts-morph` | Strong ergonomics over the TypeScript compiler API, especially declarations and export traversal. | Narrow. Same limits as compiler API for audit findings unless combined with another tool. | New dependency wrapping TypeScript; useful if raw compiler APIs make the adapter too noisy. | Viable fallback, not first choice. |
| Fallow CLI / Fallow Node bindings | Strong for codebase-health audit: dead code, duplication, complexity, dependency issues, architecture boundaries. Existing config and agent-loop surfacing already point here. | Strong for the broader `analysis-tools` track and quality-manager audits. | CLI is not in `package.json`; Node bindings would be a new runtime dependency and still do not directly provide public export signatures in the planned shape. | Keep for audit gates, do not select as W1 map substrate. |
| Dependency-cruiser | Strong dependency graph extraction and rule enforcement. | Medium for architecture-boundary audits. | New dependency and separate config. It would still need a second parser for public interface extraction. | Do not select for W1. |
| Biome | Strong lint/format gate already in use. | Useful style/static lint signal. | Already configured and packaged as a dev dependency. | Not suitable for map analysis; no public-interface/dependency skeleton contract. |
| TypeDoc | Strong documentation/public API extraction. | Weak for quality audit. | New dependency and documentation-oriented output. Dependency graph still needs separate handling. | Do not select for W1. |
| Tree-sitter / Babel parser | Good polyglot or syntax-level parsing. | Depends on custom rules. | New parsing substrate and custom resolver work. | Out of scope for TypeScript-first W1. |

## Findings

1. Cosmonauts already has a clean separation between ordinary gates and auxiliary codebase audit. Biome, `tsc`, and Vitest are project-native package scripts; Fallow is configured as a code-health audit and surfaced to quality-manager only when detected.
2. The map generator needs a substrate that owns TypeScript module resolution and public export extraction, not just a graph or health report. That makes the TypeScript compiler API the lowest-risk substrate for B-002/B-003/B-007.
3. Fallow should remain part of the `analysis-tools` quality story, because it is already configured and agent-visible through `project-tools`. It should not be the first map analyzer adapter because the repository does not currently depend on it and its strongest outputs are audit findings rather than the planned `ModuleSkeleton` public-interface contract.
4. Dependency-cruiser and TypeDoc each cover only half of the W1 map spine. Selecting either would add a dependency while still requiring the TypeScript compiler API or a similar parser for the missing half.

## Substrate recommendation

@cosmo-behavior plan:code-structure-map#B-001 audit assertion: analyzer adapter implementation is allowed to proceed using the **TypeScript compiler API** as the selected W1 map analysis substrate.

Implementation conditions:

- The adapter must implement the plan's `SourceAnalyzer` contract and produce `ModuleSkeleton` records from TypeScript compiler analysis.
- If the CLI ships this analyzer to consumers, move `typescript` from `devDependencies` to `dependencies` and update `bun.lock`, because map generation becomes runtime behavior rather than only a dev/test concern.
- Keep Fallow as the current codebase-audit substrate for agent-loop quality signals; do not couple map freshness or map generation correctness to an externally installed `npx fallow` CLI.
- If a later worker finds that the TypeScript compiler API cannot meet the public-interface, dependency-edge, or alias-resolution requirements without replacing the selected substrate, analyzer implementation is blocked for plan revision before adapter work continues.

## Map freshness configuration inputs

For the selected TypeScript compiler API substrate, map freshness must hash these analyzer/configuration inputs when they exist:

- `tsconfig.json`.
- Any `tsconfig` file reached through the `extends` chain from the active `tsconfig.json`.
- Package-scope `package.json` files that affect TypeScript `NodeNext` resolution for included source files, at minimum the project-root `package.json` in this repo.
- The resolved `.cosmonauts/config.json` `architectureMap` section, because it controls source roots, module roots, exclusions, injection cap, and narrative settings even though it is Cosmonauts map config rather than TypeScript analyzer config.

Do not hash `.fallow/cache.bin` or `.fallow/churn.bin`; they are generated tool caches. Do not hash `fallow.toml` for W1 map freshness unless a later plan revision selects Fallow as the map analyzer substrate. Fallow configuration remains relevant to quality-manager audit surfacing, not to the TypeScript compiler API map skeleton.

## Quality-contract gate

Analyzer implementation remains gated by this recommendation. A viable recommendation is present only when the `Substrate recommendation` section explicitly allows adapter work and names a selected substrate. If this section is removed, changed to `blocks`, or names no viable substrate, map analyzer adapter tasks must stop and the plan must be revised before implementation proceeds.
