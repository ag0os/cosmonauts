---
id: TASK-189
title: Update spec-writer.md with quality gates (M2–M4)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:spec-plan-quality-gates-a'
dependencies: []
createdAt: '2026-04-17T15:28:08.346Z'
updatedAt: '2026-04-17T15:32:46.550Z'
---

## Description

Modify `bundled/coding/coding/prompts/spec-writer.md` to add the three mandatory quality gates described in the plan (M2: phase cadence, M3: visible readiness block, M4: assumption budget). This is the highest-risk file and establishes the shared rubric language that planner.md will align to.

**Seam for change:** `spec-writer.md:55-67` (exit heuristic replaced by readiness block) and `spec-writer.md:91-107` (Acceptance Criteria / Assumptions guidance tightened).

Add under section 2, without new top-level structure:
- Mandatory Frame → Shape → Detail phase cadence with explicit handoff announcement phrases for each transition (e.g., "I understand the purpose and user. Moving to the user flow and scope unless you want to revisit.")
- Replace the current exit heuristic with a visible `Readiness Check` block using exactly four headings: Specificity, Constraints, Context, Success criteria — each with role-specific checklist items
- Unchecked required items must remain visibly unchecked (never silently marked passed)
- Interactive mode blocks spec writing when required items are unmet until resolved or the human waives with "proceed with assumptions"
- Autonomous/non-interactive runs convert unmet required items into explicit Assumptions/Open Questions instead of blocking
- Critical-assumption classification: a critical assumption is one that changes user-visible behavior, scope boundaries, existing-feature interaction, or acceptance criteria
- Assumption budget: when `critical >= 3` in interactive mode, run one more clarification round before writing unless the human explicitly waives

Tighten the existing `Acceptance Criteria` and `Assumptions` output-format guidance at `spec-writer.md:91-107` to reflect the rubric without adding a persisted `Readiness Check` section to the output format.

**Reference plan section:** Design → Spec-writer gate, and Integration seams for `spec-writer.md:55-67` and `spec-writer.md:69-111`.

<!-- AC:BEGIN -->
- [ ] #1 spec-writer.md defines mandatory Frame → Shape → Detail phases with explicit handoff announcement phrases for each of the three transitions
- [ ] #2 A visible Readiness Check block is present with all four headings: Specificity, Constraints, Context, and Success criteria, each with role-specific checklist items
- [ ] #3 Unmet required checklist items remain visibly unchecked — the prompt never instructs silent pass-through of unresolved items
- [ ] #4 Interactive mode blocks spec writing when required items are unmet until they are resolved or the human explicitly waives with language such as 'proceed with assumptions'
- [ ] #5 Autonomous/non-interactive runs convert unmet required items into explicit Assumptions or Open Questions instead of blocking execution
- [ ] #6 Critical assumptions are defined as changes to user-visible behavior, scope boundaries, existing-feature interaction, or acceptance criteria; reaching critical >= 3 in interactive mode triggers one additional clarification round unless the human explicitly waives
- [ ] #7 The persisted spec output sections (Purpose, Users, User Experience, Acceptance Criteria, Scope, Assumptions, Open Questions) are unchanged — Readiness Check does not appear as a new persisted section in spec.md output
<!-- AC:END -->

## Implementation Notes

Updated bundled/coding/coding/prompts/spec-writer.md with mandatory Frame → Shape → Detail cadence, explicit handoff phrases, a visible four-part Readiness Check, interactive blocking/waiver rules, autonomous fallback to explicit Assumptions/Open Questions, critical-assumption classification, and unchanged persisted spec sections. Verified prompt text by inspection/search. `bun run lint -- bundled/coding/coding/prompts/spec-writer.md` still exits non-zero because unrelated repo files `.cosmonauts/config.json` and `missions/tasks/config.json` need formatting; task file changes are committed in `TASK-189: Tighten spec-writer readiness gates`.
