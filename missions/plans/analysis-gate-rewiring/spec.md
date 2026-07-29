# Spec — Analysis gate rewiring

Slice 2 of 3 of the ratified `analysis-capabilities` spec (split by D-024,
2026-07-29). Depends on `analysis-capability-runtime`, which ships the
capability tools, bindings, and status this slice consumes. This slice moves
the gating and remediation roles off the prose "Detected Analysis Tools" block
onto the capability surface, distributes that surface to the v1 consumer
roles, and deletes the legacy bridge. Investigation procedures for planner,
plan-reviewer, worker, and refactorer ship in
`analysis-investigation-procedures`.

## Purpose

The capability runtime exists but nothing consumes it. Quality Manager,
Verifier, and Fixer still read a single prose line carrying one concrete
command, and structural findings still arrive flattened into terminal text.
The plan's abstract gate ladder still has no runtime resolution: a bindable
gate is enforced or silently unenforced with nothing in between, and a
provider crash is indistinguishable from a clean run.

This slice makes the gate ladder resolve against real bindings. Bound gates
execute through capability tools with the base baked in; genuinely unbound
gates flow into the existing degraded-gates reporting; a provider error
surfaces as failed-to-run and blocks. Remediation stops depending on findings
surviving a lossy child-text boundary: the Quality Manager routes the exact
capability request plus human-readable finding designations, and the
remediator reruns it and works from its own fresh structured result.

It also distributes the surface. The `project-tools` extension reaches exactly
the seven v1 consumer roles, a provider-neutral shared analysis skill replaces
the concrete provider skill, and the legacy prose injection is deleted in the
same stage that rewires its consumers — no silent gate window.

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

- **Quality Manager, Verifier, Fixer** — the direct subjects of this slice.
  They stop reading a prose block and one command; they resolve the gate
  ladder against bindings, execute bound changed-scope capabilities directly,
  report failed-to-run distinctly from degraded, and route remediation as a
  rerunnable capability request.
- **Planner, plan-reviewer, worker, refactorer** — receive the extension and
  the shared skill here so their procedures can be written in the next slice.
  Their prompts are unchanged by this slice except worker's migration-sweep
  clause (B-031).
- **Every other shipped agent** — wildcard agents unavoidably see the shared
  skill without the tools; the skill's opening availability check is what
  keeps that from being a broken affordance.
- **Project maintainers (human)** — see the gate ladder honestly report which
  bindable gates were enforced, degraded, or failed to run.

## User Experience

**Gating.** The Quality Manager resolves the plan's abstract gate ladder
against the capability bindings: bound gates execute (changed-scope, base SHA
baked in, both feature-branch and dirty-base review scopes), unbound gates
flow into the existing degraded-gates reporting. A provider error surfaces as
a failed-to-run gate demanding attention, never a pass.

**Remediation.** The fixer receives the structured findings under the existing
minimal-change constraint. It reruns the routed capability request before
editing and treats its own fresh result as ground truth. It may request a fix
preview — a dry-run of proposed removals — and then applies the reviewed
change itself as ordinary edits.

**Verification.** The Verifier validates a capability claim by calling status
and the named generic tool, reporting completed, unbound, unsupported, or
failed distinctly. It is not the transport for the Quality Manager's findings.

**Migration.** Work that moves or renames files, exports, commands, config
keys, or paths still runs the explicit old-identifier search across runtime,
tests, and docs. Bound dead-code analysis is additive evidence, never a
replacement — structural reachability cannot prove stale strings absent.

**Procedure.** Every consuming role reads one provider-neutral procedure. No
shipped prompt or skill names a concrete analyzer or command.

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
| AC-001 | `analysis-capability-runtime` | Consume the delivered vocabulary; the gate-contracts amendment here must not introduce a second one |
| AC-002 | `analysis-capability-runtime` | Inherited |
| AC-003 | `analysis-capability-runtime` | Inherited |
| AC-004 | shared | Deliver the gate-resolution clause: an unbound bindable gate records the degraded state |
| AC-005 | shared | Deliver the gate clause: a gate backed by an errored capability reports failed-to-run, never passed |
| AC-006 | `analysis-capability-runtime` | Inherited; consumers must supply a literal base and never omit it |
| AC-007 | `analysis-capability-runtime` | Inherited; consumers degrade only the unavailable metric |
| AC-008 | shared | Deliver the consumer half: remediation treats proposals as proposals and applies ordinary edits |
| AC-009 | this slice | Deliver in full |
| AC-010 | `analysis-investigation-procedures` | Distribute the extension and shared skill to the four roles so the next slice can write their procedures; do not write those procedures here |
| AC-011 | shared | Deliver the no-regression half: nothing the Quality Manager sees today is lost, and the explicit migration search is preserved |
| AC-012 | all three | Gates pass and shipped content stays stack-agnostic at this slice's ladder run |

## Scope

Included:

- Quality Manager gate resolution and direct changed-scope execution for both
  feature-branch and dirty-base review scopes.
- Failed-to-run versus degraded distinction in gate reporting, and the
  `gate-contracts.md` amendment that gives it vocabulary.
- Remediation routing by capability request plus human-readable finding
  designations, and the Fixer's rerun-before-edit procedure.
- Verifier's generic capability-claim validation procedure.
- Preservation of the always-on explicit migration reference search.
- Distributing the `project-tools` extension to exactly the seven v1 consumer
  roles, and the provider-neutral shared analysis skill with its opening
  availability check.
- Deleting the concrete provider skill tree and the legacy "Detected Analysis
  Tools" prose injection, both in this slice.
- Tests: prompt/skill content tests and the exhaustive agent-definition
  enumeration that fails on consumer drift.

Excluded:

- Any change to the capability runtime, contract, adapter, runner, or tool
  schemas. Those ship in `analysis-capability-runtime`; a gap discovered here
  is an amend-on-record against that plan, not a workaround in a prompt.
- Planner, plan-reviewer, and refactorer investigation procedures, and
  worker's trace-before-delete and audit-at-task-close procedure — the next
  slice. Worker's migration-sweep clause (B-031) is in scope here because it
  is a Quality-Manager-paired gate behavior.
- Authoring architecture-boundary zones for this repository.
- CI workflow enforcement and the scheduled stewardship lane.

## Assumptions

- `analysis-capability-runtime` has shipped: the eight tools are registered,
  bindings resolve, status injects, and failures throw with evidence intact.
  This slice writes procedures against that contract as delivered, not as
  planned.
- Current Quality Manager behavior — feature-branch audits, the minimal-change
  fixer constraint, migration-shaped stale-reference sweeps, the QC ledger,
  local-base logic, and the round budget — is the behavior floor; rewiring
  must not lose any of it.
- Shared skills are merged into effective project skills for wildcard agents
  regardless of a project's skill filter, so the shared analysis skill is
  visible to agents that do not load the tools.

## Open Questions

- None specific to this slice. The parent's polyglot-routing and
  unbound-remediation-hint questions remain open at the runtime layer.
