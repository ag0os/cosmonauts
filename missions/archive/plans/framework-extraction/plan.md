---
title: Framework Extraction — Standalone Global Tool with Installable Domains
status: completed
createdAt: '2026-03-30T17:37:09.419Z'
updatedAt: '2026-04-01T03:32:49.715Z'
---

## Summary

Make Cosmonauts work as a standalone global CLI tool where domain content (agents, prompts, skills, capabilities, workflows) is installed via the package system rather than bundled in the framework's active `domains/` directory. The coding domain moves to `bundled/coding/` and gets installed to the global store (`~/.cosmonauts/packages/`) on first use. Projects only need `.cosmonauts/config.json` — no domain duplication across repos.

**All implementation happens in a git worktree** (`../cosmonauts-extraction` on branch `framework-extraction`) to avoid destabilizing the running agent session, which depends on `domains/coding/` in the current working directory.

## Scope

**Included:**
- Move `domains/coding/` to `bundled/coding/` as an installable package with `cosmonauts.json`
- Create `bundled/coding-minimal/` — a lightweight starter with cosmo, planner, worker, coordinator, task-manager, quality-manager
- First-run experience: detect no domain installed, prompt user to install from catalog
- `cosmonauts update` command for keeping packages current (re-copy bundled, or git pull)
- Verify `npm install -g cosmonauts` (or `bun install -g`) works cleanly with the new structure
- Update `cosmonauts init` to handle the "no domain yet" scenario
- Update catalog source paths to point to `bundled/` instead of `domains/`
- Install metadata (`.cosmonauts-meta.json`) written by installer for update command

**Excluded:**
- Non-coding domains (assistant, devops) — future work once the extraction proves the pattern
- Package registry/marketplace
- Cross-domain agent spawning (assistant spawning coding agents) — works with existing resolution, no new code needed

**Assumptions:**
- `domains/shared/` stays in the framework — it IS the framework's base infrastructure
- `import type` statements in agent/domain `.ts` files are erased at runtime by Bun (`verbatimModuleSyntax: true`), so files work when installed to `~/.cosmonauts/packages/` without path changes
- The package system (installer, store, scanner, resolver) from the `package-system` plan is complete and working

## Safety: Git Worktree Strategy

This plan modifies the very codebase that's running the orchestration session. Deleting or moving `domains/coding/` in the main worktree would crash every subsequent sub-agent spawn (coordinator → worker, quality-manager → reviewer, etc.) because they dynamically import from `domains/coding/` at session creation time.

**Solution:** All work happens in a git worktree:

```bash
git worktree add ../cosmonauts-extraction framework-extraction
```

- Workers operate in `../cosmonauts-extraction/` — all file edits happen there
- The original repo at `/Users/cosmos/Projects/cosmonauts/` stays untouched
- Agent definitions, prompts, and capabilities are still loaded from the original repo's `domains/`
- When done, the branch is merged back

Workers must be instructed to use `../cosmonauts-extraction/` as their working directory for all file operations. They must NOT modify files in `/Users/cosmos/Projects/cosmonauts/`.

## Design

### Module Structure

**New files:**
- `bundled/coding/cosmonauts.json` — Package manifest for the full coding domain
- `bundled/coding/coding/` — The coding domain directory (copied from `domains/coding/`)
- `bundled/coding-minimal/cosmonauts.json` — Package manifest for the minimal coding domain
- `bundled/coding-minimal/coding/` — Subset of the full coding domain (6 core agents + essential skills)
- `cli/update/subcommand.ts` — `cosmonauts update` command implementation

**Modified files:**
- `lib/packages/catalog.ts` — Update source paths from `./domains/coding` to `./bundled/coding`
- `lib/packages/installer.ts` — Write `.cosmonauts-meta.json` alongside installs for update tracking
- `cli/main.ts` — Register `update` subcommand, add first-run domain detection, dev-mode auto-bundled detection
- `lib/runtime.ts` — Graceful handling when no non-shared domains are found (no crash, just a warning)
- `domains/coding/` — Removed (moved to `bundled/coding/coding/`)
- `package.json` — Add `files` field for npm publish including `bundled/`
- `cli/main.ts` — Add dev-mode detection: when running from framework repo, auto-add `bundled/` packages as plugin sources

### Dependency Graph

No new module dependencies. This is primarily a file reorganization + CLI UX improvement:

```
cli/main.ts → cli/update/subcommand.ts → lib/packages/ (installer, store, catalog)
cli/main.ts → first-run detection → lib/packages/ (catalog, installer)
lib/packages/catalog.ts → bundled/ (path references only, no code dep)
```

### Key Contracts

#### Bundled Package Structure

Each bundled domain is a complete package, identical in structure to what a user would create:

```
bundled/coding/
├── cosmonauts.json
└── coding/
    ├── domain.ts
    ├── agents/              # All 14 agents
    ├── prompts/             # All 14 persona prompts
    ├── capabilities/        # 4 capability packs
    ├── skills/              # 8 skill directories
    └── workflows.ts         # 5 workflows

bundled/coding-minimal/
├── cosmonauts.json
└── coding/
    ├── domain.ts
    ├── agents/              # 6 core agents
    ├── prompts/             # 6 persona prompts
    ├── capabilities/        # Same 4 capabilities
    ├── skills/              # 3 essential skills
    └── workflows.ts         # 3 core workflows
```

Both packages produce domain ID `"coding"` — the minimal is a drop-in lighter alternative.

#### Install Metadata (`.cosmonauts-meta.json`)

Written by the installer alongside each package to track origin for the update command:

```json
{
  "source": "catalog",
  "catalogName": "coding",
  "installedAt": "2026-03-30T12:00:00.000Z"
}
```

Or for git sources:
```json
{
  "source": "git",
  "url": "https://github.com/user/repo",
  "branch": "main",
  "installedAt": "2026-03-30T12:00:00.000Z"
}
```

Or for local copies:
```json
{
  "source": "local",
  "originalPath": "/path/to/source",
  "installedAt": "2026-03-30T12:00:00.000Z"
}
```

Or for symlinks:
```json
{
  "source": "link",
  "targetPath": "/path/to/source",
  "installedAt": "2026-03-30T12:00:00.000Z"
}
```

#### Update Command

```typescript
interface UpdateOptions {
  target?: string;  // Package name, or undefined with --all
  all?: boolean;
  local?: boolean;  // Scope filter
}
```

Update logic per source type:
- **catalog**: re-copy from `bundled/<catalogName>/`
- **git**: `git -C <path> pull` or re-clone
- **link**: skip (already live)
- **local**: warn that source may have changed, suggest re-install

#### First-Run Detection

After `CosmonautsRuntime.create()`, before dispatching to a mode that needs agents:

```typescript
const nonShared = runtime.domains.filter(d => d.manifest.id !== "shared");
if (nonShared.length === 0 && !isMetaCommand(options)) {
  console.log("No domains installed. Install the coding domain to get started:");
  console.log("  cosmonauts install coding");
  console.log("  cosmonauts install coding-minimal  (lightweight)");
  process.exitCode = 1;
  return;
}
```

Meta commands that work without domains: `install`, `uninstall`, `packages`, `create`, `update`.

#### Dev-Mode Detection

When running from the framework repo (the repo that contains the framework source), auto-include bundled packages so developers don't need to install:

```typescript
// In cli/main.ts run()
const frameworkRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const isFrameworkRepo = await isCosmonautsFrameworkRepo(frameworkRoot);
let pluginDirs = options.pluginDirs ?? [];
if (isFrameworkRepo) {
  // Auto-add bundled packages as plugin sources
  const bundledDir = join(frameworkRoot, "bundled");
  const bundledPackages = await discoverBundledPackageDirs(bundledDir);
  pluginDirs = [...pluginDirs, ...bundledPackages];
}
```

Detection: check if `package.json` at framework root has `"name": "cosmonauts"`.

### Seams for Change

- **Bundled catalog is data, not code.** Adding a new bundled domain means: create a directory under `bundled/`, add an entry to the catalog array.
- **Update strategy per source type.** Each source type has its own update case. Adding new source types means adding one case.
- **`coding-minimal` as a subset.** Same domain ID (`coding`) as full. Users upgrade by installing full over minimal.
- **Install metadata format.** Simple JSON, easy to extend with new fields.

## Approach

### Package directory structure

A bundled package is identical in structure to any user-created package:

```
bundled/coding/
  cosmonauts.json           # { name: "coding", version: "0.1.0", domains: [{ name: "coding", path: "coding" }] }
  coding/
    domain.ts               # Same file, just relocated
    agents/                 # All 14 .ts files
    prompts/                # All 14 .md files
    capabilities/           # 4 .md files
    skills/                 # 8 skill directories
    workflows.ts
```

### Install mechanics

When a user runs `cosmonauts install coding`:
1. Catalog resolves `coding` → `./bundled/coding` (relative to framework root)
2. Installer resolves to absolute path using framework root
3. Copies to `~/.cosmonauts/packages/coding/`
4. Writes `.cosmonauts-meta.json` with `{ source: "catalog", catalogName: "coding" }`

### Update mechanics

When a user runs `cosmonauts update coding`:
1. Read `.cosmonauts-meta.json` from `~/.cosmonauts/packages/coding/`
2. Source is `catalog` → resolve catalog entry → re-copy from `bundled/coding/`
3. This gets latest content when framework is updated via `npm update -g cosmonauts`

### Global vs Local

**Global packages** (`~/.cosmonauts/packages/`):
- Default scope for `cosmonauts install`
- Where the coding domain lives for most users
- Shared across all projects

**Local packages** (`.cosmonauts/packages/`):
- Project-specific overrides via `cosmonauts install --local`
- Takes precedence over global
- Use case: custom agents, extra skills, modified domain for one project

**Project config** (`.cosmonauts/config.json`):
- Lightweight — just domain name and skill list
- No domain files, no duplication

### Dev workflow

When running from the framework repo itself:
- Auto-detect via `package.json` name
- Auto-add `bundled/coding` as a plugin source (precedence 3, highest)
- No manual install needed during development
- `domains/coding/` is deleted — `bundled/coding/coding/` is the canonical location

## Files to Change

All paths below are relative to the **worktree** at `../cosmonauts-extraction/`.

**New files:**
- `bundled/coding/cosmonauts.json` — Package manifest
- `bundled/coding/coding/` — Full coding domain (copied from `domains/coding/`)
- `bundled/coding-minimal/cosmonauts.json` — Package manifest
- `bundled/coding-minimal/coding/domain.ts` — Domain manifest
- `bundled/coding-minimal/coding/agents/` — 6 core agent definitions (cosmo, planner, task-manager, coordinator, worker, quality-manager)
- `bundled/coding-minimal/coding/prompts/` — 6 persona prompts
- `bundled/coding-minimal/coding/capabilities/` — 4 capability packs (same as full)
- `bundled/coding-minimal/coding/skills/` — 3 essential skills (engineering-principles, languages, web-search)
- `bundled/coding-minimal/coding/workflows.ts` — 3 core workflows
- `cli/update/subcommand.ts` — Update command implementation
- `tests/cli/update/subcommand.test.ts` — Update command tests

**Modified files:**
- `lib/packages/catalog.ts` — Update source paths to `./bundled/coding` and `./bundled/coding-minimal`
- `lib/packages/installer.ts` — Write `.cosmonauts-meta.json` with source metadata on install
- `cli/main.ts` — Register `update` subcommand, first-run detection, dev-mode bundled auto-include
- `lib/runtime.ts` — Graceful behavior when no non-shared domains found
- `package.json` — Add `files` field including `bundled/`, `domains/`, `lib/`, `cli/`, `bin/`
- `.gitignore` — Ensure `bundled/` is NOT gitignored
- `AGENTS.md` — Update key directories documentation
- `tests/domains/coding-agents.test.ts` — Update paths to reference `bundled/coding/coding/`
- `tests/runtime.test.ts` — Add test for "no domains" graceful behavior
- `tests/packages/catalog.test.ts` — Verify catalog resolves to `bundled/` paths

**Deleted:**
- `domains/coding/` — Entire directory (content moved to `bundled/coding/coding/`)

## Risks

1. **`import type` erasure assumption.** Bun with `verbatimModuleSyntax: true` erases `import type` at runtime. If someone uses a different TS runtime that doesn't erase type-only imports, agent definitions would fail to load from `~/.cosmonauts/packages/`. Mitigation: document the requirement, add a test.

2. **`npm install -g` file inclusion.** Must ensure `bundled/` is in the `files` field of `package.json`. Mitigation: add explicit `files` list, verify with `npm pack --dry-run`.

3. **Catalog path resolution.** `resolveCatalogEntry()` returns relative paths. The installer must resolve them relative to the framework root (where `catalog.ts` lives), not the user's cwd. Mitigation: catalog entries get resolved via `import.meta.url` at call time.

4. **`coding-minimal` maintenance.** It's a subset that must stay in sync with the full domain. Mitigation: document which agents/skills are included. Consider a build script that generates it from the full domain in the future.

5. **Hardcoded `domains/` paths.** Several places resolve `domains/` relative to `import.meta.url`: `cli/main.ts:177`, `lib/orchestration/chain-runner.ts:37`, `domains/shared/extensions/orchestration/index.ts:10`. After extraction, these still correctly find `domains/shared/` (which stays). The coding domain comes from installed packages via the scanner. But the `FALLBACK_DOMAINS_DIR` in chain-runner only finds `shared` — coding must come from the scanner. This is correct behavior but needs testing.

6. **Dev-mode detection false positives.** Checking `package.json` name === `"cosmonauts"` could match a user's project if they name it the same. Mitigation: also check for `bundled/` directory existence.

## Implementation Order

**Step 0: Create worktree** — `git worktree add ../cosmonauts-extraction framework-extraction`. All subsequent work happens there.

1. **Create `bundled/coding/` package** — Copy `domains/coding/` to `bundled/coding/coding/`. Create `bundled/coding/cosmonauts.json`. Verify it's a valid installable package by running the manifest validator against it.

2. **Create `bundled/coding-minimal/`** — Build the minimal package: copy 6 agents (cosmo, planner, task-manager, coordinator, worker, quality-manager) and their prompts. Copy all 4 capabilities. Copy 3 skills (engineering-principles, languages, web-search). Write minimal `workflows.ts` with 3 workflows. Create `cosmonauts.json`.

3. **Update catalog and path resolution** — Change `lib/packages/catalog.ts` source paths to `./bundled/coding` and `./bundled/coding-minimal`. Ensure `resolveCatalogEntry()` returns paths that get resolved relative to the framework root. Update any code that calls the catalog to resolve correctly.

4. **Install metadata** — Update `lib/packages/installer.ts` to write `.cosmonauts-meta.json` alongside each install, recording source type and origin.

5. **Dev-mode auto-detection** — Add logic to `cli/main.ts`: detect framework repo via `package.json`, auto-add bundled package directories as plugin sources. This MUST work before `domains/coding/` is removed.

6. **First-run detection** — Add logic to `cli/main.ts`: if no non-shared domains and not a meta command, print install instructions and exit. Make `cosmonauts init` offer to install the coding domain.

7. **Graceful runtime** — Update `CosmonautsRuntime.create()` and validator to not crash when only `shared` exists. Meta commands must work without any domain installed.

8. **Remove `domains/coding/`** — Delete the directory in the worktree. Update tests that reference `domains/coding/` paths. Framework's `domains/` now contains only `shared/`.

9. **Update command** — `cli/update/subcommand.ts`: read `.cosmonauts-meta.json`, apply update strategy per source type. Register in `cli/main.ts`.

10. **npm publish config** — Add `files` field to `package.json`: `["bundled/", "domains/", "lib/", "cli/", "bin/"]`. Verify with `npm pack --dry-run` that all needed files are included.

11. **Documentation and tests** — Update `AGENTS.md`, update/add tests for catalog, runtime graceful mode, update command. Run full test suite.
