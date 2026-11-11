# Fallow Codebase Intelligence

Fallow is a codebase-intelligence tool for TypeScript and JavaScript. It combines
dead-code analysis, dependency-graph checks, duplication detection, code-health
metrics, architecture-boundary enforcement, and feature-flag discovery in one
tool.

This page describes the Fallow adapter Cosmonauts uses and how this repository runs Fallow. It is not a replacement for Fallow's reference.

- Full documentation: <https://docs.fallow.tools>
- Source documentation: <https://github.com/fallow-rs/docs>
- Fallow repository: <https://github.com/fallow-rs/fallow>
- Cosmonauts configuration: [`../fallow.toml`](../fallow.toml)
- Provider-neutral runtime contract:
  [`analysis-capabilities.md`](analysis-capabilities.md)
- Cross-provider schema evidence:
  [`analysis-provider-validation.md`](analysis-provider-validation.md)
- Cosmonauts exception policy: [`fallow-exceptions.md`](fallow-exceptions.md)
- Recommended workflow integration:
  [`fallow-workflow-integration.md`](fallow-workflow-integration.md)

This reference describes the Fallow 2.54.2 adapter and development dependency pinned by this repository. Check the upstream documentation when upgrading.

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

Cosmonauts uses Fallow `2.54.2` as the reference development provider behind its
provider-neutral analysis capabilities. Consumers install `fallow` as a package dependency of the target project. The stable public contract lives at
[`../lib/analysis/index.ts`](../lib/analysis/index.ts); Fallow detection,
process execution, and normalization remain in the `project-tools` extension.

The adapter recognizes `.fallowrc.json`, `fallow.toml`, `.fallow.toml`, and a
project package dependency. It resolves the target project's package-installed binary, or a path injected by the extension's internal dependencies (used by tests). It never searches `PATH` and never performs a mutable package fetch.
Before executing a project-resolved binary, it requires per-project consent
recorded outside the repository.

When bound, the adapter exposes:

| Capability | Fallow operation and delivered scope |
|---|---|
| `dead-code` | Project or explicit paths, unless every contributing rule is disabled. |
| `duplication` | Project or explicit paths; path results are filtered after one full project run. |
| `complexity` | Project or explicit paths; cyclomatic, cognitive, and CRAP metrics; path results are filtered after one full project run. |
| `boundary-conformance` | Project or explicit paths, only when zones and rules are configured and the `boundary-violation` rule is not disabled. |
| `changed-scope-audit` | Changed scope from a required explicit base. Requires `.fallow-baselines/dead-code.json`, `health.json` and `dupes.json` in the target project; a missing or unreadable file fails the request. |
| `trace` | Exactly one symbol (required project-relative path), file, dependency, or duplicate location (required positive line; optional column). Symbol traces address exports only. |
| `fix-preview` | Project-only dry-run proposals. |

All provider invocations are shell-free and timeout-bounded. Analysis, config
introspection, and preview operations are cache-disabled; version detection is
intrinsically read-only. Completed findings preserve parsed native JSON,
stderr, and exit status. Invalid configuration, crashes, signals,
cancellation, timeouts, unsupported schemas, and unclassifiable output surface
as provider failures rather than clean results. The generic runtime never
applies a Fallow fix.

Fallow's `dead-code --trace FILE:EXPORT` traces exported names, not arbitrary
internal functions. For a readable JS/TS source whose symbol is confirmed
non-exported, `analysis_trace` returns an `unsupported-target` provider
constraint before spawning Fallow, with a suggested file trace. File tracing
shows module-level import/export context, not a proof of internal symbol
reachability. Direct, aliased, default, and supported CommonJS exports go to
Fallow; re-exports, unreadable sources, other languages, and ambiguous export
forms go to the provider rather than being declared unsupported.

For `analysis_duplication({ paths })` and `analysis_complexity({ metric, paths })`,
Fallow still analyzes the whole project once. The adapter first checks the full
result for consistency, then keeps only findings located exactly at a requested
path or beneath its directory (normalizing separators and dot segments). A
clone group survives if **any** instance is inside the scope; the other
locations remain visible for context. Locationless findings do not enter scoped
results. Only the scoped verdict changes; coverage and the complete native
payload remain available in details. Per-finding cyclomatic, cognitive, and
CRAP numeric values are promoted into optional provider-neutral metric values;
other Fallow measurements stay in tagged details. Every capability's displayed
text uses the shared 32,768-byte UTF-8 limit, a capability/provider/scope/
verdict/coverage/metric header, compact rows, and deterministic truncation or
omission text. Native JSON and stderr stay in complete `details`, never in the
model-facing text; no second provider run is needed. Thrown provider errors keep
their legacy message format under the same byte cap. No `paths` means the full
project result. For a clone-extraction verdict, call `analysis_duplication` with the owned files
and quote each surviving group or the empty result; do not infer no residue
from an unavailable or failed run.

## Provider diagnosis and repository checks

Use the project-local executable for developer checks. The library adapter does not resolve it from `PATH`.

```bash
node_modules/.bin/fallow dead-code --format json --quiet --explain --no-cache
node_modules/.bin/fallow health --format json --quiet --explain --no-cache
node_modules/.bin/fallow dupes --format json --quiet --explain --no-cache
```

For changed-scope audit, use an explicit base and all three committed floors as shown in [Fallow Exceptions](fallow-exceptions.md). Capture stdout, stderr and exit status separately. A completed findings exit is evidence, not a process crash; invalid output or runtime failure is never a clean result.

The repository's `fallow.toml` declares public entries and dynamically loaded library extensions. Duplication gates production code; repeated test setup stays local to behavior cases. Do not use broad auto-fix as proof that deletion is safe: trace a file, export or dependency before removing it, then verify behavior.

Treat every suppression as maintained code:

- explain why the analyzer cannot model the usage;
- prefer configuration for repository-wide conventions;
- enable and review stale-suppression findings;
- remove the suppression when the underlying condition disappears.

## Boundaries

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

An unavailable or failed capability is not a pass. The adapter uses CLI processes; Fallow MCP and Node bindings are not runtime dependencies of this library.

Use the [upstream documentation](https://docs.fallow.tools) for the broader Fallow CLI, configuration, MCP and Node interfaces. This library reference does not copy those API manuals.
