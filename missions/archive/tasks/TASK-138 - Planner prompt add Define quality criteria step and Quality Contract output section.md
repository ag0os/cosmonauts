---
id: TASK-138
title: >-
  Planner prompt: add "Define quality criteria" step and Quality Contract output
  section
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:quality-contracts'
dependencies: []
createdAt: '2026-04-01T15:34:07.562Z'
updatedAt: '2026-04-01T15:35:44.020Z'
---

## Description

Edit `bundled/coding/coding/prompts/planner.md` to add a new workflow step and a new plan output section, as specified in the quality-contracts plan.

**Workflow step** — Insert "Define quality criteria" after the existing "Design the architecture" step. The step must instruct the planner to identify 3–8 plan-specific, testable quality criteria after completing the architecture design, with guidance on what makes a criterion good vs. bad (concrete testable assertion vs. vague platitude).

**Output section** — Add a `## Quality Contract` section to the plan output format, positioned after `## Risks` and before `## Implementation Order`. The section uses a YAML-like list format where each entry has: `id` (QC-NNN), `category` (correctness | architecture | integration | behavior), `criterion` (the assertion), `verification` (verifier | reviewer | manual), and optional `command` (for verifier type only).

Reference the example from the plan spec for the exact format.

<!-- AC:BEGIN -->
- [ ] #1 A 'Define quality criteria' workflow step is present in planner.md, positioned after the architecture design step
- [ ] #2 The step instructs the planner to produce 3–8 criteria with explicit guidance that criteria must be concrete, testable assertions — not generic platitudes
- [ ] #3 The step describes all required fields for each criterion: ID (QC-NNN), category, criterion text, verification method, and optional command for verifier type
- [ ] #4 The step includes examples or explicit guidance distinguishing good criteria from bad
- [ ] #5 A '## Quality Contract' section is present in the plan output format, after '## Risks' and before '## Implementation Order'
- [ ] #6 The output section shows the YAML-like list format matching the design spec (id, category, criterion, verification, command)
<!-- AC:END -->

## Implementation Notes

Added step 4 'Define quality criteria' to the workflow (renumbered old step 4 to step 5). The step covers: 3–8 criteria count, concrete vs vague examples, all required fields (id, category, criterion, verification, command). Added '## Quality Contract' section to plan output format between Risks and Implementation Order with the exact YAML-like format from the plan spec including all four example entries.
