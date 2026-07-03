# Review Report

base: main
range: 13488310f52f9907407cca6902c2e6e48ba0b0c0..HEAD
Overall: incorrect
overall: incorrect

## Overall Assessment

The prior round findings are addressed in the current diff, and the targeted typecheck plus reviewer-selected regression suites pass under the project test runner. The patch still has one correctness regression: generated architecture maps do not honor `.cosmonauts/config.json` architecture-map settings, while the viewer and architecture-memory freshness checks do, so configured projects can generate the wrong map and immediately report it as stale.

## Prior Findings

- id: C-004
  status: resolved
  evidence: Commit `3572da8` is present in the review range and narrows the fallow surface; `fallow.toml:5-19` now declares the stable public entry points, and the supplied final verifier reports the fallow audit passed.
- id: F-001
  status: resolved
  evidence: `bun run typecheck` now passes, and `lib/architecture-map/config.ts:134-145` builds non-undefined fallback values for `sourceRoots` and `exclude` before returning the config.
- id: F-002
  status: resolved
  evidence: `lib/architecture-map/freshness.ts:156-158` now includes `canonicalizeArchitectureMapConfig(options.config)` in the stat fingerprint, and `tests/architecture-map/freshness.test.ts:167-179` covers a config-only stale case.
- id: UR-001
  status: resolved
  evidence: `cli/architecture/subcommand.ts:93-99` sends non-JSON progress to stderr, `cli/architecture/subcommand.ts:121-128` reports map/narrative progress around generation, and `tests/cli/architecture/subcommand.test.ts:149-166` covers stderr progress plus clean JSON stdout.
- id: PR-001
  status: resolved
  evidence: `lib/artifact-viewer/loaders.ts:179-182` uses `TaskManager.listTasksReadOnly()` with a plan label filter, `lib/tasks/task-manager.ts:280-285` routes label-filtered reads through the read-only path, and `tests/artifact-viewer/loaders.test.ts:162-206` verifies unrelated task files are not parsed.
- id: I-001
  status: resolved
  evidence: `domains/shared/extensions/architecture-memory/index.ts:72-83` defines the planned `module` parameter and keeps `resource` as a deprecated alias, with traversal/read coverage in `tests/extensions/architecture-memory.test.ts:87-115`.
- id: I-002
  status: resolved
  evidence: `lib/architecture-map/generator.ts:301-307` writes shard frontmatter `resource: record.resource`, and `domains/shared/extensions/architecture-memory/index.ts:207-208` plus `:287-316` read shard frontmatter resources instead of index rows; tests cover this at `tests/architecture-map/generator.test.ts:72` and `tests/extensions/architecture-memory.test.ts:103-111`.

## Findings

- id: F-003
  priority: P2
  severity: medium
  confidence: 0.95
  complexity: simple
  title: "[P2] Load project architecture-map config during generation"
  files: lib/architecture-map/generator.ts
  lineRange: lib/architecture-map/generator.ts:53-56
  summary: When a project sets `.cosmonauts/config.json` `architectureMap` options such as `sourceRoots`, `moduleRoots`, or `narrative.enabled`, `cosmonauts architecture generate` still resolves only defaults plus ad-hoc overrides because the generator calls `resolveArchitectureMapConfig()` without loading/passing `projectConfig`. The viewer and architecture-memory extension do load the same config for stat freshness (`lib/artifact-viewer/server.ts:162-166`, `domains/shared/extensions/architecture-memory/index.ts:53-56`), so configured projects can generate a map with default roots and then have agent/viewer checks compare it against different configured inputs.
  evidence: The default CLI path calls the generator at `cli/architecture/subcommand.ts:122-128` with no config overrides, and the generator only passes `projectRoot` and `overrides` to `resolveArchitectureMapConfig()` at `lib/architecture-map/generator.ts:53-56`; no call-site regression test covers generation from a persisted `.cosmonauts/config.json` architectureMap section.
  suggestedFix: Have `generateArchitectureMap()` use `loadArchitectureMapConfig()` or load/pass `projectConfig` before applying `configOverrides`, and add a generator/CLI regression where `.cosmonauts/config.json` changes module discovery and the resulting freshness is current.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. `cosmonauts architecture generate` honors persisted `architectureMap.sourceRoots`/`moduleRoots` without requiring test-only overrides.
      2. The generated stat fingerprint remains current when checked through the viewer/architecture-memory config-loading path.
