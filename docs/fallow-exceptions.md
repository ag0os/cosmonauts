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
- Existing duplication is baselined temporarily; new duplication fails audit.

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

### Duplication baseline

Configured in `fallow.toml` under `audit.dupesBaseline`.

Reason: temporary migration debt.

The baseline file is `.fallow/baselines/dupes.json`. It exists because current
duplicate-code cleanup is too large for a single safe pass. It keeps
`fallow audit` useful by failing only new duplicate-code findings.

What is needed to remove this exception:

- Refactor existing duplicate command handling in `cli/plans/commands/*` and
`cli/tasks/commands/*`.
- Extract shared CLI output/error helpers.
- Extract shared test builders and fixtures where repeated setup dominates
duplicate findings.
- Re-run `fallow dupes` until clone groups are acceptable without a baseline.
- Remove `.fallow/baselines/dupes.json` and `audit.dupesBaseline`.

## Inline Complexity Suppressions

All inline suppressions are narrow `// fallow-ignore-next-line complexity`
comments. They suppress one existing complex function each and are documented in
the code as temporary migration debt.

### CLI command actions

Reason: temporary migration debt.

Suppressed functions:

- `cli/tasks/commands/edit.ts`: task edit action mixes option parsing,
  validation, acceptance-criterion updates, persistence, and output.
- `cli/tasks/commands/search.ts`: search action mixes query/filter construction,
  result formatting, and output mode branching.
- `cli/tasks/commands/list.ts`: task list action mixes filtering, readiness
  checks, sorting, and presentation.
- `cli/tasks/commands/view.ts`: `outputFormatted` renders every task section in
  one function.
- `cli/tasks/commands/create.ts`: task create action mixes validation,
  persistence, and output.
- `cli/tasks/commands/delete.ts`: task delete action mixes confirmation,
  dependency checks, deletion, and output.
- `cli/plans/commands/edit.ts`: plan edit action mixes validation, persistence,
  and output.
- `cli/plans/commands/list.ts`: plan list action mixes filtering and output
  modes.
- `cli/plans/commands/delete.ts`: plan delete action mixes confirmation,
  lookup, deletion, and output.
- `cli/packages/subcommand.ts`: `installAction` handles source resolution,
  conflict handling, installation, and output.
- `cli/scaffold/commands/missions.ts`: `scaffoldMissions` writes all mission
  artifacts in one flow.

What is needed to remove these suppressions:

- Introduce small command service/helper functions for validation, output, and
  error handling.
- Share common JSON/plain/human output helpers across plan/task commands.
- Split command registration from command execution where actions are large.

### CLI/session infrastructure

Reason: temporary migration debt.

Suppressed functions:

- `cli/main.ts`: `parseCliArgs` owns init compatibility, Pi flag passthrough,
  Commander parsing, and normalization.
- `cli/main.ts`: `run` owns top-level domain/runtime setup and all mode
  dispatch.
- `cli/session.ts`: `resolveSessionManager` owns Pi's session priority cascade.
- `cli/pi-flags.ts`: `parsePiFlags` owns enabled and disabled Pi passthrough
  parsing.
- `cli/chain-event-logger.ts`: `formatChainEvent` renders every chain event type
  in one switch.

What is needed to remove these suppressions:

- Split CLI parsing into phases with separately tested helpers.
- Move mode dispatch into dedicated handlers.
- Extract session resolution branches into named strategy helpers.
- Convert event formatting into a table or per-event formatter functions.

### Orchestration and runtime internals

Reason: temporary migration debt.

Suppressed functions:

- `lib/orchestration/chain-runner.ts`: `runChain` handles stage iteration,
  completion, errors, and global limits.
- `lib/orchestration/chain-runner.ts`: `runStage` handles loop/one-shot stage
  lifecycle and result aggregation.
- `lib/orchestration/agent-spawner.ts`: `spawn` handles child session lifecycle,
  lineage persistence, trackers, plan context, and transcript writing.
- `domains/shared/extensions/orchestration/spawn-tool.ts`: child session
  promise handler performs nested spawn lifecycle work inline.
- `lib/orchestration/chain-profiler.ts`: `buildSummary` handles profiler report
  formatting in one function.
- `domains/shared/extensions/orchestration/rendering.ts`: `summarizeToolCall`
  contains renderer-specific tool cases in one switch.

What is needed to remove these suppressions:

- Extract lifecycle steps into small helpers with clear ownership.
- Separate orchestration state changes from rendering/report formatting.
- Add focused tests around the extracted helpers before removing suppressions.

### Validation, stores, and serialization

Reason: temporary migration debt.

Suppressed functions:

- `lib/domains/validator.ts`: `validateDomains` contains all validation rules in
  one pass.
- `lib/packages/manifest.ts`: `validateManifest` contains all manifest field
  checks in one function.
- `lib/packages/store.ts`: `listInstalledPackages` handles scoped manifest
  recovery and invalid entries inline.
- `lib/sessions/session-store.ts`: `generateTranscript` supports several Pi
  message shapes in one renderer.
- `lib/tasks/task-manager.ts`: `matchesFilter` supports all task CLI predicates
  inline.

What is needed to remove these suppressions:

- Extract one helper per validation rule or field group.
- Extract package entry recovery and manifest reading helpers.
- Split transcript rendering by Pi message shape.
- Split task filter predicates into composable predicate functions.

## Review Rules For Future Exceptions

- Prefer fixing the code over adding a suppression.
- If an exception is needed, make it line-specific or pattern-specific.
- Document the reason using one of: public API, framework convention, generated
  file, optional tooling dependency, false positive, or temporary migration debt.
- Avoid new baselines. A baseline is only acceptable when cleanup is staged and
  `fallow audit` still fails new issues.
- Remove stale suppressions as soon as refactoring brings a function below the
  threshold.
