---
id: TASK-574
title: Implement the canonical harness registry and skills-export contract
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-573
createdAt: '2026-08-25T23:02:23.266Z'
updatedAt: '2026-08-25T23:02:23.266Z'
---

## Description

Owns B-001 from AC-001. Behavior seam: `lib/harness-adapters/types.ts`, `lib/harness-adapters/registry.ts`, `lib/skills/exporter.ts`, `cli/skills/subcommand.ts`; additional plan-owned files: `lib/skills/index.ts`, `package.json`, and `tests/harness-adapters/registry.test.ts`. This task implements Implementation Order step 2 only; it performs no sync/content migration and must not touch either live Claude command. AC-001, INV-001, INV-005, INV-006, D-001, D-010/A-002, and D-019 are ratified/recorded ground: if implementation would narrow them, halt and escalate rather than changing expected behavior. Full Gemini support and `open-code` implementation remain out of scope.

<!-- AC:BEGIN -->
- [ ] #1 B-001: one inward registry resolves every supported Claude and Codex project/personal owner root, target directory, asset kind, and transform, satisfying AC-001/INV-005 without a second target vocabulary.
- [ ] #2 B-001: `open-code` remains declared but unimplemented, Gemini remains unregistered, and neither full target is added under this task.
- [ ] #3 B-001: `lib/skills/exporter.ts` has no local target set or switch; all four existing skill paths resolve through inward `HarnessScope`, exposed compatibly through `lib/skills/index.ts`.
- [ ] #4 B-001/D-019: command descriptors support copy only, and any command-resolving `--link` request names the asset and supported mode, fails before every owner-root/manifest write, and leaves no provenance; skill link support remains opt-in and local-path-only per INV-006.
- [ ] #5 B-001/D-001: `package.json` publishes `external-commands/` through its `files` entry, verified by reading the manifest; publication does not create Pi/domain autoload and D-004 adds no universal harness-check script.
- [ ] #6 B-001 preserves INV-001: every registered materialized asset has one stable in-repo source descriptor, and exported copies are never authoritative.
- [ ] #7 `tests/harness-adapters/registry.test.ts` contains `resolves registry and compatibility skill-export targets from one contract` with marker `@cosmo-behavior plan:harness-adapters#B-001` and directly proves the preceding registry, compatibility, command-negative, and publication outcomes.
- [ ] #8 B-001/D-007: every registered descriptor declares an explicit `defaultScope` with the ratified values — runtime skill descriptors `project`, the single `external-skill:cosmonauts` bundle `personal`, and both `command:*` descriptors `personal` — and an explicit `--scope` overrides it; `tests/harness-adapters/registry.test.ts` asserts all three defaults by descriptor id, so a scope-omitted request for one descriptor of each class resolves to its named owner root.
<!-- AC:END -->
