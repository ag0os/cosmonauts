---
id: TASK-139
title: >-
  Quality-manager prompt: contract loading, verifier/reviewer integration, and
  sign-off
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:quality-contracts'
dependencies:
  - TASK-138
createdAt: '2026-04-01T15:34:17.960Z'
updatedAt: '2026-04-01T15:38:01.680Z'
---

## Description

Edit `bundled/coding/coding/prompts/quality-manager.md` to add contract loading, merge contract criteria into the verifier and reviewer steps, add contract-aware remediation routing, and add contract sign-off to final validation — as specified in the quality-contracts plan.

**Step 2.5 (new) — Load quality contract**: After establishing review context, extract the `plan:<slug>` label from the current tasks, call `plan_view`, and parse the `## Quality Contract` section into structured criteria. Log a warning (do not fail) for any entry that cannot be parsed.

**Step 3 (verifier) — Merge contract claims**: Add `verifier`-type contract criteria as additional claims alongside project-native checks (lint, typecheck, test). Pass the QC criterion ID and command to the verifier.

**Step 4 (reviewer) — Pass contract criteria**: Include `reviewer`-type contract criteria in the reviewer spawn prompt. The reviewer must report pass/fail per criterion ID in its findings, in addition to standard diff review.

**Step 5 (remediation) — Contract-aware routing**: Failed `QC-*` criteria are high-priority. Failed verifier criteria route the same as a failed check. Failed reviewer criteria route by complexity: simple → fixer, complex → new task.

**Step 7 (final validation) — Contract sign-off**: Merge-readiness requires all non-manual contract criteria to pass. Manual criteria are listed as "requires human verification" in the exit summary.

<!-- AC:BEGIN -->
- [ ] #1 Step 2.5 is present in quality-manager.md, instructing the agent to resolve the plan slug from task labels and call plan_view to load the Quality Contract section
- [ ] #2 Step 2.5 includes guidance to parse contract entries into structured criteria and log warnings for unparseable entries rather than failing
- [ ] #3 Step 3 is updated to include verifier-type contract criteria as additional claims, with QC criterion ID and command passed to the verifier
- [ ] #4 Step 4 is updated to include reviewer-type contract criteria in the reviewer spawn prompt, requiring the reviewer to report pass/fail per criterion ID
- [ ] #5 Step 5 is updated so failed QC-* verifier criteria route like failed checks, and failed QC-* reviewer criteria route by complexity (simple → fixer, complex → task)
- [ ] #6 Step 7 is updated so merge-readiness requires all non-manual contract criteria to pass, and manual criteria are noted as 'requires human verification' in the exit summary
<!-- AC:END -->

## Implementation Notes

All changes were already present in the working tree from a prior run (committed as 7d5842c). The file quality-manager.md now has: step 2.5 (plan slug resolution via task_list + plan_view, YAML-like parsing, warning on bad entries, three partitioned lists); step 3 (verifier_criteria appended as additional claims with QC IDs); step 4 (reviewer_criteria passed in spawn prompt with required Quality Contract report section); step 5 (contract-aware routing block for QC-* failures); step 7 (contract sign-off confirming non-manual criteria pass, manual criteria listed as requires human verification).
