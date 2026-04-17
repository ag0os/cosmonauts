---
title: Domain Eject Command and Multi-Tier Domain Discovery
status: active
createdAt: '2026-04-09T02:34:41.061Z'
updatedAt: '2026-04-09T02:44:33.437Z'
---

## Summary

Add an `eject` command that copies installed domains to a visible project-local directory (`.cosmonauts/domains/`), and extend the domain scanner to discover domains from two new directory tiers: global user domains (`~/.cosmonauts/domains/`) and project-local domains (`.cosmonauts/domains/`). This gives users a graduated path: invisible store by default, visible project-local copy when they need full control, and global user overrides for personal customizations across all projects. Also fixes a bug where `installAction` doesn't pass `catalogName` to the installer, causing catalog metadata to be lost.

## Scope

**Included:**
- New scanner tiers for `~/.cosmonauts/domains/` (precedence 1.5) and `.cosmonauts/domains/` (precedence 2.5)
- `cosmonauts eject <domain-name>` command that copies a domain from installed packages to `.cosmonauts/domains/`
- Import path rewriting during eject (framework-relative `../../lib/` → `cosmonauts/lib/`) for IDE support
- Fix `catalogName` pass-through in `installAction` so catalog installs are correctly tagged
- Tests for scanner, eject, and CLI

**Excluded:**
- `cosmonauts init` scaffolding changes — the scanner auto-detects `.cosmonauts/domains/` without any config; no init changes needed
- Eject from non-package sources (bundled dev-mode, plugin dirs) — eject operates on installed packages only
- Automatic uninstall of the source package after eject — user chooses whether to keep the fallback

**Assumptions:**
- All `import type` statements in domain `.ts` files are erased at runtime by Bun, so files with stale relative imports still work
- Users who eject intend to customize; the merge strategy (project-local overrides installed) is the correct default
- The `cosmonauts` package name may not be resolvable for `import type` in projects that only have a global install — the rewrite improves IDE support for projects with cosmonauts as a dependency, and the eject output message guides users who don't

## Design

### Module structure

| Module | Responsibility | Status |
|--------|---------------|--------|
| `lib/packages/scanner.ts` | Discovers all domain sources in precedence order | Modify — add two new dir-based tiers |
| `lib/packages/eject.ts` | Core eject logic: find domain source, copy to project-local dir | New |
| `lib/packages/index.ts` | Public API re-exports | Modify — add eject exports |
| `cli/packages/subcommand.ts` | Install/uninstall/packages CLI | Modify — fix catalogName bug |
| `cli/eject/subcommand.ts` | Eject CLI subcommand | New |
| `cli/main.ts` | CLI entry point and subcommand routing | Modify — register eject |

### Dependency graph

```
cli/main.ts
├── cli/eject/subcommand.ts → lib/packages/eject.ts → lib/packages/store.ts
├── cli/packages/subcommand.ts → lib/packages/catalog.ts, lib/packages/installer.ts
└── ...

lib/runtime.ts → lib/packages/scanner.ts → lib/packages/store.ts (unchanged)
```

Dependencies point inward. `lib/packages/eject.ts` depends only on `lib/packages/store.ts` (for `listInstalledPackages`) and `node:fs`. No circular dependencies.

### Key contracts

**DomainSource** (unchanged — `lib/packages/types.ts`):
```typescript
interface DomainSource {
  domainsDir: string;
  origin: string;
  precedence: number;
}
```

**New precedence tiers:**
```
0   — builtin (framework domains/)
0.5 — bundled (dev-mode bundled/)
1   — global packages (~/.cosmonauts/packages/)
1.5 — global user domains (~/.cosmonauts/domains/)  ← NEW
2   — local packages (.cosmonauts/packages/)
2.5 — project-local domains (.cosmonauts/domains/)  ← NEW
3   — plugin dirs
```

**EjectOptions and EjectResult** (new — `lib/packages/eject.ts`):
```typescript
interface EjectOptions {
  /** Domain ID to eject (e.g., "coding") */
  domainId: string;
  /** Absolute path to the project root */
  projectRoot: string;
  /** Overwrite if target already exists */
  force?: boolean;
}

interface EjectResult {
  /** Absolute path to the ejected domain directory */
  ejectedTo: string;
  /** Name of the source package */
  sourcePackage: string;
  /** Absolute path of the source domain directory that was copied */
  sourcePath: string;
}
```

### Integration seams

**Scanner → Loader**: The scanner produces `DomainSource[]` consumed by `loadDomainsFromSources()` in `lib/domains/loader.ts`. The loader calls `loadDomains(source.domainsDir)` for each source, which calls `readdir(domainsDir)` — this will throw on a non-existent directory. Therefore, the scanner must only add user-domains and project-domains entries when those directories exist on disk.

**Eject → Store**: `ejectDomain()` calls `listInstalledPackages("user")` and `listInstalledPackages("project", projectRoot)` from `lib/packages/store.ts`. The returned `InstalledPackage` objects have `manifest.domains[].name` and `manifest.domains[].path` (defined in `lib/packages/types.ts` as `PackageDomain`). The domain source directory is `join(pkg.installPath, domain.path)`. **Critical**: the target directory is named by `domain.name` (the domain ID), NOT by the last segment of `domain.path`. The eject copies to `.cosmonauts/domains/<domain.name>/`. This ensures the scanner (which discovers domains by scanning subdirectories of `.cosmonauts/domains/`) finds the domain by its correct ID. Example: if `domain.name = "coding"` and `domain.path = "nested/coding"`, the source is `<pkg>/nested/coding/` and the target is `.cosmonauts/domains/coding/`.

**Eject domain resolution order**: When searching installed packages, local-scope packages (precedence 2) are checked before global-scope packages (precedence 1). This means eject copies from the highest-precedence installed source — the one the user is currently using. If the same domain exists in both scopes, local wins. If the same domain is provided by multiple packages within the same scope, the first match wins (undefined order within a scope — acceptable because domain conflict is already flagged at install time).

**Install → catalogName**: The `installPackage` function accepts `catalogName` in its `InstallOptions` (`lib/packages/installer.ts`). When provided, it writes `{ source: "catalog", catalogName, installedAt }` metadata. The `updateAction` reads this via `loadInstallMeta` to determine the update strategy. Currently, `installAction` doesn't pass `catalogName`, so catalog installs get `source: "local"` metadata, which breaks the update command for catalog packages.

**CLI routing**: Subcommands are detected at `cli/main.ts` via string comparison of `process.argv[2]`. Adding `"eject"` to this list routes it to the new subcommand handler.

### Seams for change

**Scanner tiers are data-driven**: Each tier is a simple `if dir exists → push DomainSource` block. Adding future tiers (e.g., workspace-level domains) requires only adding another block with a new precedence value. No abstraction needed now — the pattern is clear from the code.

**Eject import rewriting**: The rewrite transforms `from "../../lib/` patterns to `from "cosmonauts/lib/`. This is isolated in a helper function within `eject.ts`. If the import convention changes, only this function needs updating.

## Approach

### Scanner: directory-based tier scanning

Add two directory existence checks in `scanDomainSources()` between the existing package scans and plugin dir handling. Import `stat` from `node:fs/promises` and `homedir` from `node:os`. Use `stat()` to check existence before adding entries — consistent with how the scanner silently handles empty package stores.

The new entries go in this order within the function:
1. After global packages (precedence 1): check `join(homedir(), ".cosmonauts", "domains")` → add at precedence 1.5 with origin `"user-domains"` if exists
2. After local packages (precedence 2): check `join(projectRoot, ".cosmonauts", "domains")` → add at precedence 2.5 with origin `"project-domains"` if exists

### Eject: installed package → project-local copy

The eject function:
1. Scans installed packages via `listInstalledPackages` — local scope first (higher precedence), then global scope
2. Finds the first package whose `manifest.domains` contains an entry with `name === domainId`
3. Resolves the source path: `join(pkg.installPath, domain.path)`
4. Validates the source directory exists (via `stat`)
5. Checks the target: `.cosmonauts/domains/<domainId>/` — if exists and `!force`, throw descriptive error
6. If `--force`, `rm(target, { recursive: true, force: true })` first to avoid stale files from a previous eject
7. Creates `.cosmonauts/domains/` via `mkdir(parent, { recursive: true })`
8. Copies with `cp(source, target, { recursive: true })`
9. Post-copy pass: rewrites imports in all `.ts` files in the target directory tree

If no installed package provides the domain, throws: `Domain "<id>" not found in any installed package. Install it first: cosmonauts install <id>`

**Import rewrite** is a post-copy pass over all `.ts` files in the target. It uses a single regex replacement on each file's content:
- Pattern: `/from\s+"(?:\.\.\/)+lib\//g`
- Replacement: `from "cosmonauts/lib/`

This handles:
- `domain.ts` — `from "../../../lib/domains/types.ts"` (3 levels)
- `agents/*.ts` — `from "../../../../lib/agents/types.ts"` (4 levels)
- `workflows.ts` — `from "../../../lib/workflows/types.ts"` (3 levels)

All matched imports in current domain files are `import type` — erased at runtime. The rewrite is for IDE/typecheck support in projects where `cosmonauts` is a dependency.

**Symlink-installed packages**: When a package was installed via `--link`, `pkg.installPath` is a symlink. Node's `cp` follows symlinks for the source, so the ejected copy contains actual files (not symlinks). This is correct behavior — eject produces a standalone copy.

### Eject CLI output

The CLI prints:
```
Ejected "coding" to .cosmonauts/domains/coding/
Source: coding v0.1.0 (/path/to/store/coding/coding)

The installed package is still active as a fallback. To remove it:
  cosmonauts uninstall coding

Tip: Add "cosmonauts" as a dev dependency for IDE type support in ejected files.
```

### catalogName fix

Replace the `resolveSource(arg)` call in `installAction` with inline catalog detection that preserves the catalog entry name. The `resolveSource` helper remains exported for backward compatibility but the install action calls `resolveCatalogEntry` directly to capture both the resolved path and the catalog name.

## Files to Change

- `lib/packages/scanner.ts` — add `stat` from `node:fs/promises` and `homedir` from `node:os` imports; add two directory-existence-guarded `DomainSource` entries (user-domains at 1.5, project-domains at 2.5)
- `lib/packages/eject.ts` — new file: `EjectOptions`, `EjectResult` types; `ejectDomain()` function; `rewriteImports()` helper that walks `.ts` files and rewrites relative framework paths
- `lib/packages/index.ts` — re-export `ejectDomain`, `EjectOptions`, `EjectResult` from `eject.ts`
- `cli/packages/subcommand.ts` — modify `installAction` to call `resolveCatalogEntry` directly and pass `catalogName` to `installPackage`
- `cli/eject/subcommand.ts` — new file: `ejectAction()` function, `createEjectProgram()` Commander setup with `--force` flag
- `cli/main.ts` — add `"eject"` to the subcommand routing block, import `createEjectProgram`
- `tests/packages/scanner.test.ts` — add tests for user-domains (1.5) and project-domains (2.5) tiers: existence checks, full 7-tier ordering, global-user-domains overrides global-packages (1.5 > 1), local-packages overrides global-user-domains (2 > 1.5)
- `tests/packages/eject.test.ts` — new file: domain found in global package, domain found in local package (local wins), domain not found error, target exists error, force overwrite, import rewrite for domain.ts/agents/*.ts/workflows.ts, eject from link-installed package, eject with scoped package name, domain.name ≠ domain.path target naming
- `tests/cli/eject/subcommand.test.ts` — new file: CLI integration tests for success output, error output, --force flag, Commander program structure
- `tests/cli/packages/subcommand.test.ts` — add test verifying catalogName is passed through during catalog installs

## Risks

- **Risk: Ejected domain diverges from installed package.** After eject, the project-local copy and the installed package both provide the same domain ID. The merge strategy unions resources, with project-local (2.5) winning on conflicts. If the user edits the ejected copy and later updates the installed package, new agents/skills from the update appear alongside the user's modifications (lower precedence), which could be surprising.
  - **Blast radius**: Any project using the ejected domain. New agents from updated packages would appear in `--list-agents` and be spawn-able, but user-modified agents take precedence.
  - **Classification**: Mitigated. The eject output prints guidance: users can `cosmonauts uninstall <pkg>` for a clean break. The merge behavior is consistent with the existing precedence system.

- **Risk: Import rewrite regex is too broad or too narrow.** The rewrite pattern `from "(?:\.\.\/)+lib\/` could miss edge cases or match non-import uses.
  - **Blast radius**: Only ejected `.ts` files. Incorrect rewrite would affect IDE support but not runtime (all affected imports are `import type`, erased by Bun).
  - **Classification**: Mitigated. The regex targets only `from "` literal strings with `../` prefixes ending in `lib/`. All current domain files (`domain.ts`, `agents/*.ts`, `workflows.ts`) use exactly this pattern (verified by grep).

- **Risk: `readdir` throws on non-existent `.cosmonauts/domains/` directory.** If the scanner adds the source without checking existence, `loadDomains` will crash.
  - **Blast radius**: All `cosmonauts` invocations in any project — complete startup failure.
  - **Classification**: Must fix. The scanner checks directory existence via `stat()` before adding the source. No source entry is added for missing directories.

- **Risk: Import rewrite introduces IDE errors for global installs.** The rewritten `from "cosmonauts/lib/..."` imports won't resolve in projects that only have a global cosmonauts install (no local `node_modules/cosmonauts`). This creates red squiggles in ejected files.
  - **Blast radius**: IDE experience in ejected files only. Runtime unaffected (imports are `import type`, erased by Bun).
  - **Classification**: Mitigated. The eject output message recommends adding `cosmonauts` as a dev dependency. The original relative imports were equally broken from the store location — users never saw those files before eject.

## Quality Contract

- id: QC-001
  category: correctness
  criterion: "Scanner produces sources in strict precedence order: builtin(0) → bundled(0.5) → global-packages(1) → user-domains(1.5) → local-packages(2) → project-domains(2.5) → plugin(3) when all tiers are present"
  verification: verifier
  command: "bun run test -- --grep 'scanner'"

- id: QC-002
  category: behavior
  criterion: "When ~/.cosmonauts/domains/ or .cosmonauts/domains/ does not exist, the scanner produces the same output as before these changes — no errors, no extra sources"
  verification: verifier
  command: "bun run test -- --grep 'scanner'"

- id: QC-003
  category: correctness
  criterion: "ejectDomain copies the domain directory (not the package root) to .cosmonauts/domains/<domainId>/ where the target dir name comes from domain.name (the ID), and the ejected directory contains domain.ts"
  verification: verifier
  command: "bun run test -- --grep 'eject'"

- id: QC-004
  category: behavior
  criterion: "ejectDomain throws a descriptive error when the domain ID is not found in any installed package"
  verification: verifier
  command: "bun run test -- --grep 'eject.*not found'"

- id: QC-005
  category: behavior
  criterion: "ejectDomain throws when target exists without --force, and with --force it rm's the old dir before copying (no stale files)"
  verification: verifier
  command: "bun run test -- --grep 'eject.*force\\|eject.*exists'"

- id: QC-006
  category: correctness
  criterion: "Import paths in ejected .ts files (domain.ts, agents/*.ts, workflows.ts) are rewritten from relative framework paths (../../lib/) to package paths (cosmonauts/lib/)"
  verification: verifier
  command: "bun run test -- --grep 'rewrite\\|import'"

- id: QC-007
  category: integration
  criterion: "installAction passes catalogName to installPackage when installing from a catalog entry, resulting in source:'catalog' in the install metadata"
  verification: verifier
  command: "bun run test -- --grep 'catalogName\\|catalog.*install'"

- id: QC-008
  category: architecture
  criterion: "lib/packages/eject.ts depends only on lib/packages/store.ts and node:fs/node:path — no imports from cli/, domains/, or orchestration/"
  verification: reviewer

- id: QC-009
  category: behavior
  criterion: "ejectDomain works correctly when the source package was installed via --link (symlink) — produces a real copy, not a symlink"
  verification: verifier
  command: "bun run test -- --grep 'eject.*link\\|eject.*symlink'"

## Implementation Order

1. **Scanner tiers** — Add user-domains (1.5) and project-domains (2.5) directory scanning to `lib/packages/scanner.ts`. Import `stat` from `node:fs/promises` and `homedir` from `node:os`. Add tests to `tests/packages/scanner.test.ts` covering: existence checks, full 7-tier ordering, missing dirs produce no extra sources, precedence between global-user-domains (1.5) and adjacent tiers.

2. **Eject core logic** — Create `lib/packages/eject.ts` with `ejectDomain()`, `rewriteImports()` helper, and types. Create `tests/packages/eject.test.ts` covering: domain found in global package, domain found in local (local wins over global), domain not found error, target exists error, force overwrite (rm then copy — no stale files), import rewrite for domain.ts/agents/*.ts/workflows.ts, eject from link-installed package, domain.name ≠ domain.path target naming.

3. **Eject CLI** — Create `cli/eject/subcommand.ts` with `ejectAction()` and `createEjectProgram()`. Register in `cli/main.ts`. Create `tests/cli/eject/subcommand.test.ts`.

4. **catalogName fix** — Modify `installAction` in `cli/packages/subcommand.ts` to call `resolveCatalogEntry` directly and pass `catalogName` to `installPackage`. Add test to `tests/cli/packages/subcommand.test.ts` verifying the passthrough.

5. **Re-exports** — Update `lib/packages/index.ts` to export eject types and function.
