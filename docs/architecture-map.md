# Architecture Map

Cosmonauts W1 architecture maps are generated TypeScript code-structure records
under `memory/architecture/`. They are derived files: agents and humans can read
them, but source code and `.cosmonauts/config.json` remain the inputs.

## W1 scope

W1 supports TypeScript projects only. A project is supported when it has a
`tsconfig.json` or included `.ts`/`.tsx` source files after exclusions. The
mechanical map is generated from source and analyzer/configuration inputs; model
calls are only for optional narrative text in later generator work.

## Generated layout

Generated bundles use this layout:

```text
memory/architecture/
  index.md
  modules/<resource>.md
```

`index.md` is the progressive-disclosure index. Module shards preserve the module
resource where possible, for example `memory/architecture/modules/lib/agents.md`.
Generated W1 bundles never include an OKF `log.md`; `log.md` is reserved for
curated W2+ architecture records where human-authored history is useful.

## OKF vocabulary

The architecture map uses OKF v0.1-style markdown with YAML frontmatter. Every
generated record carries the OKF fields `type`, `title`, `description`,
`resource`, `tags`, and `timestamp`.

Cosmonauts defines this W1 type vocabulary:

- `code-structure-index` for `memory/architecture/index.md`
- `code-structure-module` for module shard files

Generated records may also carry project-specific keys such as
`generatorVersion`, `projectHash`, `statFingerprint`, `sourceHash`,
`skeletonHash`, `narrativeStatus`, and `moduleCount`.

## Config escape hatch

Projects can add an optional `architectureMap` object to
`.cosmonauts/config.json`:

```json
{
  "architectureMap": {
    "sourceRoots": ["lib", "cli"],
    "moduleRoots": ["lib/agents"],
    "exclude": ["fixtures"],
    "injectionMaxBytes": 24000,
    "narrative": {
      "enabled": true,
      "maxModulesPerRun": 20
    }
  }
}
```

Only those primitive fields are accepted. Malformed entries are ignored with
warnings. `sourceRoots`, `moduleRoots`, and `exclude` entries must be
repo-relative paths inside the project root; absolute paths, traversal, and
existing paths that resolve outside the project root are ignored.

Unrelated project config, such as `domainBindings`, is not part of map
freshness. Only the resolved `architectureMap` section and analyzer inputs that
affect TypeScript source inclusion or module resolution are map-relevant.

## Freshness

Freshness has two tiers:

- Generate-time truth: a content-hash `ProjectSnapshot` compares the persisted
  `projectHash` in `index.md` frontmatter against current source files, resolved
  architecture-map config, and analyzer config files.
- Turn-time check: a cheap stat fingerprint compares the persisted
  `statFingerprint` against a hash of repo-relative path, size, and `mtimeMs` for
  each included source and map-relevant analyzer config file.

Both tiers are reconstructed from persisted map frontmatter and current disk
state. Correctness does not depend on process-local cache.
