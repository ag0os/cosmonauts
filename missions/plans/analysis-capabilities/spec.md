# Spec — Analysis capability abstraction

Grounded in the July 2026 Fallow investigation (`docs/fallow.md`,
`docs/fallow-workflow-integration.md`). This spec covers the capability
abstraction itself; CI enforcement and the scheduled stewardship lane are
follow-up work.

## Purpose

Cosmonauts' structural-analysis integration is bound to one tool in one
language: Fallow for TypeScript/JavaScript, surfaced to agents as a single
prose line ("Detected Analysis Tools") carrying one command. Plans and prompts
already speak in abstract gate kinds — `dead-code`, `duplication`,
`complexity`, `boundary-conformance` — but the runtime offers no
capability-level surface: an agent either shells out to Fallow by name or gets
nothing, and in a non-TS project every structural gate silently has no
enforcement path.

This work makes the **capability** the unit of integration. Agents call
generic analysis capabilities (dead code, duplication, complexity, boundaries,
changed-scope audit, tracing, fix preview); the runtime resolves each
capability to whatever provider supports it for the project's language, with
Fallow as the reference provider. A capability nobody can back degrades to a
visible unbound state instead of a silent skip. Backing libraries become
swappable behind stable tools and procedures — the same agent procedure runs
against Fallow today and against a Python or Rust analyzer tomorrow, unchanged.

## Intent

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

- **Quality Manager, Verifier, Fixer** — today they get a prose block and one
  command, and findings arrive flattened into terminal text. They gain typed
  capability tools with structured findings (locations, severities, suggested
  actions) and honest bound/unbound resolution of the plan's abstract gate
  ladder.
- **Planning agents (planner, plan-reviewer, explorer)** — gain read-only
  investigation capabilities (health, duplication, traces, project structure)
  before design, expressed identically in every project.
- **Implementing agents (worker, refactorer)** — run changed-scope audits at
  task close and trace symbols before deletion through capability tools
  instead of memorized per-tool CLI incantations.
- **Project maintainers (human)** — swap or upgrade the backing analyzer for a
  language without touching prompts, skills, or plan artifacts, and see
  explicitly which capabilities are bound in a given project.
- **Non-TS/JS projects adopting cosmonauts** — get whatever capabilities their
  language's ecosystem supports; the rest degrade visibly instead of
  pretending or breaking.

## User Experience

**Discovery.** At session start an agent sees a capability status block: each
analysis capability with its binding state — bound (provider, version,
supported scopes, declared metrics) or unbound. No raw commands.

**Investigation.** The planner asks for complexity or duplication evidence on
the paths a design will touch and receives structured findings. In a project
whose provider declares cyclomatic but not CRAP, a CRAP-specific question
comes back as unsupported-metric — not as zero findings.

**Gating.** The Quality Manager resolves the plan's abstract gate ladder
against the capability bindings: bound gates execute (changed-scope, base SHA
baked in, both feature-branch and dirty-base review scopes), unbound gates
flow into the existing degraded-gates reporting. A provider error surfaces as
a failed-to-run gate demanding attention, never a pass.

**Remediation.** The fixer receives the structured findings under the existing
minimal-change constraint. It may request a fix preview — a dry-run of
proposed removals — and then applies the reviewed change itself as ordinary
edits.

**Swap.** A maintainer replaces the backing provider in project configuration.
The next session shows the same capabilities bound to the new provider;
prompts, skills, and plan artifacts are untouched.

## Acceptance Criteria

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

## Scope

Included:

- The capability taxonomy and generic result contract, documented and
  paper-validated (AC-001, AC-002).
- A Fallow provider adapter implementing the contract for Fallow's supported
  capabilities, read-only plus fix preview.
- Runtime detection and binding, registered capability tools, and the
  agent-visible binding status — superseding the current one-line
  "Detected Analysis Tools" injection.
- Consumer rewiring: Quality Manager / Verifier gate resolution, fixer
  remediation input, and planner / plan-reviewer / worker / refactorer
  investigation and audit procedures.
- Tests: contract tests for the binding and degradation behavior (including a
  no-provider fixture), and prompt/skill content tests.

Excluded:

- Building any second provider. Paper validation only; the first non-Fallow
  adapter ships when a non-TS/JS domain needs it.
- Fix-apply or any mutating capability tool.
- Authoring architecture-boundary zones for this repository. The boundaries
  capability is defined, but configuring cosmonauts' own zones is separate
  work — until then it dogfoods the visible-unbound state.
- CI workflow enforcement and the scheduled stewardship lane (full-project
  health, trends, snapshots) — follow-up work per
  `docs/fallow-workflow-integration.md`.
- MCP or Node-bindings transports for providers; CLI subprocess integration is
  sufficient for v1.

## Assumptions

- The existing detected-project-tools seam and Pi's extension/tool
  registration API are sufficient ground for the runtime binding; the plan
  owns the actual placement and shape.
- The abstract gate-kind vocabulary in the work-artifacts gate-contracts
  reference remains the naming ground for gate-facing capabilities.
- Fallow 2.54.2's JSON envelopes (`--format json --quiet --explain`) and its
  0/1/2 exit-code contract are stable enough to adapt; the finding-vs-error
  distinction is carried by exit codes plus the error JSON envelope.
- Current Quality Manager behavior — feature-branch audits, the minimal-change
  fixer constraint, migration-shaped stale-reference sweeps — is the behavior
  floor; rewiring must not lose any of it.

## Open Questions

- Multi-language projects: v1 assumes one resolved provider per capability.
  Should binding support per-language resolution within one repository (e.g. a
  monorepo with TypeScript and Python), or is that deferred to the first real
  polyglot adopter?
- Should the unbound state carry a remediation hint (which known provider
  could bind this capability for the project's language), or stay a bare
  status in v1?