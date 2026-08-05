# Spec — Analysis investigation procedures

Slice 3 of 3 of the ratified `analysis-capabilities` spec (split by D-024,
2026-07-29). Depends on `analysis-capability-runtime` (the capability surface)
and `analysis-gate-rewiring` (which distributed that surface to the seven v1
consumer roles and shipped the shared analysis skill). This slice writes the
investigation and implementation procedures onto it, and closes the parent
design.

## Purpose

After the first two slices, planner, plan-reviewer, worker, and refactorer
hold the capability tools and the shared analysis skill but have no procedure
of their own. Nothing in their prompts tells them to gather structural
evidence before designing, to trace a symbol before deleting it, or to audit
the changed scope before calling a task done — and the procedures they do have
were never expressed in capability terms.

This slice closes AC-010. Each of the four roles gets an investigation or
audit procedure written entirely against capabilities: no concrete tool name,
no command, no memorized CLI incantation. Investigation roles distinguish only
evidence from no-evidence-record-it; implementing roles carry the full
completed/unbound/failed protocol because their completion decisions depend on
it. It also closes the parent design: the ROADMAP analysis-tools entry is
refreshed and the final ladder runs.

## Intent

Ratified ground, carried verbatim from the parent spec. It governs all three
slices identically.

Goal: an agent's analysis procedure is expressed once, against capabilities,
and runs unchanged in any project — each capability resolving to a supporting
provider when one exists and degrading to an explicit unbound state when none
does.

Invariants — mechanism yields to these:

- INV-1 — Shipped prompts, skills, and generic artifacts reference
  capabilities, never concrete tool names or commands. Concrete bindings live
  in project configuration and runtime detection. (Runtime-generated status
  and reports may — and should — name the resolved provider and version.)
- INV-2 — Unsupported is visible: a capability with no provider is reported as
  unbound and skipped openly, never silently passed and never silently
  omitted.
- INV-3 — A provider runtime failure (crash, invalid config, missing git base)
  is never presented as a clean result. Analysis findings and tool errors are
  distinct outcomes end to end.
- INV-4 — The capability contract is provider-agnostic: a capability's generic
  schema must be plausible for at least two real tools; anything only one
  provider can express stays provider-tagged, not generic.
- INV-5 — No capability tool mutates the codebase. Mutation proposals are
  preview-only; applying them is a normal, reviewable agent edit.

Where coverage and safety pull against each other, safety wins: INV-3 and
INV-5 outrank capability completeness — a result that cannot be classified
reliably is reported as an error or left unbound rather than guessed at.

## Users

- **Planning agents (planner, plan-reviewer)** — gain read-only investigation
  capabilities (health, duplication, traces, project structure) before design,
  expressed identically in every project. They learn a two-way protocol:
  evidence, or no evidence and record it.
- **Implementing agents (worker, refactorer)** — run changed-scope audits at
  task close and trace symbols before deletion through capability tools
  instead of memorized per-tool CLI incantations. They learn the full
  four-state protocol because completion depends on it.
- **Project maintainers (human)** — read plans and reviews whose structural
  claims cite capability evidence or name its absence explicitly, in any
  project and under any backing analyzer.

## User Experience

**Investigation.** The planner asks for complexity or duplication evidence on
the paths a design will touch and receives structured findings. In a project
whose provider declares cyclomatic but not CRAP, a CRAP-specific question
comes back as unsupported-metric — not as zero findings. Where a capability is
unbound, the design records the uncertainty instead of assuming a clean
baseline.

**Challenge.** The plan reviewer checks duplicate paths, dependency direction,
and proposed deletions against capability evidence, and says so plainly when
the evidence was unavailable rather than implying it was checked.

**Task close.** The worker, green after a refactor and not yet committed,
audits the changed scope from the current pre-commit HEAD and traces symbols
before deleting them. Completed findings are corrected narrowly, unbound
capabilities are recorded, and a failed capability blocks completion.

**Discipline.** The refactorer traces moves and removals and audits from the
structural-change base without letting any metric override no-behavior-change
discipline. A better number is never a reason to change behavior.

## Acceptance Criteria

Ratified ground, carried verbatim from the parent spec. All twelve are
reproduced so every behavior's `Source:` citation resolves within this plan;
see Slice Scope for which this slice is accountable for delivering.

- [ ] AC-001 — A documented capability taxonomy exists covering at least:
  dead code, duplication, complexity, boundaries, changed-scope audit, trace,
  and fix preview. Capability names align with the existing abstract gate
  kinds rather than introducing a second vocabulary.
- [ ] AC-002 — Each capability's generic result schema is validated on paper
  against at least two real tools, at most one of which is Fallow;
  single-provider aspects are provider-tagged, and the validation record is
  part of the delivered documentation.
- [ ] AC-003 — In a project where Fallow is detected, agents have callable
  capability tools for each Fallow-supported capability, returning structured
  results: capability, provider identity and version, scope and base, verdict,
  findings with location/severity/actions, and the provider's native payload
  preserved.
- [ ] AC-004 — In a project with no supporting provider — or for capabilities
  the resolved provider lacks — the capability is reported unbound in the
  agent-visible status, consuming procedures skip it openly, and gate
  resolution records the degraded state. Proven against a non-JS fixture.
- [ ] AC-005 — Provider runtime errors (invalid config, missing git base,
  crash) surface as tool errors distinct from findings; a gate backed by an
  errored capability reports failed-to-run, never passed.
- [ ] AC-006 — Changed-scope analysis requires an explicit base; capability
  tools error rather than silently widening to full-project scope when the
  base is missing.
- [ ] AC-007 — Complexity bindings declare which metrics they provide (e.g.
  cyclomatic, cognitive, CRAP); a consumer can detect that a specific metric
  is unavailable and degrade just that check.
- [ ] AC-008 — Fix support is preview-only: the fix-preview capability returns
  proposed changes without modifying files, and no registered capability tool
  writes to the repository.
- [ ] AC-009 — Quality Manager and Verifier procedures consume capabilities
  instead of the prose "Detected Analysis Tools" block: gate ladder rows
  resolve to bound/unbound via the bindings, audits run for both
  feature-branch and dirty-base review scopes, and full structured findings
  reach remediation with the minimal-change constraint preserved.
- [ ] AC-010 — Planner, plan-reviewer, worker, and refactorer procedures
  express investigation-before-design, trace-before-delete, and
  audit-at-task-close in capability terms, with no concrete tool names or
  commands in shipped prompt or skill content.
- [ ] AC-011 — Fallow remains the reference provider with no regression: the
  findings that reach the Quality Manager today arrive at least as losslessly
  through the capability tools, and the provider engine is pinned so every
  agent runs the same version.
- [ ] AC-012 — Project gates pass (the test, lint, and type-check steps) and
  every shipped skill/prompt change remains stack-agnostic.

## Slice Scope

| AC | Owner slice | This slice's obligation |
|---|---|---|
| AC-001 | `analysis-capability-runtime` | Inherited; procedures use the delivered vocabulary and introduce no alias |
| AC-002 | `analysis-capability-runtime` | Inherited |
| AC-003 | `analysis-capability-runtime` | Inherited |
| AC-004 | shared | Deliver the procedure half: an unbound capability is skipped openly and recorded, never assumed clean |
| AC-005 | shared | Deliver the procedure half: a failed capability blocks task completion |
| AC-006 | `analysis-capability-runtime` | Inherited; audit procedures must supply a literal base |
| AC-007 | `analysis-capability-runtime` | Inherited; procedures degrade only the unavailable metric |
| AC-008 | shared | Deliver the procedure half: previews are proposals, deletions are traced first, edits are ordinary |
| AC-009 | `analysis-gate-rewiring` | Inherited |
| AC-010 | this slice | Deliver in full |
| AC-011 | shared | Inherited; the ROADMAP refresh at plan completion lands here |
| AC-012 | all three | Gates pass and shipped content stays stack-agnostic at the final ladder run |

## Scope

Included:

- Planner investigation-before-design procedure in capability terms.
- Plan-reviewer challenge procedure citing capability evidence or its explicit
  absence.
- Worker trace-before-delete and audit-at-task-close procedure, including
  blocking completion on a failed bound capability.
- Refactorer trace and changed-scope-evidence procedure with explicit
  no-metric-chasing discipline.
- The repository-wide shipped generic-content re-scan and the ROADMAP
  analysis-tools entry refresh at plan completion.
- Tests: prompt content tests for the four roles.

Excluded:

- Explorer. Dropped from v1 by D-021; B-020 is withdrawn and no test or marker
  ships for it. Explorer still benefits passively from the shared skill and
  the status block.
- Any change to the capability runtime, contract, adapter, runner, or tool
  schemas, and any change to Quality Manager, Verifier, or Fixer procedure —
  the two prior slices own those. Worker's migration-sweep clause is
  `analysis-gate-rewiring`'s B-031, not this slice's.
- Authoring architecture-boundary zones for this repository.
- CI workflow enforcement and the scheduled stewardship lane.

## Assumptions

- `analysis-capability-runtime` and `analysis-gate-rewiring` have shipped: the
  tools exist, the four roles in scope here already load `project-tools` and
  the shared analysis skill, and the legacy prose injection is gone. This
  slice writes procedure onto a surface that already exists.
- The shared analysis skill already carries the common protocol (status first,
  explicit base, trace-first, preview-only, availability check). Role prompts
  add role-specific procedure and do not restate the skill.
- Investigation roles do not gate anything, so teaching them the full
  four-state protocol would be prompt surface without an acceptance criterion
  (D-021).

## Open Questions

- None specific to this slice. The parent's polyglot-routing and
  unbound-remediation-hint questions remain open at the runtime layer.
