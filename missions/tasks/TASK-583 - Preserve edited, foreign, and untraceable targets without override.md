---
id: TASK-583
title: 'Preserve edited, foreign, and untraceable targets without override'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-582
createdAt: '2026-08-25T23:04:13.015Z'
updatedAt: '2026-08-25T23:04:13.015Z'
---

## Description

Owns B-008 from AC-003 at Implementation Order step 4. Behavior seam: `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `cli/harness/subcommand.ts`; source/test files are the two core modules and `tests/harness-adapters/provenance.test.ts`, with CLI guidance integrated later without taking behavior ownership. AC-003 and INV-002 are ratified stop-and-escalate ground; human D-014/A-001 and D-015's exact lineage boundary may never be weakened. The core accepts injected verified proof only and imports no git reader. There is no force-overwrite, adopt, or unchecked migration path.

<!-- AC:BEGIN -->
- [ ] #1 B-008/AC-003/INV-002: edited owned copies, wrong links, foreign-owner claims, and unmanaged same-name targets remain byte/type/link-identical under normal sync, transfer, and migration attempts.
- [ ] #2 B-008: every conflict report includes absolute source and target paths, owner/conflict reason, and actionable port, preserve, or safe-transfer guidance.
- [ ] #3 B-008: owner transfer changes only the matching manifest key when the target is absent or exactly matches the old baseline; it never changes target bytes and rejects edited targets.
- [ ] #4 B-008/D-015: only an exact historical legacy-render match for the named git revision/source-relative path, current owner or authority, asset ID, output path, and node shape may become one-time copied-target authorization; the verifier is a pure function over injected proof and never reads git or a live target itself. (The under-lock re-read of the authorized target is asserted downstream by TASK-584 AC #1 and TASK-590 AC #3, where the transaction exists.)
- [ ] #5 B-008/D-014/A-001: failed or absent provenance is permanent `locally-edited (foreign-or-untraceable)` even when names or desired bytes match; unknown frontmatter remains opaque, `playwright-cli` is never an authorization candidate, and no public force/adopt option exists.
- [ ] #6 `tests/harness-adapters/provenance.test.ts` contains `preserves edited foreign and untraceable targets and permits only safe lineage or owner transfer` with marker `@cosmo-behavior plan:harness-adapters#B-008` and negative controls prove all protected targets remain byte-intact.
<!-- AC:END -->
