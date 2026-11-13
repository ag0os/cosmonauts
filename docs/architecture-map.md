# Architecture Map

Cosmonauts architecture maps are generated TypeScript code-structure records
under `memory/architecture/`. They are derived files: agents and humans can read
them, but source code and `.cosmonauts/config.json` remain the inputs.

## Scope

The analyzer supports TypeScript projects only. A project is supported when it has a
`tsconfig.json` or included `.ts`/`.tsx` source files after exclusions. The
mechanical map is generated from source and analyzer/configuration inputs; model
calls are only for optional narrative text through an injected narrative provider.

Generate or refresh the map from the project root:

```bash
cosmonauts architecture generate
```

Use `cosmonauts arch generate` as the short alias. Pass `--no-narrative` to
write the mechanical map with pending narrative text instead of calling the
CLI-owned narrative provider. `--json` and `--plain` are available for scripted
output.

Open the local read-only artifact viewer from the project root:

```bash
cosmonauts serve
```

The server renders the architecture map and plans from their markdown source.
It is a live local server only; there is no static export and no file
watching.

## Generated layout

Generated bundles use this layout:

```text
memory/architecture/
  index.md
  modules/<resource>.md
```

`index.md` is the progressive-disclosure index. Module shards preserve the module
resource where possible, for example `memory/architecture/modules/lib/agents.md`.
Generated bundles never include an OKF `log.md`; `log.md` is reserved for
curated architecture records where human-authored history is useful.

## OKF vocabulary

The architecture map uses OKF v0.1-style markdown with YAML frontmatter. Every
generated record carries the OKF fields `type`, `title`, `description`,
`resource`, `tags`, and `timestamp`.

Cosmonauts defines this type vocabulary:

- `code-structure-index` for `memory/architecture/index.md`
- `code-structure-module` for module shard files

Generated records may also carry project-specific keys such as
`generatorVersion`, `projectHash`, `statFingerprint`, `sourceHash`,
`skeletonHash`, `narrativeStatus`, and `moduleCount`.

Narrative states are explicit. `generated` means the module has current
narrative text, `reused` means the previous narrative was kept because the
module skeleton did not change, and `pending` means the mechanical spine was
written but narrative text is unavailable for this run. Pending narratives can
be completed by a later refresh when narrative generation is enabled and budget
is available.

The library entry `cosmonauts/architecture-map` exports `generateArchitectureMap`, `createArchitectureMapMemoryStore`, configuration and freshness helpers. Consumers own the generated records.

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

Default source roots are existing directories among `src`, `lib`, `cli`, `domains` and `packages`, or `.` when none exists. Consumer domain layouts are included when present. The default exclusion set includes dependency/build output and consumer artifacts (`missions`, `memory` and `.cosmonauts`). Explicit `sourceRoots` replaces default root selection.

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

## Viewer limitations

`cosmonauts serve` is a dependency-free, read-only viewer for local markdown
artifacts. It renders a bounded markdown subset: headings, paragraphs, lists,
links, inline and fenced code, and best-effort tables. Source content is escaped
before rendering; unsupported markdown stays readable instead of becoming active
HTML. The viewer reads task status through read-only APIs and does not scaffold
task files or make plans, reviews, or map shards editable.

## Map exclusions

The map generator does not provide curated architecture-of-record, embeddings, viewer editing, static viewer export, file watching, polyglot analyzers or generated map OKF `log.md` files. General memory APIs are separate; see [Memory](memory.md).
