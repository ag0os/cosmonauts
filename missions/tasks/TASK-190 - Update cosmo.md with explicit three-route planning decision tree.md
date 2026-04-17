---
id: TASK-190
title: Update cosmo.md with explicit three-route planning decision tree
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:spec-plan-quality-gates-a'
dependencies:
  - TASK-189
createdAt: '2026-04-17T15:28:25.283Z'
updatedAt: '2026-04-17T15:36:04.171Z'
---

## Description

Modify `bundled/coding/coding/prompts/cosmo.md` to replace the current four-bullet planning routing at `cosmo.md:37-40` with an explicit three-route decision tree embedded in the existing "Additional Cosmo-specific delegation rules" section.

**Routes to define:**
1. `spec-writer` — fuzzy request or no existing spec → spawn spec-writer for product framing
2. `cosmo-facilitates-dialogue` — user wants interactive design dialogue or request is concrete enough for architecture back-and-forth → Cosmo loads `/skill:design-dialogue`, walks frame → shape → detail in-session, then spawns planner with the settled direction
3. `planner-autonomous` — user says "just decide" / "go ahead" / "commit", run is non-interactive, or Cosmo dialogue has already settled direction → spawn planner autonomously

**Required additions:**
- A signal table or equivalent mapping signals to routes (fuzzy/no-spec → spec-writer; interactive-dialogue preference → cosmo-facilitates-dialogue; "just decide"/non-interactive/post-dialogue → planner-autonomous)
- A visible route-announcement template covering all three routes with route, why, and next fields
- When routing to `spec-writer`: preserve the interactive planner bypass for users who already know the technical shape
- When routing to `cosmo-facilitates-dialogue`: preserve the direct-planner suggestion (`cosmonauts -a planner`) as a user choice, not a fourth router variant
- When routing to `planner-autonomous`: proceed immediately for the defined signals

**Constraint:** preserve all existing behaviors — none of the three planning paths may be dropped. Do not collapse to a binary router.

**Reference plan section:** Design → Cosmo router, Integration seams for `cosmo.md:37-40`, and D-008.

<!-- AC:BEGIN -->
- [x] #1 The planning-routing section defines exactly three named routes: spec-writer, cosmo-facilitates-dialogue, and planner-autonomous
- [x] #2 Each route has at least one named signal that drives the routing decision (fuzzy/no-spec for spec-writer; interactive-dialogue preference for cosmo-facilitates-dialogue; 'just decide'/non-interactive/post-dialogue for planner-autonomous)
- [x] #3 A route-announcement template is present that covers route, why, and next for all three routes
- [x] #4 When routing to spec-writer, the prompt preserves an option for users who already know the technical shape to bypass to planner directly
- [x] #5 When routing to cosmo-facilitates-dialogue, the direct-planner suggestion (cosmonauts -a planner) is preserved as a user-controlled choice, not eliminated as a path
<!-- AC:END -->

## Implementation Notes

Updated `bundled/coding/coding/prompts/cosmo.md` to replace the implicit four-bullet routing with an explicit three-route decision tree, signal table, and route-announcement template while preserving the spec-writer bypass and planner-led dialogue suggestion as user choices. Verification: `bun run test -- tests/prompts` passed; `bun run typecheck` passed; `bun run lint` failed on pre-existing formatting issues in `.cosmonauts/config.json` and `missions/tasks/config.json`, unrelated to this task.
