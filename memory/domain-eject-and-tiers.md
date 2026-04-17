---
source: archive
plan: domain-eject-and-tiers
distilledAt: 2026-04-15T15:04:53Z
---

# Domain Eject Command and Multi-Tier Domain Discovery

## What Was Built

Added two visible domain override tiers to package discovery: `~/.cosmonauts/domains/` at precedence 1.5 and `.cosmonauts/domains/` at precedence 2.5. Added `cosmonauts eject <domain>` to copy an installed domain into `.cosmonauts/domains/<domainId>/`, rewrite framework-relative type imports for local editing, and leave the installed package in place as a fallback. Also fixed package installation metadata so catalog installs retain `catalogName`, which keeps later update behavior correct.

## Key Decisions

- **Ejected domains are named by domain ID, not manifest path.** The source comes from `join(pkg.installPath, domain.path)`, but the destination is always `.cosmonauts/domains/<domain.name>/` so the scanner can rediscover the domain under its real ID even when `name` and `path` differ.
- **Eject mirrors runtime precedence.** Source selection checks project-scope packages before user-scope packages, and within a scope uses the last matching provider, matching the existing merge semantics instead of inventing a separate resolution rule.
- **Directory tiers are existence-gated.** Scanner entries for user-domains and project-domains are only added if `stat()` confirms the directory exists; this avoids `loadDomains()` crashing on missing directories.
- **Import rewriting is an IDE/typecheck convenience, not a runtime dependency.** After copy, `.ts` files rewrite `../../lib/...`-style imports to `cosmonauts/lib/...`; this improves local editing when `cosmonauts` is a project dependency while keeping runtime behavior unchanged because the affected imports are type-oriented.
- **Eject does not uninstall the source package.** The project-local copy becomes the higher-precedence override, but the installed package remains as a fallback until the user explicitly uninstalls it.
- **Catalog installs must preserve catalog identity.** `installAction()` now threads `catalogName` into `installPackage()` so install metadata records `source: "catalog"` instead of degrading to `source: "local"`.

## Patterns Established

- **Domain source precedence is now:** builtin `0` → bundled `0.5` → global packages `1` → user domains `1.5` → local packages `2` → project domains `2.5` → plugin dirs `3`.
- **Visible customization path:** install a domain into the package store first, then eject it into `.cosmonauts/domains/<id>/` when project-local control is needed.
- **Eject is package-store only.** The command copies from installed packages, not from bundled dev-mode sources or ad hoc plugin directories.
- **Overwrite behavior must delete first.** `--force` removes the existing ejected directory before copying so removed upstream files do not linger as stale local files.
- **CLI guidance should reflect source scope.** Eject output includes uninstall advice for the original package, with `--local` when the winning source package came from project scope.
- **Package API additions stay surfaced from `lib/packages/index.ts`.** New package operations are exported through the package barrel alongside their types.

## Files Changed

- `lib/packages/scanner.ts` — added user-domain and project-domain discovery tiers, plus directory-existence guards.
- `lib/packages/eject.ts` — introduced `ejectDomain()`, source selection, recursive copy, `--force` replacement semantics, and post-copy import rewriting.
- `cli/eject/subcommand.ts` — added the `cosmonauts eject` command, success/error output, and scope-aware uninstall guidance.
- `cli/main.ts` — registered `eject` as a first-class CLI subcommand.
- `cli/packages/subcommand.ts` — fixed catalog install handling so `catalogName` reaches `installPackage()`.
- `lib/packages/index.ts` — re-exported eject types and the new package API entry point.
- `tests/packages/scanner.test.ts`, `tests/packages/eject.test.ts`, `tests/cli/eject/subcommand.test.ts`, `tests/cli/packages/subcommand.test.ts` — locked precedence ordering, eject behavior, symlink handling, CLI output, and catalog metadata passthrough.

## Gotchas & Lessons

- **If the scanner adds a non-existent domains directory, startup breaks.** `loadDomains()` expects a real directory, so the `stat()` guard is mandatory, not defensive fluff.
- **Target naming is easy to get wrong.** Using the last segment of `domain.path` instead of `domain.name` can make an ejected domain undiscoverable.
- **`--force` must remove before copy.** Copying over an existing ejected directory can leave stale files from older versions.
- **Link-installed packages still need a real ejected copy.** Eject should follow the symlinked source and produce normal files, not another symlink tree.
- **Rewritten imports may still need a local dependency.** `from "cosmonauts/lib/..."` only resolves cleanly for editors/typecheck when the project can resolve the `cosmonauts` package from `node_modules`.
- **Eject creates an override, not a clean break.** After ejection, updated lower-precedence installed packages can still supply resources the local copy does not override unless the package is uninstalled.