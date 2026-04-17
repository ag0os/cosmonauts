---
id: TASK-158
title: 'Scanner: add user-domains (1.5) and project-domains (2.5) tiers'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-eject-and-tiers'
dependencies: []
createdAt: '2026-04-10T02:15:37.152Z'
updatedAt: '2026-04-10T02:19:34.122Z'
---

## Description

Extend `lib/packages/scanner.ts` to discover two new directory-based domain tiers:
- `~/.cosmonauts/domains/` at precedence 1.5 (origin: `"user-domains"`)
- `.cosmonauts/domains/` at precedence 2.5 (origin: `"project-domains"`)

Both tiers must be existence-guarded: use `stat()` from `node:fs/promises` to check the directory exists before adding the `DomainSource` entry. If the directory does not exist, silently skip it — no entry added, no error thrown.

Insert these checks in `scanDomainSources()` at the correct positions:
1. After the global packages block (after precedence 1), before local packages
2. After the local packages block (after precedence 2), before plugin dirs

Add `stat` import from `node:fs/promises` and `homedir` import from `node:os`.

Also update `tests/packages/scanner.test.ts` with new test cases covering:
- When `~/.cosmonauts/domains/` exists, it appears at precedence 1.5 with origin `"user-domains"`
- When `.cosmonauts/domains/` exists, it appears at precedence 2.5 with origin `"project-domains"`
- When neither directory exists, output is identical to pre-change behavior (no extra sources)
- Full 7-tier ordering: builtin(0) → bundled(0.5) → global-packages(1) → user-domains(1.5) → local-packages(2) → project-domains(2.5) → plugin(3) when all tiers present
- user-domains (1.5) is lower precedence than local-packages (2)

<!-- AC:BEGIN -->
- [ ] #1 Scanner produces sources in strict precedence order: builtin(0) → bundled(0.5) → global-packages(1) → user-domains(1.5) → local-packages(2) → project-domains(2.5) → plugin(3) when all tiers are present
- [ ] #2 When ~/.cosmonauts/domains/ does not exist, the scanner produces the same output as before these changes — no errors, no extra sources
- [ ] #3 When .cosmonauts/domains/ does not exist, the scanner produces the same output as before these changes
- [ ] #4 The stat() existence check gates both new directory tiers — no DomainSource is added for a missing directory
- [ ] #5 All existing scanner tests continue to pass
<!-- AC:END -->

## Implementation Notes

Added stat (node:fs/promises) and homedir (node:os) imports to scanner.ts. Inserted user-domains (1.5) check after global packages and project-domains (2.5) check after local packages, both guarded by try/catch around stat(). Tests mock both node:fs/promises and node:os; statExistsFor() helper controls which paths resolve. All 1328 tests pass, files are lint/typecheck clean.
