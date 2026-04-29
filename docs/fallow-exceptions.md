# Fallow Exceptions

This repository is Fallow-compliant with a small set of intentional exceptions.
The desired steady state is fewer exceptions over time: framework/public API
configuration should remain, while temporary migration debt should be removed by
refactoring the underlying code.

## Current Gate

Run the full gate with:

```bash
fallow audit
```

Current policy:

- Dead code must be clean without a baseline.
- Health must report `functions_above_threshold: 0`.
- Duplication must be clean without a baseline.

There is no longer a temporary duplication baseline and no inline complexity
suppressions. Both were removed by the
`fallow-temp-exceptions-cleanup` plan; see commits on the corresponding branch
in repository history.

## Configuration Exceptions

### Public API entry points

Configured in `fallow.toml` under `entry`.

Reason: public API.

Cosmonauts publishes TypeScript source and supports consumers and tests
deep-importing stable module entry points such as `lib/agents/index.ts`,
`lib/domains/index.ts`, `lib/runtime.ts`, and selected orchestration modules.
Those exports may be externally consumed even when no in-repository import exists.

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

- `bundled/*/*/agents/*.ts`
- `bundled/*/*/domain.ts`
- `bundled/*/*/workflows.ts`
- `domains/shared/domain.ts`
- `domains/shared/extensions/*/index.ts`
- `domains/shared/workflows.ts`

What is needed to remove this exception:

- Replace convention-based discovery with static imports or a generated manifest
that Fallow can follow as a normal import graph.

This is not temporary while the domain/plugin architecture remains dynamic.

## Review Rules For Future Exceptions

- Prefer fixing the code over adding a suppression.
- If an exception is needed, make it line-specific or pattern-specific.
- Document the reason using one of: public API, framework convention, generated
  file, optional tooling dependency, false positive, or temporary migration debt.
- Avoid new baselines. A baseline is only acceptable when cleanup is staged and
  `fallow audit` still fails new issues.
- Remove stale suppressions as soon as refactoring brings a function below the
  threshold.
