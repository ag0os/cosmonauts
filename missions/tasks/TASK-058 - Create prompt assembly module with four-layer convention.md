---
id: TASK-058
title: Create prompt assembly module with four-layer convention
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-053
  - TASK-055
createdAt: '2026-03-09T16:02:49.330Z'
updatedAt: '2026-03-09T17:26:00.000Z'
---

## Description

Build the new convention-based prompt assembly system that replaces manual prompt array composition. This is the core of the domain prompt system.

**New file:** `lib/domains/prompt-assembly.ts`

**Function:** `assemblePrompts(agent: AgentDefinition, domain: string, domainsDir: string, runtimeContext?: RuntimeTemplateContext): Promise<string>`

**Assembly order (four layers):**
1. **Layer 0 (base):** Load `domains/shared/prompts/base.md` (always)
2. **Layer 1 (capabilities):** For each entry in `agent.capabilities`:
   - Try `domains/{domain}/capabilities/{name}.md`
   - Fall back to `domains/shared/capabilities/{name}.md`
   - Error if not found in either
3. **Layer 2 (persona):** Load `domains/{domain}/prompts/{agent.id}.md` (auto-loaded)
4. **Layer 3 (runtime):** If sub-agent mode, load and render `domains/shared/prompts/runtime/sub-agent.md`

Concatenate all layers with `\n\n` separator.

**Reference:** Plan section "Prompt assembly module". Uses existing `renderRuntimeTemplate` from `lib/prompts/loader.ts` for Layer 3. Uses existing `stripFrontmatter` logic for markdown loading.

**Tests:** Use temp directories with mock `.md` files to test all four layers, domain-first resolution, fallback to shared, and error on missing capability.

<!-- AC:BEGIN -->
- [x] #1 assemblePrompts function exists in lib/domains/prompt-assembly.ts
- [x] #2 Layer 0 always loads domains/shared/prompts/base.md
- [x] #3 Layer 1 resolves capabilities domain-first then falls back to shared
- [x] #4 Layer 1 throws an error if a capability is not found in either domain or shared
- [x] #5 Layer 2 auto-loads the agent persona prompt from domains/{domain}/prompts/{agent.id}.md
- [x] #6 Layer 3 conditionally loads and renders the sub-agent runtime template
- [x] #7 Tests cover all four layers, domain-first resolution, shared fallback, and missing capability error
<!-- AC:END -->

## Implementation Notes

- Created `lib/domains/prompt-assembly.ts` with `assemblePrompts()` function using options-object pattern
- Reuses `renderRuntimeTemplate` and `RuntimeTemplateContext` from `lib/prompts/loader.ts` (no duplication)
- Uses `gray-matter` for frontmatter stripping (consistent with existing loader)
- `loadWithFallback` helper tries domain path first, then shared, returns null if neither exists
- Exported `RuntimeContext` and `AssemblePromptsOptions` interfaces for consumer use
- 13 tests in `tests/domains/prompt-assembly.test.ts` covering all layers, ordering, fallback, error cases, and frontmatter stripping
