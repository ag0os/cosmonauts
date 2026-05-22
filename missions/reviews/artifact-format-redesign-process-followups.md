# Artifact Format Redesign — Process and Implementation Follow-ups

Source plan: `artifact-format-redesign`
Date: 2026-05-22

This note captures process/implementation improvements observed after completing the artifact format redesign. It is intentionally not a task list yet. Use it to decide which ideas should become roadmap entries, plans, or small direct edits.

## Summary

The redesign established the artifact contract: workflow tiers, `spec.md`, behavior-first `plan.md`, active `architecture.md`, behavior markers, abstract gate ladders, and role/prompt routing through `work-artifacts`. The next improvements should focus less on adding more prose and more on making the new contract mechanically observable where that is cheap and safe.

Highest-confidence next step: implement artifact-conformance enforcement for behavior/test markers and basic artifact structure.

## Follow-up Observations

### 1. Artifact conformance is still mostly guidance

**Observation**

The plan added behavior IDs, marker syntax, and prompt/skill contract tests, but runtime workflows do not yet verify that a plan's `B-###` entries still match real tests or that named markers exist in the referenced test files.

**Why it matters**

The behavior spine is valuable only if it remains true after implementation. Without a scanner/gate, future agents can write convincing plans whose behavior/test trace silently rots.

**Possible change**

Create an artifact-conformance scanner/gate that can:

- parse planned behavior entries from `plan.md`
- verify each behavior has source, seam, test, and marker fields
- verify referenced test files exist
- verify each marker appears near the relevant executable test
- report missing/extra/mismatched markers without requiring framework-specific APIs

**Risk / trade-off**

A scanner can become brittle if it tries to understand every test framework. Keep the first version grep-oriented and language-agnostic; validate markers and files before attempting deep test AST parsing.

**Suggested next artifact**

Plan: `artifact-conformance-gate`.

### 2. Quality Contract ladders need a structured model

**Observation**

The quality-manager prompt now describes abstract gate ladder handling, but there is no shared parser/model for `Gate kind`, `Tier`, `Binding state`, `Threshold`, and degradation notes.

**Why it matters**

Prompt-only parsing rules are easy for agents to interpret inconsistently. The more plans use abstract Quality Contracts, the more valuable it becomes to represent them as structured data before routing to verifiers, reviewers, or tool-backed checks.

**Possible change**

Add a small parser/model for Quality Contract ladder rows that can distinguish:

- universal gates vs bindable gates
- bound vs unbound states
- degraded gates
- protocol-pending gates
- legacy `QC-*` criteria vs new ladder rows

Keep actual tool execution and project-specific bindings as a separate layer.

**Risk / trade-off**

A parser without bindings may feel incomplete. That is acceptable if the first step only normalizes rows and reports degraded/protocol-pending states.

**Suggested next artifact**

Roadmap item first, then plan after artifact-conformance enforcement is scoped.

### 3. Role prompts can drift back into duplicated artifact rules

**Observation**

The implementation intentionally made role prompts and role skills route to `work-artifacts` instead of copying full format rules. Future edits could accidentally reintroduce duplicated canonical sections.

**Why it matters**

Duplication would recreate the original problem: inconsistent artifact formats, larger prompts, and unclear source of truth.

**Possible change**

Add contract tests or a lightweight lint rule that checks role prompts/skills use routing language and do not embed full canonical artifact sections. This does not need perfect static analysis; stable negative phrase checks may be enough.

**Risk / trade-off**

Overly strict text tests can become brittle. Prefer a small set of durable assertions over broad snapshots.

**Suggested next artifact**

Small direct edit or add to artifact-conformance gate scope.

### 4. Workflow tiers need behavioral pressure, not just documentation

**Observation**

The new tier model says direct fixes should not require `spec.md`, `plan.md`, or `architecture.md`, but this is still mostly prompt guidance.

**Why it matters**

If agents over-apply the full artifact stack to small fixes, the process becomes slower and humans stop trusting it. The tier system should reduce ceremony, not add it everywhere.

**Possible change**

Add workflow-level checks or prompt tests that keep direct-fix paths lightweight:

- direct fix prompts emphasize regression test first
- task/planner prompts explicitly route small fixes away from full planning
- plan-reviewer does not demand artifact findings when the artifact contract is out of scope

**Risk / trade-off**

Too much automation here could block legitimate cases where a small-looking fix reveals broader design risk. Keep this as guidance and review criteria unless recurring over-planning appears.

**Suggested next artifact**

Keep as review guidance for now; revisit if agents over-plan small work.

### 5. Architecture records need continued usefulness checks

**Observation**

The new architecture skill defines `architecture.md` as active implementation/review context, not background prose. That distinction can erode over time.

**Why it matters**

Shelfware architecture documents become stale and harm agent judgment. Durable records should exist only when they govern dependency direction, boundaries, state ownership, or multi-plan decisions.

**Possible change**

Add an architecture-record readiness/review checklist:

- Does this record change implementation choices?
- Does it change review criteria?
- Does it name boundary rules or dependency direction?
- Does a plan link to it through `Architecture Context`?

**Risk / trade-off**

This may not need runtime enforcement. Human/agent review may be sufficient unless architecture records start proliferating.

**Suggested next artifact**

Small prompt/skill refinement only if future architecture plans show drift.

### 6. A lightweight artifact smoke test could catch cheap mistakes early

**Observation**

The final coherence pass checked linked references, marker coverage, no concrete tools in generic references, and examples matching tiers. These checks are partly test-backed but could be easier to run as a focused artifact smoke command.

**Why it matters**

A dedicated smoke check would give planners, reviewers, and Drive runs faster feedback than the full test suite for common artifact-format mistakes.

**Possible change**

Add a script or test group that checks:

- every `work-artifacts/references/*.md` file is linked from `SKILL.md`
- generic artifact references avoid concrete command/tool columns
- behavior marker syntax is valid in prompt tests
- direct-fix guidance does not require full artifact ceremony
- quality-manager guidance preserves abstract ladder rows

**Risk / trade-off**

If this becomes a one-off script separate from normal tests, it may be forgotten. Prefer integrating it into existing `tests/prompts/` or a named test file run by `bun run test`.

**Suggested next artifact**

Fold into artifact-conformance gate or prompt-contract tests.

### 7. Memory ingestion should eventually consume artifact decisions and markers

**Observation**

The plan deliberately distinguished active `architecture.md` from post-completion `memory/`, but did not implement memory ingestion from architecture records, archived plans, or behavior markers.

**Why it matters**

The new artifacts create better raw material for memory. If memory ingestion understands behavior IDs, architecture decisions, and gate outcomes, future agents can retrieve more targeted context.

**Possible change**

Design memory ingestion that can extract:

- durable architecture decisions
- behavior/test marker records
- gate outcomes and degraded gates
- task implementation gotchas
- follow-up decisions from archived plans

**Risk / trade-off**

This depends on the artifact formats staying stable. Do not start here before artifact-conformance scanning and gate modeling are clearer.

**Suggested next artifact**

Roadmap item; defer until enforcement basics exist.

### 8. Artifact rendering remains downstream

**Observation**

The format now standardizes Mermaid, tables, structured lists, and checklists, which gives a future renderer consistent input. HTML rendering was intentionally out of scope.

**Why it matters**

Rendering can improve human review, but it should not drive the contract before enforcement and parsing are solid.

**Possible change**

Later, add an artifact renderer that consumes the canonical formats and highlights behavior traces, gates, and architecture context.

**Risk / trade-off**

Rendering before enforcement risks making stale artifacts look polished. Treat renderer work as downstream of conformance checks.

**Suggested next artifact**

Roadmap item only.

## Suggested Roadmap Candidates

1. **Artifact-conformance scanner/gate** — highest priority; validates behavior entries, test references, and marker presence.
2. **Structured Quality Contract parser/model** — normalizes abstract ladder rows and preserves legacy `QC-*` compatibility.
3. **Artifact memory ingestion** — extracts architecture decisions, behavior markers, and archived task lessons into durable memory records.
4. **Artifact renderer** — produces readable HTML/views once parsing and conformance are reliable.

## Recommended Next Plan

Start with `artifact-conformance-gate`.

Proposed scope:

- Parse `## Behaviors` from planned `plan.md` files.
- Validate required fields for each `B-###` entry.
- Validate `@cosmo-behavior plan:<slug>#B-###` marker syntax.
- Check referenced test files exist and contain the marker.
- Expose the check as a testable library function and one CLI/Drive-friendly command or verifier claim.
- Do not enforce concrete quality tools, parse test ASTs, or back-migrate old plans in the first version.

## Keep Out of Scope for Now

- Full gate execution engine
- Concrete `.cosmonauts` gate-binding schema
- HTML rendering
- Back-migration of existing archived plans
- Framework-specific test AST parsing
- Automatic memory injection into future sessions
