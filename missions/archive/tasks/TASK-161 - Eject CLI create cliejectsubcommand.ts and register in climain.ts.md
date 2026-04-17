---
id: TASK-161
title: 'Eject CLI: create cli/eject/subcommand.ts and register in cli/main.ts'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - api
  - 'plan:domain-eject-and-tiers'
dependencies:
  - TASK-159
createdAt: '2026-04-10T02:16:24.850Z'
updatedAt: '2026-04-10T02:22:17.134Z'
---

## Description

Create `cli/eject/subcommand.ts` and wire it into the CLI entry point.

**`cli/eject/subcommand.ts`:**

```typescript
export interface EjectCliOptions {
  force?: boolean;
  projectRoot?: string;  // override for testing
}
```

**`ejectAction(domainId: string, options: EjectCliOptions): Promise<void>`:**
1. Call `ejectDomain({ domainId, projectRoot: options.projectRoot ?? process.cwd(), force: options.force })`
2. On success, print:
   ```
   Ejected "<domainId>" to .cosmonauts/domains/<domainId>/
   Source: <sourcePackage> (<sourcePath>)

   The installed package is still active as a fallback. To remove it:
     cosmonauts uninstall <sourcePackage>

   Tip: Add "cosmonauts" as a dev dependency for IDE type support in ejected files.
   ```
3. On error, write to stderr with `cosmonauts eject: <message>`, set `process.exitCode = 1`

**`createEjectProgram(): Command`:**
```typescript
program
  .name("cosmonauts eject")
  .description("Copy an installed domain to .cosmonauts/domains/ for local customization")
  .argument("<domain>", "Domain ID to eject (e.g. coding)")
  .option("--force", "Overwrite if target already exists")
  .action(async (domain, options) => { await ejectAction(domain, options); });
```

**`cli/main.ts` changes:**
1. Import `createEjectProgram` from `./eject/subcommand.ts`
2. Add `"eject"` to the subcommand string-comparison block
3. Add `eject: createEjectProgram` to the `programs` record

Create `tests/cli/eject/subcommand.test.ts` covering: success output format (ejectedTo path, source package, fallback message, tip), error output (stderr + exitCode=1), --force flag passed through to ejectDomain, Commander program structure (name, argument, --force option).

<!-- AC:BEGIN -->
- [ ] #1 cosmonauts eject <domain> routes correctly through cli/main.ts to the eject subcommand handler
- [ ] #2 On success, output includes the ejected path, source package name, uninstall guidance, and IDE tip
- [ ] #3 On error, message is written to stderr prefixed with 'cosmonauts eject:' and exitCode is set to 1
- [ ] #4 --force flag is passed through to ejectDomain as force: true
- [ ] #5 createEjectProgram returns a Commander program named 'cosmonauts eject' with a <domain> argument and --force option
<!-- AC:END -->

## Implementation Notes

Created cli/eject/subcommand.ts with ejectAction and createEjectProgram, wired into cli/main.ts (subcommand check + programs record). Tests in tests/cli/eject/subcommand.test.ts cover all 5 ACs (13 tests, all passing). The pre-existing lint failure in tests/cli/packages/subcommand.test.ts was not introduced by this task.
