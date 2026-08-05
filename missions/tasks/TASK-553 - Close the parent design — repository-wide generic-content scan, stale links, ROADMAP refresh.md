---
id: TASK-553
title: >-
  Close the parent design — repository-wide generic-content scan, stale links,
  ROADMAP refresh
status: To Do
priority: high
labels:
  - 'plan:analysis-investigation-procedures'
  - documentation
dependencies:
  - TASK-552
createdAt: '2026-08-05T15:24:21.081Z'
updatedAt: '2026-08-05T15:24:21.081Z'
---

## Description

Stages 3-5 of `missions/plans/analysis-investigation-procedures/plan.md`.
Carries the shared obligations of AC-011 and AC-012 and closes the ratified
`analysis-capabilities` design. No new behavior; this is the closeout.

This is the last slice of three, so it is the last chance for a provider
name, a concrete command, or a stale link to have leaked into shipped
content through any of them. A leak introduced by an earlier slice surfaces
here and is fixed here regardless of which slice introduced it.

Work:

1. Repository-wide shipped generic-content scan. Sweep every shipped
   prompt, skill, and generic work-artifact reference under `bundled/` and
   `domains/` for concrete analyzer names, provider names, vendor-specific
   flags, and runnable commands that INV-1 forbids. Record what was
   scanned and what was found. Provider-specific documentation under
   `docs/` and the runtime source under `lib/analysis/` and
   `domains/shared/extensions/project-tools/` are explicit exclusions from
   INV-1 content scans — they legitimately name the provider.
2. Stale-link scan over the same shipped surface: references to paths,
   skills, or headings deleted by the three slices (notably the deleted
   concrete-provider skill tree and the deleted legacy prose injection
   block) must not survive anywhere in shipped content.
3. Refresh the `analysis-tools` entry in `ROADMAP.md` to record that the
   capability surface, gate rewiring, gate coverage, and role procedures
   have shipped across the three slices plus the corrective plan, and to
   leave standing only what genuinely remains open on that track.
4. Run the plan's final ladder: the project's test, lint, and type-check
   steps; `cosmonauts plan check-artifacts analysis-investigation-procedures`
   reporting zero issues with `Withdrawn: 1`; and the bound changed-scope
   gates from an explicit literal base. Mutation and boundary-conformance
   remain visibly degraded by design — that degradation is the delivered
   outcome, not a deferral, and must be reported as such rather than
   worked around.

Record the commit SHA at task start; that SHA is the changed-scope base for
the audit run at task close.

Ratified ground: INV-1..INV-5, D-013, D-021, D-024. B-020 stays withdrawn —
a `Withdrawn: 1` line in the conformance report is the expected outcome,
not a gap to close. Do not touch the capability runtime, the gate
vocabulary, the seven capability names, or which capabilities the reference
provider supports.


<!-- AC:BEGIN -->
- [ ] #1 A repository-wide scan of shipped prompts, skills, and generic work-artifact references under `bundled/` and `domains/` finds no concrete analyzer name, provider name, vendor-specific flag, or runnable analysis command, and the scan coverage and result are recorded in the task implementation notes
- [ ] #2 A stale-link scan over the same shipped surface finds no surviving reference to any path, skill, or heading deleted by the three slices, and any hit found is fixed
- [ ] #3 The `analysis-tools` entry in `ROADMAP.md` records the shipped capability surface, gate rewiring, gate coverage, and role procedures, and leaves standing only what genuinely remains open on that track
- [ ] #4 `cosmonauts plan check-artifacts analysis-investigation-procedures` reports zero issues and zero advisories with `Withdrawn: 1`
- [ ] #5 The project test, lint, and type-check steps pass, and the sibling slices' preserved prompt tests pass unchanged
- [ ] #6 The bound changed-scope gates run from an explicit literal base and their outcomes are recorded, with mutation and boundary-conformance reported as visibly degraded by design rather than worked around
<!-- AC:END -->
