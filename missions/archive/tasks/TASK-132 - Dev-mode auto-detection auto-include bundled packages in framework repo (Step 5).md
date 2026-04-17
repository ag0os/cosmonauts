---
id: TASK-132
title: >-
  Dev-mode auto-detection: auto-include bundled/ packages in framework repo
  (Step 5)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - api
  - 'plan:framework-extraction'
dependencies:
  - TASK-127
  - TASK-129
createdAt: '2026-03-30T18:19:54.387Z'
updatedAt: '2026-03-30T18:37:28.584Z'
---

## Description

Add logic to `cli/main.ts` so that when the CLI is running from inside the Cosmonauts framework repo itself (during development), it automatically includes the `bundled/` packages as plugin sources. This eliminates the need for framework developers to manually run `cosmonauts install` during development.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Detection heuristic:** Framework repo = `package.json` at the CLI's resolved root has `"name": "cosmonauts"` AND a `bundled/` directory exists.

**Work:**
1. Add a helper function `isCosmonautsFrameworkRepo(root: string): Promise<boolean>` — checks `package.json` name and `bundled/` existence
2. Add `discoverBundledPackageDirs(bundledDir: string): Promise<string[]>` — returns the absolute path to each package directory under `bundled/` that contains a `cosmonauts.json`
3. In `cli/main.ts` `run()`, after resolving the framework root and before constructing the runtime: if `isCosmonautsFrameworkRepo`, add the discovered bundled dirs to `pluginDirs` (or equivalent runtime option)
4. Bundled paths should be added at the lowest precedence (global packages override bundled, local packages override global)

<!-- AC:BEGIN -->
- [ ] #1 When run from the framework repo (name='cosmonauts', bundled/ exists), bundled package directories are automatically available as plugin sources
- [ ] #2 When run from a non-framework project, no bundled/ auto-include occurs
- [ ] #3 isCosmonautsFrameworkRepo returns false if package.json name is not 'cosmonauts' or bundled/ does not exist
- [ ] #4 Framework developers can run the CLI without executing cosmonauts install first
- [ ] #5 Existing CLI startup behavior is unaffected for non-framework repos
<!-- AC:END -->

## Implementation Notes

All 5 ACs confirmed. isCosmonautsFrameworkRepo + discoverBundledPackageDirs added to cli/main.ts. bundledDirs threaded through CosmonautsRuntimeOptions → scanDomainSources at precedence 0.5 (below global, above builtin). Non-framework repos unaffected. 1125/1125 tests pass. Coordinator closing as Done.
