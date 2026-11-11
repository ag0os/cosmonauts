# Fallow Exceptions

The desired steady state is fewer exceptions over time: public API configuration should remain, while debt should be removed by refactoring the underlying code.

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
  changed-scope floors.

The committed floors and `.fallow-baselines/manifest.json` are the source of truth for finding identities and refresh provenance. Historical keys in a floor are not claims that those source files still exist. This reference does not duplicate an old project-health census or link deleted project records.

Review never refreshes these files.
To refresh selected floors after deliberate debt work, run
`bun run refresh:fallow-baselines -- --base <revision> --reason '<reason>' --category dead-code`
(repeat `--category` for `health` or `dupes`). The script analyzes the resolved
base in a private temporary checkout, writes the selected floors into the
working repository, and appends the base, resolved commit, reason, timestamp,
and new digest to provenance. Ahead or dirty working-tree findings cannot enter
the refreshed floors. A missing or unreadable file fails the audit; it does
not cause an unbaselined scan.

New inline suppressions require a human-listed exception in the **base**
revision of `.cosmonauts/suppression-exceptions.json`. Run
`bun run check:suppressions -- --base <revision>` to compare current source
directives with that base-owned registry. Editing the registry in the same
change cannot authorize a new directive. The registry tracks intentional
Fallow, Biome, and TypeScript directives by directive and target fingerprint.

## Configuration Exceptions

### Public API entry points

Declared in `.cosmonauts/staged-code.toml` under `public` and configured in `fallow.toml` under `entry`. The reachability command checks the public and staged paths and also roots package exports. Reason: public API. Exports can have external consumers even when no in-repository import reaches them.

The package exports map is the import boundary; use the supported short entries in the [README](../README.md). An analyzer entry path is not by itself a package import permission.

What is needed to remove this exception:

- Publish a single explicit package export surface and stop supporting deep
imports for these modules, or move public API declarations into files that
Fallow already recognizes as package entry points.

This is not temporary unless the package API strategy changes.

### Runtime-loaded extension files

Configured in `fallow.toml` under `dynamicallyLoaded`: `lib/extensions/*/index.ts`. Reason: framework convention. Cosmonauts and Pi load selected extension entry points through runtime discovery and dynamic import. No domain content is shipped.

What is needed to remove this exception:

- Replace convention-based discovery with static imports or a generated manifest
that Fallow can follow as a normal import graph.

This is not temporary while the domain/plugin architecture remains dynamic.

### Existing inline exceptions

`.cosmonauts/suppression-exceptions.json` records accepted directives by path, directive fingerprint and target fingerprint. It includes Fallow, Biome and TypeScript exceptions. It is an authorization registry, not a way to hide a new same-change directive. Check the base revision before adding a suppression.

## Review Rules For Future Exceptions

- Prefer fixing the code over adding a suppression.
- If an exception is needed, make it line-specific or pattern-specific.
- Document the reason using one of: public API, framework convention, generated
  file, optional tooling dependency, false positive, or temporary migration debt.
- Refresh baselines only after deliberate cleanup, with a literal base and
  recorded reason. Keep changed-scope audit failing on introduced issues.
- Remove stale suppressions as soon as refactoring brings a function below the
  threshold.
