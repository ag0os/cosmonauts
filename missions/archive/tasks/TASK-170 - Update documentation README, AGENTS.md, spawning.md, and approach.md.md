---
id: TASK-170
title: 'Update documentation: README, AGENTS.md, spawning.md, and approach.md'
status: Done
priority: low
assignee: worker
labels:
  - backend
  - 'plan:chain-fanout'
dependencies:
  - TASK-163
createdAt: '2026-04-10T18:37:15.827Z'
updatedAt: '2026-04-10T18:42:39.541Z'
---

## Description

Update all user-facing and agent-facing documentation surfaces to teach the new parallel-step syntax consistently, including the explicit no-sharding caveat for fan-out.

**Files to update:**
- `README.md` — document `[a, b]` bracket groups and `role[n]` fan-out syntax; include multi-step example (`planner -> [task-manager, reviewer] -> coordinator`); add explicit note that fan-out duplicates the same prompt and does not assign different tasks.
- `AGENTS.md` — update chain examples and instructions to reflect new syntax; ensure agent-facing guidance matches the spec examples.
- `domains/shared/capabilities/spawning.md` — update chain DSL examples and guidance used in agent prompts/skills to include bracket and fan-out syntax.
- `docs/architecture/approach.md` — update the chain DSL description (around line 152) to reflect that bracket groups and `role[n]` are valid topology expressions.

**Constraint:** Do not use `worker[n]` as an example for fan-out — use `reviewer[n]` or similar to avoid implying task sharding. Explicitly state that fan-out duplicates the same prompt N times and does not partition work.

<!-- AC:BEGIN -->
- [ ] #1 README.md documents [a,b] and role[n] syntax with at least one multi-step example and an explicit no-sharding caveat
- [ ] #2 AGENTS.md chain examples include bracket and fanout syntax
- [ ] #3 domains/shared/capabilities/spawning.md chain examples include bracket and fanout syntax
- [ ] #4 docs/architecture/approach.md DSL description covers the new topology syntax
- [ ] #5 No documentation surface uses worker[n] as a fanout example
- [ ] #6 Every updated surface explicitly states that fanout duplicates prompts and does not shard work
<!-- AC:END -->

## Implementation Notes

Updated all four documentation surfaces:
- README.md: added bracket group + fan-out syntax section after --chain example, with multi-step example and no-sharding caveat
- AGENTS.md: added bracket/fan-out examples to the Chain Runner section and the CLI flag table
- domains/shared/capabilities/spawning.md: added bracket group and fan-out to the "Run a chain" guidance plus two new named sub-sections with code examples
- docs/architecture/approach.md: extended the ~~chain DSL~~ bullet (line 152) to describe bracket groups and fan-out

No surface uses worker[n]; all use reviewer[n] or similar. Every surface explicitly states fan-out sends the same prompt and does not partition work.
