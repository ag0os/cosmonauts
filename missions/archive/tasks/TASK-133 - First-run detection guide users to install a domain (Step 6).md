---
id: TASK-133
title: 'First-run detection: guide users to install a domain (Step 6)'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - api
  - 'plan:framework-extraction'
dependencies:
  - TASK-131
  - TASK-132
createdAt: '2026-03-30T18:20:04.331Z'
updatedAt: '2026-03-30T18:40:44.395Z'
---

## Description

Add logic to `cli/main.ts` that detects when no non-shared domains are installed and guides the user to install one, instead of failing cryptically.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Work:**
1. After `CosmonautsRuntime.create()` (which now succeeds with only `shared` — see graceful runtime task), check if `runtime.domains.filter(d => d.manifest.id !== 'shared').length === 0`
2. If true and the invoked command is NOT a meta command, print:
   ```
   No domains installed. Install the coding domain to get started:
     cosmonauts install coding
     cosmonauts install coding-minimal  (lightweight)
   ```
   Set `process.exitCode = 1` and return early
3. Meta commands that bypass this check: `install`, `uninstall`, `packages`, `create`, `update`
4. Update `cosmonauts init` to offer installing the coding domain when none is present (offer a prompt or instructions)

<!-- AC:BEGIN -->
- [ ] #1 Running any non-meta command with no domains installed prints the install instructions and exits with code 1
- [ ] #2 Meta commands (install, uninstall, packages, create, update) work without any domain installed
- [ ] #3 cosmonauts init mentions how to install a domain when none is present
- [ ] #4 The check does not fire when at least one non-shared domain is loaded
<!-- AC:END -->

## Implementation Notes

All 4 ACs confirmed. First-run detection added in cli/main.ts after CosmonautsRuntime.create() — filters non-shared domains, prints install instructions and exits code 1 when none found. Meta commands naturally bypass (routed before run()). init handler has its own no-domain guard. --list-* and --dump-prompt flags also excluded. Coordinator closing as Done.
