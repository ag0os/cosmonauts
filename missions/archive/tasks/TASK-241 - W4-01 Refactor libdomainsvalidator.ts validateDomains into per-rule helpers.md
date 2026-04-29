---
id: TASK-241
title: 'W4-01: Refactor lib/domains/validator.ts validateDomains into per-rule helpers'
status: Done
priority: medium
labels:
  - 'wave:4'
  - 'area:validation'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T14:00:16.692Z'
updatedAt: '2026-04-29T16:19:07.648Z'
---

## Description

Refactor the `validateDomains(domains)` function at `lib/domains/validator.ts:48` into named per-rule helper functions, removing the complexity suppression.

**Suppression:** `lib/domains/validator.ts:48`, `validateDomains(domains)`.

**Current responsibilities:** locates shared/portable domains, warns on duplicate portable capabilities, collects bare and qualified agent IDs, validates domain lead, workflow stages, persona prompts, capabilities, extensions, and subagent allowlists.

**Target pattern:** per-rule helpers:
- `findSharedDomain(domains)` and `findPortableDomains(domains)`
- `validatePortableCapabilityOverlap(portableDomains): DomainValidationDiagnostic[]`
- `collectKnownAgentIds(domains): Set<string>`
- `validateDomainLead(domain): DomainValidationDiagnostic[]`
- `validateWorkflowAgents(domain, allAgentIds): DomainValidationDiagnostic[]`
- `validateAgentPrompts(domain): DomainValidationDiagnostic[]`
- `validateAgentCapabilities(agent, domain, shared, portableDomains): DomainValidationDiagnostic[]`
- `validateAgentExtensions(...)` and `validateAgentSubagents(...)`

**Coverage status:** `existing-coverage-sufficient` — `tests/domains/validator.test.ts:50` covers valid domains, missing personas, capability/extension resolution across domain/shared/portable, subagents, portable overlap, lead, workflow stages, and `DomainValidationError` formatting.

**TDD note:** yes for per-rule validators.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `lib/domains/validator.ts:48`.
- Commit the change as a single commit: `W4-01: Refactor lib/domains/validator.ts validateDomains`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 4 / W4-01

<!-- AC:BEGIN -->
- [ ] #1 Existing validator tests are green before refactor.
- [ ] #2 validateDomains composes per-rule helpers and preserves diagnostic shape/order where tests assert it.
- [ ] #3 Suppression at lib/domains/validator.ts:48 is removed.
- [ ] #4 Domain module still imports only domain types, not runtime/CLI infrastructure.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
