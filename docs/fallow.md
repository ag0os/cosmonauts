# Fallow Codebase Intelligence

Fallow is a codebase-intelligence tool for TypeScript and JavaScript. It combines
dead-code analysis, dependency-graph checks, duplication detection, code-health
metrics, architecture-boundary enforcement, and feature-flag discovery in one
tool.

This page is a practical map of the capabilities Cosmonauts can use. It is not a
replacement for Fallow's exhaustive reference.

- Full documentation: <https://docs.fallow.tools>
- Source documentation: <https://github.com/fallow-rs/docs>
- Fallow repository: <https://github.com/fallow-rs/fallow>
- Local agent skill: `bundled/coding/skills/fallow/SKILL.md`
- Cosmonauts configuration: [`../fallow.toml`](../fallow.toml)
- Provider-neutral runtime contract:
  [`analysis-capabilities.md`](analysis-capabilities.md)
- Cross-provider schema evidence:
  [`analysis-provider-validation.md`](analysis-provider-validation.md)
- Cosmonauts exception policy: [`fallow-exceptions.md`](fallow-exceptions.md)
- Recommended workflow integration:
  [`fallow-workflow-integration.md`](fallow-workflow-integration.md)

This guide was reviewed against the current Fallow documentation and the Fallow
2.54.2 CLI available in this repository's development environment in July 2026.
Check `fallow --version` and the upstream documentation when upgrading.

## What Fallow Is And Is Not

Fallow's free static layer answers questions about code reachability, dependency
structure, duplication, complexity, and architecture. Its optional paid runtime
layer can merge production execution data into health analysis.

Fallow does not replace:

- `tsc` for TypeScript type checking;
- Biome, ESLint, or Prettier for style and formatting;
- Vitest or another test runner for behavioral correctness;
- dependency-vulnerability or security scanners;
- runtime debugging and observability;
- bundle-size analysis or performance profiling.

Use Fallow alongside those tools. A clean Fallow result means the configured
structural checks passed for the selected scope; it does not mean the program is
correct.

## Cosmonauts Runtime Adapter

Cosmonauts ships Fallow `2.54.2` as the reference implementation behind its
provider-neutral analysis capabilities. The stable public contract lives at
[`../lib/analysis/index.ts`](../lib/analysis/index.ts); Fallow detection,
process execution, and normalization remain in the `project-tools` extension.

The adapter recognizes `.fallowrc.json`, `fallow.toml`, `.fallow.toml`, and a
project package dependency. It resolves only an explicitly configured
executable, the target project's package-installed binary, or an injected test
binary. It never searches `PATH` and never performs a mutable package fetch.
Before executing a project-resolved binary, it requires per-project consent
recorded outside the repository.

When bound, the adapter exposes:

| Capability | Fallow operation and delivered scope |
|---|---|
| `dead-code` | Project or explicit paths. |
| `duplication` | Project only. |
| `complexity` | Project only; cyclomatic, cognitive, and CRAP metrics. |
| `boundary-conformance` | Project or explicit paths, only when zones and rules are configured. |
| `changed-scope-audit` | Changed scope from a required explicit base. |
| `trace` | Exactly one symbol (required project-relative path), file, dependency, or duplicate location (required positive line; optional column). |
| `fix-preview` | Project-only dry-run proposals. |

All provider invocations are shell-free and timeout-bounded. Analysis, config
introspection, and preview operations are cache-disabled; version detection is
intrinsically read-only. Completed findings preserve parsed native JSON,
stderr, and exit status. Invalid configuration, crashes, signals,
cancellation, timeouts, unsupported schemas, and unclassifiable output surface
as provider failures rather than clean results. The generic runtime never
applies a Fallow fix.

## The Command Surface

Running `fallow` without a subcommand performs the combined full-project
analysis: dead code, duplication, and health.

| Command | Purpose |
|---|---|
| `fallow` | Run the enabled dead-code, duplication, and health analyses in one pass. Use `--only` or `--skip` to choose sections. |
| `fallow audit` | Analyze files changed from a Git base and return a top-level `pass`, `warn`, `fail`, or `error` verdict. Designed for pull requests and agent-generated changes. |
| `fallow dead-code` | Analyze reachability, exports, types, package dependencies, import resolution, cycles, boundaries, and suppressions. `check` is an alias. |
| `fallow dupes` | Detect repeated code and clone families across files or directories. |
| `fallow health` | Measure function complexity, CRAP, file maintainability, coupling, hotspots, ownership, refactoring targets, coverage gaps, score, and trends. |
| `fallow flags` | Discover feature-flag patterns in environment variables, supported SDK calls, and optionally configuration objects. |
| `fallow fix` | Preview or apply supported fixes for unused exports and dependencies. |
| `fallow list` | Inspect discovered files, entry points, active framework plugins, and configured architecture boundaries. |
| `fallow config` | Show the selected configuration path and fully resolved configuration. |
| `fallow init` | Create a JSON or TOML configuration and optionally scaffold a Git hook. |
| `fallow migrate` | Convert supported Knip and jscpd configuration into Fallow configuration. |
| `fallow watch` | Re-run analysis as files change. This is interactive and never exits, so it must not be used by agents or CI. |
| `fallow schema` | Print the CLI definition as machine-readable JSON. |
| `fallow config-schema` | Print the JSON Schema for Fallow configuration. |
| `fallow plugin-schema` | Print the JSON Schema for external Fallow plugins. |
| `fallow ci-template` | Print or vendor supported CI integration templates. |
| `fallow setup-hooks` | Install or remove an agent hook that gates supported commit/push operations on `fallow audit`. |
| `fallow license` | Activate, inspect, refresh, or deactivate the license used by paid features. |
| `fallow coverage` | Set up the paid production-coverage workflow or upload a static function inventory. |

For the exhaustive flags, see the
[upstream CLI documentation](https://github.com/fallow-rs/docs/tree/main/cli)
or run:

```bash
fallow schema
```

## Dead-Code And Dependency Analysis

`fallow dead-code` builds a project graph from detected and configured entry
points. It then reports structural problems in that graph.

| Finding | Meaning | Typical response |
|---|---|---|
| Unused file | No configured or detected entry point can reach the file. | Trace the file, then delete it or declare its runtime-loading convention. |
| Unused export | No analyzed consumer imports the exported value. | Trace it; remove `export`, delete the code, or mark a real public API. |
| Unused type | An exported type or interface has no analyzed consumer. | Confirm external API intent before removing the export. |
| Unused dependency | A declared package is not imported or invoked through a recognized script. | Trace it, then remove it or correct workspace ownership. |
| Unused dev/optional dependency | A package in that dependency section is not used. | Remove it or document the tooling/runtime convention. |
| Type-only production dependency | A production dependency is used only through `import type`. | Usually move it to `devDependencies`. |
| Test-only production dependency | A production dependency is imported only by tests. | Usually move it to `devDependencies`. |
| Unused enum member | An enum value is never referenced. | Remove it after checking external serialization contracts. |
| Unused class member | A method or property is never used. Decorated framework members are handled conservatively. | Remove it or configure a framework-invoked member. |
| Unresolved import | Fallow cannot resolve an import specifier. | Fix the path, package exports, or resolution conditions. |
| Unlisted dependency | Code imports a package not declared in the appropriate manifest. | Add it to the owning package. |
| Duplicate export | The same exported name appears at multiple locations. | Decide whether one should be canonical; identical names can still be intentional. |
| Circular dependency | The module graph contains an import cycle. | Break state, responsibility, or dependency-direction coupling. |
| Boundary violation | An import crosses a configured architecture rule. | Move the responsibility or depend through an allowed contract. |
| Stale suppression | A `fallow-ignore` comment or `@expected-unused` tag no longer matches a finding. | Remove the obsolete suppression. |

Run every dead-code category:

```bash
fallow dead-code --format json --quiet --explain
```

Limit output to selected categories with flags such as:

```bash
fallow dead-code \
  --unused-files \
  --unused-exports \
  --circular-deps \
  --boundary-violations \
  --format json \
  --quiet \
  --explain
```

Filter flags are additive. Supplying `--unused-exports` does not run a full
dead-code audit and then merely highlight exports; it selects that issue type for
the result.

### Entry Points And Runtime Loading

Reachability is only as correct as the project model. Fallow derives entry
points from package scripts, package exports, and framework plugins, then merges
explicit configuration.

Use configuration instead of scattered suppressions when a convention applies
to many files:

- `entry` for additional executable or public entry points;
- `publicPackages` for workspace packages whose APIs have external consumers;
- `dynamicallyLoaded` for plugins, routes, locales, or modules loaded by
  convention;
- `usedClassMembers` for framework-invoked members not covered by a built-in
  plugin;
- `resolve.conditions` for custom package export/import conditions.

Inspect what Fallow inferred before changing the configuration:

```bash
fallow list --entry-points --format json --quiet
fallow list --plugins --format json --quiet
fallow config
```

## Duplication Analysis

`fallow dupes` detects clone groups rather than relying only on exact text
matching.

| Mode | Normalization | Use |
|---|---|---|
| `strict` | Exact token sequences | Confirm literal copy/paste. |
| `mild` | Normalizes syntax details such as whitespace and semicolons | Default day-to-day gate. |
| `weak` | Also treats different literal values as equivalent | Find template-like repetition. |
| `semantic` | Also normalizes identifier names | Discover equivalent logic with renamed variables; expect more judgment and false positives. |

Useful controls include:

- `--min-tokens` and `--min-lines` to define the smallest clone;
- `--threshold` to fail above a project duplication percentage;
- `--skip-local` to focus on cross-directory clones;
- `--cross-language` for TypeScript/JavaScript matching;
- `--ignore-imports` to keep import blocks from dominating results;
- `--changed-since <ref>` for change-scoped findings;
- `--trace <file>:<line>` to inspect every clone at a location.

Example:

```bash
fallow dupes \
  --mode mild \
  --changed-since main \
  --format json \
  --quiet \
  --explain
```

A clone is evidence of repeated structure, not proof that the code should share
an abstraction. Similar code that changes for different reasons can be healthier
than a cross-boundary helper that couples unrelated modules.

## Health And Maintainability Analysis

`fallow health` combines several signals:

- cyclomatic complexity: the number of independent control-flow paths;
- cognitive complexity: an estimate of how difficult nested and branching logic
  is for a person to follow;
- CRAP: complexity combined with test coverage or a static coverage estimate;
- per-file maintainability index;
- fan-in and fan-out coupling;
- dead-code ratio and complexity density;
- function-size and interfacing risk profiles;
- project health score and penalty breakdown;
- Git churn hotspots and change-velocity trend;
- ownership, bus factor, suggested reviewers, and ownership drift;
- ranked refactoring targets with priority, effort, confidence, and evidence;
- test coverage gaps;
- saved vital-sign snapshots and metric trends.

Common views:

```bash
# Threshold findings
fallow health --complexity --format json --quiet --explain

# Project score
fallow health --score --format json --quiet --explain

# Per-file maintainability
fallow health --file-scores --format json --quiet --explain

# Complex files that also change frequently
fallow health --hotspots --since 6m --format json --quiet --explain

# Ranked cleanup opportunities
fallow health --targets --format json --quiet --explain

# Save and later compare a vital-sign snapshot
fallow health --save-snapshot --format json --quiet
fallow health --trend --format json --quiet --explain
```

The default complexity limits are configurable. Current upstream examples use:

- maximum cyclomatic complexity: `20`;
- maximum cognitive complexity: `15`;
- maximum CRAP: `30`.

Threshold overrides should name the affected files or functions and record a
reason. Prefer a time-bounded, explicit override to a broad ignore pattern.

### Runtime Coverage

The optional paid runtime layer accepts V8 or Istanbul coverage and merges
execution evidence into health reporting. This can distinguish:

- complex, frequently executed hot paths that deserve careful refactoring;
- cold paths that are stronger deletion candidates;
- high-CRAP functions that need tests or simplification;
- stale feature flags supported by production evidence.

Use `fallow coverage setup` for the guided workflow or pass the supported runtime
coverage input to `fallow health`. Runtime evidence strengthens a recommendation
but still does not prove that externally invoked or rarely used code is safe to
delete.

## Architecture Boundaries

Boundary checks enforce allowed dependency directions between named path zones.
Fallow provides presets—`layered`, `hexagonal`, `feature-sliced`, and
`bulletproof`—and custom zones/rules.

Inspect the active model:

```bash
fallow list --boundaries --format json --quiet
```

If the result says `configured: false`, a zero boundary-violation count means no
rules were enforced. It is not proof of architecture conformance.

Boundary rules are best for stable, mechanical constraints such as “the
domain-agnostic framework must not import a bundled domain.” They are less
suitable for design qualities that require human judgment.

## Feature-Flag Discovery

`fallow flags` recognizes:

- environment-variable gates such as `process.env.FEATURE_*`;
- supported feature-flag SDK calls, including common providers;
- configuration-object heuristics when enabled.

It reports locations and confidence. Run it periodically to inventory rollout
mechanisms and find candidates for retirement:

```bash
fallow flags --format json --quiet --explain
```

Static detection cannot determine whether a remote flag is currently enabled or
still receives production traffic. Combine the result with ownership, rollout
records, or runtime evidence.

## Changed-Scope Audit

`fallow audit` runs dead-code, health, and duplication analysis for files changed
from a Git base. It is the preferred operation for pull requests and agent
changes:

```bash
fallow audit --base main --format json --quiet --explain
```

Its JSON result contains:

- `verdict`: `pass`, `warn`, `fail`, or `error`;
- the resolved base and head;
- changed-file count;
- summary counts;
- nested dead-code, complexity, and duplication results.

`audit` is not a full-project cleanliness check. A passing audit means the
selected change scope introduced no blocking configured findings.

## Investigation And Tracing

Trace before deleting or moving anything that may be public or dynamically used.

| Question | CLI |
|---|---|
| Why is an export considered unused? | `fallow dead-code --trace FILE:EXPORT --format json --quiet` |
| What imports, exports, and re-exports connect a file? | `fallow dead-code --trace-file FILE --format json --quiet` |
| Where is a package imported or invoked from scripts? | `fallow dead-code --trace-dependency PACKAGE --format json --quiet` |
| What clone groups include this location? | `fallow dupes --trace FILE:LINE --format json --quiet` |

Trace output is particularly important for public APIs, runtime-loaded modules,
package scripts, and monorepo dependency ownership.

## Safe Fixes

The Cosmonauts `fix-preview` capability stops after a cache-disabled dry run and
has no apply input. Fallow can also automate supported unused-export and
dependency changes when a maintainer invokes the provider directly. Treat that
direct use as a separate mutation workflow, not as a capability call:

```bash
# 1. Preview
fallow fix --dry-run --format json --quiet

# 2. Review and trace risky candidates

# 3. Apply in a non-interactive environment
fallow fix --yes --format json --quiet

# 4. Re-run structural analysis
fallow dead-code --format json --quiet --explain

# 5. Run type checking and tests
bun run typecheck
bun run test
```

`--yes` is mandatory in a non-TTY environment. Never let an agent jump directly
to `fix --yes`, and never bulk-fix public exports without tracing them.

## Scoping, Baselines, And Production Mode

| Mechanism | Effect |
|---|---|
| `--changed-since <ref>` / `--base <ref>` | Report findings in files changed from a Git reference. |
| `--diff-file <path>` | Narrow source-anchored findings to added hunks in a unified diff. |
| `--file <path>` | Limit dead-code output to explicit files; suppress project-wide dependency findings. |
| `--workspace <pattern>` | Scope reported results while retaining the cross-workspace graph. |
| `--changed-workspaces <ref>` | Derive affected workspaces from Git changes. |
| `--production` | Exclude test/story/dev files and focus on production scripts and dependencies. |
| Per-analysis production flags | Apply production mode only to dead code, health, or duplication in a combined run. |
| Identity baseline | Suppress known findings by identity while allowing new findings to fail. |
| Regression baseline | Fail when issue counts worsen beyond an allowed tolerance. |
| Health snapshot | Preserve vital signs for longitudinal trend reporting; it is not a suppression baseline. |

Missing Git references are runtime errors. They must never silently widen an
incremental check into a full-project check.

## Configuration

Fallow searches for configuration in this order:

1. `.fallowrc.json`
2. `fallow.toml`
3. `.fallow.toml`

Important policy fields include:

- `rules`: `error`, `warn`, or `off` severity per finding type;
- `overrides`: path-specific severities;
- `duplicates`: mode, minimum size, threshold, and ignore policy;
- `health`: complexity and CRAP thresholds, ignores, and reasoned overrides;
- `audit`: changed-scope gate and optional per-analysis baselines;
- `entry`, `publicPackages`, and `dynamicallyLoaded`: reachability model;
- `boundaries`: architecture preset or custom zones/rules;
- `production`: global or per-analysis production scope;
- `ignorePatterns`, `ignoreDependencies`, and `ignoreExports`: explicit
  exceptions;
- `framework` and `plugins`: custom framework discovery.

Prefer explicit, narrow configuration over suppressions. Keep the reason for
each durable exception in [`fallow-exceptions.md`](fallow-exceptions.md).
This repository's `entry` list includes `lib/analysis/index.ts` because the
provider-neutral analysis contract is a supported public deep-import even when
no in-repository import reaches every export.

The upstream configuration reference is:
<https://github.com/fallow-rs/docs/tree/main/configuration>.

## Suppressions

Supported forms include:

```ts
// fallow-ignore-next-line
export const keptForReflection = 1;

// fallow-ignore-next-line unused-export
export const externalApi = 2;

/** @expected-unused */
export const pendingRemoval = 3;
```

File-level forms are also available. Prefer the issue-specific form.
`@expected-unused` is useful when an intentionally unused export should later be
reported as stale if it becomes used.

Treat every suppression as maintained code:

- explain why the analyzer cannot model the usage;
- prefer configuration for repository-wide conventions;
- enable and review stale-suppression findings;
- remove the suppression when the underlying condition disappears.

## Output Formats And Exit Codes

| Format | Best use |
|---|---|
| `human` | Interactive terminal output. |
| `json` | Agents, scripts, and structured persistence. |
| `sarif` | GitHub Code Scanning and SARIF consumers. |
| `compact` | Grep-friendly one-line findings. |
| `markdown` | Reports and pull-request comments. |
| `codeclimate` / `gitlab-codequality` | GitLab Code Quality and compatible systems. |

For agent consumption, use:

```bash
fallow <command> --format json --quiet --explain
```

Capture stdout, stderr, and the exit code separately.

| Exit code | Meaning |
|---|---|
| `0` | No error-severity findings, or only warn-level findings. |
| `1` | Findings violate configured severity/threshold policy. This is an analysis result, not a tool crash. |
| `2` | Runtime or invocation error, such as invalid configuration or Git base. |

`--fail-on-issues` promotes reported warn-level findings for that invocation and
should be used deliberately.

## Agent And Programmatic Interfaces

### Cosmonauts capability tools

Agents use the stable tools documented in
[`analysis-capabilities.md`](analysis-capabilities.md), not the provider CLI
surface below. `analysis_status` reports all seven capability bindings,
including provider/version, supported scopes and metrics, and diagnostic
unbound or failed state. The remaining tools return normalized findings, trace
evidence, or preview proposals while preserving the complete Fallow payload.

This runtime is shipped, but consumer prompt and allowlist rewiring belongs to
the `analysis-gate-rewiring` slice. The legacy detected-command prompt remains
temporarily so existing consumers are not stranded. The concrete Fallow skill
also remains shipped until that slice removes it; direct links to it are
therefore intentional in this document.

### CLI

The CLI has the broadest command surface and is the simplest integration point
for provider diagnosis and provider-specific maintenance. Parse JSON instead of
terminal output.

### MCP

`fallow-mcp` exposes structured tools:

| Tool | Purpose |
|---|---|
| `analyze` | Full dead-code and dependency analysis. |
| `check_changed` | Incremental analysis from a Git reference. |
| `find_dupes` | Duplication detection, optionally change-scoped. |
| `check_health` | Complexity, score, hotspots, trends, and targets. |
| `check_runtime_coverage` | Health with V8 or Istanbul runtime evidence. |
| `audit` | Combined changed-file verdict. |
| `project_info` | Files, entry points, plugins, and boundaries. |
| `list_boundaries` | Configured architecture zones and rules. |
| `feature_flags` | Feature-flag discovery. |
| `trace_export` | Explain an export's reachability and references. |
| `trace_file` | Explain a file's graph edges. |
| `trace_dependency` | Explain package imports and script usage. |
| `trace_clone` | Explain clone groups at a location. |
| `fix_preview` | Return a dry-run mutation preview. |
| `fix_apply` | Apply supported mutations. Restrict this tool to explicitly authorized mutation roles. |

Every analysis finding includes structured actions where applicable. MCP is a
good fit when the host already supports typed tools and tool-level permissions.
See the [MCP integration documentation](https://github.com/fallow-rs/docs/blob/main/integrations/mcp.mdx).

### Node Bindings

`@fallow-cli/fallow-node` exposes asynchronous native bindings:

- `detectDeadCode`;
- `detectCircularDependencies`;
- `detectBoundaryViolations`;
- `detectDuplication`;
- `computeComplexity`;
- `computeHealth`.

They return the same JSON envelopes without a subprocess. Use them in long-lived
servers or editor extensions where repeated process startup and JSON parsing are
undesirable. Write-path commands are intentionally not part of the bindings.

See the
[Node bindings documentation](https://github.com/fallow-rs/docs/blob/main/integrations/node-bindings.mdx).

## Important Limitations

- Fallow is syntactic analysis, not the TypeScript compiler.
- Fully dynamic `import(variable)` and reflection can be invisible to the graph.
- External public consumers are invisible unless the public surface is modeled.
- Production mode intentionally excludes test and development surfaces.
- Change-scoped analysis intentionally does not describe historical project
  debt.
- Semantic clone mode can surface coincidental similarity.
- A health score compresses many signals and must not replace individual
  evidence.
- Static feature-flag detection cannot prove current remote state or traffic.
- Runtime coverage is evidence from the observed workload, not proof that an
  unobserved path is unreachable.
- `watch` is interactive and must not be invoked by autonomous agents.

## Further Reading

- [Quickstart](https://github.com/fallow-rs/docs/blob/main/quickstart.mdx)
- [Dead-code analysis](https://github.com/fallow-rs/docs/blob/main/cli/dead-code.mdx)
- [Changed-file audit](https://github.com/fallow-rs/docs/blob/main/cli/audit.mdx)
- [Health concepts](https://github.com/fallow-rs/docs/blob/main/explanations/health.mdx)
- [Architecture boundaries](https://github.com/fallow-rs/docs/blob/main/analysis/boundaries.mdx)
- [Configuration overview](https://github.com/fallow-rs/docs/blob/main/configuration/overview.mdx)
- [Suppressions](https://github.com/fallow-rs/docs/blob/main/configuration/suppression.mdx)
- [CI integrations](https://github.com/fallow-rs/docs/blob/main/integrations/ci.mdx)
- [Agent skills](https://github.com/fallow-rs/docs/blob/main/integrations/agent-skills.mdx)
