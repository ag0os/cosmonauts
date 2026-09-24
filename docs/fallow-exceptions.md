# Fallow Exceptions

This repository is Fallow-compliant with a small set of intentional exceptions.
The desired steady state is fewer exceptions over time: framework/public API
configuration should remain, while temporary migration debt should be removed by
refactoring the underlying code.

## Current Gate

Cosmonauts exposes the change-regression gate through the provider-neutral
`changed-scope-audit` capability. The `analysis_audit` tool requires an
explicit base, runs only after per-project execution consent, and preserves the
provider's complete structured result. A failed or unavailable binding is
reported explicitly; it is never converted to a pass.

For direct provider diagnosis, the equivalent change-scoped operation is:

```bash
fallow audit --base <base-sha> \
  --dead-code-baseline .fallow-baselines/dead-code.json \
  --health-baseline .fallow-baselines/health.json \
  --dupes-baseline .fallow-baselines/dupes.json \
  --format json --quiet --no-cache --fail-on-issues
```

`fallow audit` is not a full-project cleanliness check. Current policy has two
scopes:

- Change regression blocks a `fail` verdict or a provider runtime failure from
  the explicit base. Unbound capability state remains visible and requires
  reviewer judgment.
- Full-project debt remains a separate paydown effort. The committed
  `dead-code.json`, `health.json`, and `dupes.json` files are all active
  changed-scope floors. The duplication baseline exists even though the
  2026-09-10 full-project duplication scan was below its failure threshold.

The three files were adopted as-is. `.fallow-baselines/manifest.json` records
their SHA-256 digests and last-writer commits. Review never refreshes them.
To refresh selected floors after deliberate debt work, run
`bun run refresh:fallow-baselines -- --base <revision> --reason '<reason>' --category dead-code`
(repeat `--category` for `health` or `dupes`). The script appends the base,
resolved commit, reason, timestamp, and new digest to provenance. A missing or
unreadable file fails the audit; it does not cause an unbaselined scan.

New inline suppressions require a human-listed exception in the **base**
revision of `.cosmonauts/suppression-exceptions.json`. Run
`bun run check:suppressions -- --base <revision>` to compare current source
directives with that base-owned registry. Editing the registry in the same
change cannot authorize a new directive. The registry tracks intentional
Fallow, Biome, and TypeScript directives by directive and target fingerprint.

## Configuration Exceptions

### Public API entry points

Declared in `missions/architecture/staged-code.toml` under `public` and
configured in `fallow.toml` under `entry`. The reachability command checks that
`entry` contains exactly these public paths plus the owner-backed `staged` paths.

Reason: public API.

Cosmonauts publishes TypeScript source and supports consumers and tests
deep-importing stable module entry points such as `lib/agents/index.ts`,
`lib/analysis/index.ts`, `lib/domains/index.ts`, `lib/runtime.ts`, and selected
orchestration modules. `lib/analysis/index.ts` is the provider-neutral public
boundary for capability vocabulary, bindings, requests, results, failures, and
pure resolution. Those exports may be externally consumed even when no
in-repository import exists.

What is needed to remove this exception:

- Publish a single explicit package export surface and stop supporting deep
imports for these modules, or move public API declarations into files that
Fallow already recognizes as package entry points.

This is not temporary unless the package API strategy changes.

### Runtime-loaded domain and extension files

Configured in `fallow.toml` under `dynamicallyLoaded`.

Reason: framework convention.

Cosmonauts and Pi load these files by convention through runtime discovery and
dynamic import:

- `bundled/*/agents/*.ts`
- `bundled/*/domain.ts`
- `bundled/*/workflows.ts`
- `domains/shared/domain.ts`
- `domains/shared/extensions/*/index.ts`
- `domains/shared/workflows.ts`

What is needed to remove this exception:

- Replace convention-based discovery with static imports or a generated manifest
that Fallow can follow as a normal import graph.

This is not temporary while the domain/plugin architecture remains dynamic.

## Framework Health Stage 3 Deletions

- `lib/orchestration/spawn-compiler.ts`: no shipped module imported the graph
  compiler. Its only importer was `tests/orchestration/spawn-compiler.test.ts`,
  which was deleted with it.
- `lib/driver/run-run-loop.ts`: the shipped graph runner imported only its
  `RunRunLoopCtx` type, while `runRunLoop` was exercised only by
  `tests/driver/run-run-loop.test.ts`. The graph runner now uses the equivalent
  `RunOneTaskCtx` type directly; the unused loop and its test were deleted.
- `lib/harness-adapters/index.ts`: no shipped module imported this barrel.
  Shipped callers import the adapter modules directly, so the barrel was deleted.

## Review Rules For Future Exceptions

- Prefer fixing the code over adding a suppression.
- If an exception is needed, make it line-specific or pattern-specific.
- Document the reason using one of: public API, framework convention, generated
  file, optional tooling dependency, false positive, or temporary migration debt.
- Refresh baselines only after deliberate cleanup, with a literal base and
  recorded reason. Keep changed-scope audit failing on introduced issues.
- Remove stale suppressions as soon as refactoring brings a function below the
  threshold.
