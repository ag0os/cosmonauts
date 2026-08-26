---
id: TASK-576
title: Route package target selection through registry compatibility metadata
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-573
createdAt: '2026-08-25T23:02:44.595Z'
updatedAt: '2026-08-26T03:10:23.373Z'
---

## Description

Owns B-003 from AC-001 at Implementation Order step 2. Seam/files: `lib/harness-adapters/registry.ts`, `lib/agent-packages/definition.ts`, `lib/agent-packages/build.ts`, `cli/export/subcommand.ts`, `tests/agent-packages/build.test.ts`, `tests/cli/export/subcommand.test.ts`, `domains/shared/skills/agent-packaging/SKILL.md`, `README.md`, and `docs/orchestration.md`. AC-001/INV-005 and D-005 are stop-and-escalate ground. This task re-homes target RESOLUTION only: agent-package assembly, BUILDING/compilation, binary invocation, prompt/tools, and inline delivery remain unchanged; coordinator packages and `skillDelivery: "reference"` are out of scope. No sync, migration, or live-command write occurs.

<!-- AC:BEGIN -->
- [x] #1 B-003: exactly one `claude` or `claude-cli` definition block resolves through registry package metadata to the unchanged `claude-cli` package ID suffix, `AgentPackage.target`, builder dispatch, success JSON, prompt/tool options, and inline skill delivery.
- [x] #2 B-003: definitions containing both Claude keys fail with the dedicated ambiguity error before any package build or compilation starts.
- [x] #3 B-003: generated definitions use canonical `targets.claude` while retaining the existing `-claude-cli` package ID suffix.
- [x] #4 B-003: Codex compatibility remains canonical/serialized `codex`, while unsupported CLI selection and help continue to name exactly `claude-cli, codex`.
- [x] #5 B-003/INV-005: no package builder, CLI branch, or documentation surface independently resolves targets; the registry is the only selection vocabulary, and `domains/shared/skills/agent-packaging/SKILL.md` states only the registry's canonical package vocabulary and the unchanged `claude-cli, codex` serialized labels. (The `harness sync` half of this Files-to-Change entry — `README.md` and `docs/orchestration.md` — is owned by TASK-586 AC #8, where the command exists.)
- [x] #6 Existing package building, compilation, invocation, prompt/tool assembly, and inline skill-delivery behavior is unchanged, and no coordinator package or reference-delivery mode is introduced.
- [x] #7 `tests/cli/export/subcommand.test.ts` contains `maps registry selection to the unchanged serialized package contract` with marker `@cosmo-behavior plan:harness-adapters#B-003`; package build tests and content tests prove the unchanged serialized contract and no build expansion.
<!-- AC:END -->
