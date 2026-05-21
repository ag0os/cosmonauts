## Purpose

Cosmonauts produces its work documents without a coherent, enforced shape. An audit of the active plans in `missions/plans/` found compounding problems:

- **Spec is optional and usually absent.** Only 5 of 11 plans have a `spec.md`; the rest fold the product "why" into the plan's `Overview`, blurring the product/technical boundary.
- **"Plan" silently serves three jobs.** Implementation plans, architecture-of-record documents, and tactical patch plans are all called `plan.md` despite having genuinely different shapes and lifecycles.
- **The behavior spine is missing.** `/skill:plan` prescribes a `Behaviors` section; no audited plan has one. Yet the `tdd` skill already tells implementers that "the plan's behaviors are your test targets" — a dangling reference to content that is never written.
- **Quality lives at three overlapping altitudes** — spec `Acceptance Criteria`, plan `Behaviors`, plan `Quality Contract` — with no defined relationship, so planners use one and skip the rest.
- **Measurement is surfaced but never contracted.** The `project-tools` extension tells agents that analysis tools like `fallow` exist, but nothing ties a tool to an artifact, a workflow moment, or a pass condition. Quality tooling is informational, not enforced.
- **Skills risk becoming monoliths.** If each role prompt or skill embeds the full artifact rules independently, agents pay a context tax on every invocation and the rules drift.

This spec redesigns the work-document formats into one coherent system for work that needs planning: three named artifacts with distinct, enforced shapes; behaviors as the spine that traces every user-facing outcome down to a test; and an abstract gate-contract concept that lets quality measurement be enforced uniformly across languages without hard-coding language-specific tools into generic prompts.

This is **not** meant to make every change use the full artifact stack. Small fixes still use disciplined TDD, but they should not be burdened with architecture-record ceremony. The format distinguishes direct fixes, tactical bugfix/task work, planned feature/refactor work, and architectural/multi-plan work so agents can pick the lightest workflow that still preserves behavior and structure.

The implementation also adopts a **thin-dispatcher / thick-reference skill architecture**: role skills route to the right procedure and load only the relevant artifact reference, while shared artifact rules live in one reusable `work-artifacts` skill. This keeps skills useful without making every agent carry the whole format in context.

It is the foundational step of a larger initiative. Follow-up specs cover gate enforcement, memory integration, and HTML rendering of these artifacts; those depend on the formats defined here being stable.

## Users

Four audiences, all served by the same artifact set:

1. **Humans designing and reviewing work** — they author specs, read plans, and consult architecture records. Today they meet an inconsistent shape every time.
2. **Agents that produce artifacts** — `spec-writer`, `planner`, and a new `architect` role. They need an unambiguous format to write into and a clear rule for which artifact a given piece of work requires.
3. **Agents that consume artifacts** — `task-manager`, `worker`, `reviewer`, `verifier`, `quality-manager`. They need behaviors, gates, and criteria to be machine-addressable, not buried in prose.
4. **Anyone entering a codebase cold** — the reader of `architecture.md`, human or agent, who needs orientation before making a change.

The primary users are the producing and consuming agents (2 and 3). The format's entire value is whether the spec → plan → task → verify pipeline runs on one consistent, addressable structure. The success measure: a consuming agent can reliably extract "the behaviors," "the gates," and "the acceptance criteria" from any artifact without guessing.

## User Experience

### Workflow tiers

Agents choose the lightest workflow that fits the risk and scope:

1. **Direct fix** — for very small, self-contained fixes. No `spec.md`, no `plan.md`, no `architecture.md`. The worker uses `/skill:tdd`; the regression test is the behavior record.
2. **Tactical task / small bugfix** — for small work that benefits from persistence or handoff but not full planning. No spec required. A tiny plan or single task may carry the regression behavior and acceptance criteria. No architecture record.
3. **Planned feature / refactor** — for bigger changes that need careful design and testing. Requires `spec.md` for the product/user side and `plan.md` for the technical side. The plan has a full `Behaviors` section and a Quality Contract ladder.
4. **Architectural / multi-plan work** — for umbrella work that establishes durable boundaries, dependency rules, or decisions that multiple plans must obey. Uses `architecture.md` plus one or more child implementation plans.

The skills should help agents route work into these tiers instead of defaulting every request into the heaviest structure. Good skills can reduce chain length and agent count by giving each agent enough situational discipline to choose the right artifact shape.

### Skill architecture

Artifact knowledge is implemented as a shared reference set, not duplicated across role skills:

```text
domains/shared/skills/work-artifacts/
  SKILL.md              # thin dispatcher: laws, routing table, reference map
  references/
    workflow-tiers.md
    spec-format.md
    plan-format.md
    architecture-format.md
    behavior-spine.md
    gate-contracts.md
    visual-primitives.md
    examples.md
```

Role skills and prompts consume this shared skill:

- `/skill:plan` owns plan lifecycle, plan tools, and readiness; it routes to `work-artifacts` references for artifact shape and behavior/gate details.
- `/skill:task` owns task lifecycle and task tools; it routes to behavior-spine guidance when creating tasks from planned behaviors or handling tactical bugfixes.
- `/skill:tdd` owns the red/green/refactor loop; it routes to behavior-spine guidance only when a planned behavior marker is required.
- `/skill:architecture` owns architecture-record authoring; it routes to the architecture-format and boundary-model guidance.
- `spec-writer`, `planner`, `task-manager`, `worker`, `reviewer`, `verifier`, and `quality-manager` prompts route agents to the relevant skill instead of embedding the whole artifact format.

The shared skill is opinionated. It uses refusal rules and sanity checks, not generic advice:

- If a behavior has no named test and marker, the plan is not ready.
- If a `Design` section cannot trace to behavior placement, rewrite the design.
- If a Quality Contract names a concrete tool, rewrite it as a gate kind.
- If an architecture record would not change implementation or review, do not create it.
- If a direct fix is being forced through the full artifact stack, route to the lighter TDD/regression-test path.

Detailed examples live in references and are loaded only for the matching workflow tier.

### The three artifacts

**`spec.md` — the product document (PRD).** What is being built, who for, why, how the experience flows. Required for planned feature/refactor work; optional for bugfix/tactical-patch work. Sections stay as today's spec-writer output: `Purpose`, `Users`, `User Experience`, `Acceptance Criteria`, `Scope`, `Assumptions`, `Open Questions`. Acceptance criteria in planned work use stable IDs: `AC-001`, `AC-002`, ...

**`plan.md` — the technical document.** How the work will be implemented. Behavior-first (below). Scoped strictly to "the precursor to tasks" — the implementation-plan archetype only. Required for work that produces tasks. Tiny direct fixes can bypass plans; tactical bugfixes may use a deliberately small plan or single task whose regression test is the behavior.

**`architecture.md` — the architecture record.** A long-lived document, created only when work is umbrella-scoped, spans multiple implementation plans, or establishes durable architectural decisions or boundaries. It must be useful during plan implementation; if workers and reviewers would not need it to implement or evaluate the plan, it should not be created. Carries a `Decision Log` (Decision / Alternatives / Why / Decided-by), the current/target architecture, and a declared **Boundary Model** — the zones of the codebase and which may depend on which. Durable architecture records live under `missions/architecture/<slug>.md`; implementation plans link to them instead of nesting architecture-of-record content inside `missions/plans/<slug>/plan.md`.

A given piece of work uses: a spec plus a plan for planned feature/refactor work; a plan or task for tactical bugfix work; an architecture record only when the work is umbrella-scoped, multi-plan, or boundary-establishing.

### Writing a plan, behavior-first

The planner authors a plan in this order:

1. **Behaviors first.** Each spec `Acceptance Criterion` decomposes into one or more behaviors, written as *context → action → expected result*. Every behavior names **where it lives** (the module/seam) and **how it is tested** (a specific test). A behavior that cannot be cleanly placed or tested is the signal of a missing seam or a bad boundary — the design is revised, not the behavior.
2. **Design is derived.** The `Design` section is the aggregate of those placement decisions plus cross-cutting structure — not a parallel narrative written independently of the behaviors.
3. **Quality Contract is an ordered gate ladder.** It references gates by kind in the order they should run (correctness → artifact-conformance → mutation → duplication → complexity → boundary-conformance → dead-code), with the expectation that issues are fixed between rungs. It names no concrete tool.
4. `Files to Change` stays a flat list. `Implementation Order` and `Risks` as today.

### Behaviors and their durable home

A behavior is the spine connecting a user to a test:

```text
User → Acceptance Criterion (spec) → Behavior (plan) → Test + Seam → Code
```

A behavior's **durable home is the test layer** — it is recorded coupled to the test that proves it. The plan's `Behaviors` section is a *working view* used during active planning. When a plan is archived, its behaviors are not lost: they persist with their tests and continue to guard against regressions. Every behavior must name a test; a behavior with no test is a not-ready plan.

For planned work, the trace is bidirectional and addressable:

- spec acceptance criteria have stable IDs: `AC-001`, `AC-002`, ...
- plan behaviors have stable IDs: `B-001`, `B-002`, ...
- one behavior maps to one test intent; a task may own a cluster of behaviors, but behavior granularity stays closer to the test than to the task
- each behavior references its source acceptance criterion, seam, named test, and marker
- the corresponding test carries the same marker close to the executable test

Example plan behavior:

```md
### B-003 — Plans reject behaviors without tests

- Source: AC-004
- Context: a planner is preparing a plan for task creation
- Action: a behavior has no named test
- Expected: the plan is not ready and the missing test is explicit
- Seam: `/skill:plan` readiness check
- Test: `tests/skills/plan-format.test.ts` > `flags behaviors without test references`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-003`
```

Example test marker:

```ts
// @cosmo-behavior plan:artifact-format-redesign#B-003
it("flags behaviors without test references", () => {
  // ...
});
```

The marker is intentionally plain text: grepable, language-agnostic, and not tied to a test framework. Direct fixes and tiny unplanned patches do not need behavior IDs or markers unless they become part of a plan; their regression test is still the behavior record.

### Architecture documents as active implementation context

`architecture.md` is not background reading and not a dumping ground for design prose. It exists when implementation needs durable architectural context that outlives one plan:

- dependency direction
- state ownership
- stable contracts between subsystems
- boundary model and allowed dependency rules
- decisions that multiple plans must obey
- "do not cross this seam" rules

Plans that depend on an architecture record should include an `Architecture Context` section that links to the record and names the relevant decisions and boundary rules. Example:

```md
## Architecture Context

This plan implements part of `missions/architecture/work-artifacts.md`.

Relevant decisions:
- D-002 — Behaviors are proven in tests, not only described in plans.
- D-004 — Gate contracts reference kinds, never tools.

Boundary rules this plan must preserve:
- Skills may prescribe artifact shape.
- Skills must not know concrete language tooling bindings.
```

If an architecture document would not change how a worker implements the plan or how a reviewer evaluates it, the work should use a plan only and let any lasting lessons be distilled into memory after completion.

### Architecture and memory

`architecture.md` and `memory/` serve different purposes:

- `architecture.md` is authoritative, explicit, and used during active planning, implementation, and review.
- `memory/` is distilled, retrievable agent knowledge produced after work completes.

The improved memory system may later ingest architecture decisions, archived plans, and behavior/test markers so agents carry lessons into future work. That memory ingestion and retrieval behavior is out of scope for this format plan; this spec only defines the artifact side clearly enough for future memory work to consume it.

### Gate contracts

A gate contract is an abstract, named quality gate that artifacts reference **by kind, never by tool name**. Kinds: `correctness`, `artifact-conformance`, `complexity`, `duplication`, `dead-code`, `boundary-conformance`, `mutation`.

Each gate has a **binding state** — *bound* (a project tool fills it; e.g. on this TypeScript repo `complexity`, `duplication`, `dead-code`, and `boundary-conformance` all bind to `fallow`) or *unbound*.

Gates are **tiered**:

- **Universal** — `correctness` (tests pass) and `artifact-conformance` (every planned behavior names a test, every named test exists, and every named marker appears in the referenced test). Enforceable on any project in any language, because `artifact-conformance` measures cosmonauts' own artifacts rather than the target language's code.
- **Bindable** — every other kind. Enforced when bound; degraded when not.

**Degradation rule** for an unbound bindable gate: never a silent pass, never a hard failure. The workflow records an explicit state ("`complexity` gate: unbound, not enforced"), falls back to agent judgment for that run, and recommends adopting a tool.

A gate contract carries: its kind, binding state, tier, an optional threshold, and a protocol slot. In this format plan, the protocol slot is a placeholder. The follow-up enforcement plan fills who runs the gate, when it runs, and what remediation path applies. Project-specific gate bindings likewise live outside generic artifacts and are deferred to a later `.cosmonauts` configuration/enforcement design.

### Failure and edge flows

- **Behavior with no test** — the plan is not ready; the missing test reference is visible, not silent.
- **Behavior marker missing from the named test** — artifact-conformance fails once enforcement exists; until then, reviewers and quality agents treat it as a format defect.
- **Direct fix** — no spec or plan is required; the worker writes a regression test first and implements the minimal fix.
- **Bugfix/tactical work** — no spec required; a plan is optional depending on handoff/risk; the regression test for the bug is itself a behavior.
- **Unbound gate on a new language** (e.g. a fresh Ruby project with no complexity tool) — the degradation rule applies; the same workflow runs, only the bindings differ.
- **Architecture boundary violated** — when a `boundary-conformance` gate is bound, a declared `architecture.md` Boundary Model is mechanically checkable; a violation fails the gate.
- **Architecture document not useful to implementation** — do not create one; use a plan/task and rely on post-completion memory distillation for general lessons.
- **Skill about to duplicate artifact rules** — route to `work-artifacts` references instead; duplication is a format defect because future agents will receive inconsistent rules.

### Visual primitives

All three artifacts express diagrams and matrices through a fixed set of markdown-native primitives, so a future renderer has consistent input: **Mermaid** for sequence/flow/architecture diagrams, **tables** for matrices and the Quality Contract ladder, **structured lists** for decision logs and risks, **checklists** for acceptance criteria. No artifact uses ASCII-art diagrams. The HTML renderer itself is out of scope here.

## Acceptance Criteria

- [ ] AC-001 — `/skill:plan`, `/skill:task`, `/skill:tdd`, the `spec-writer` prompt, and a new architecture skill describe exactly three artifacts — `spec.md`, `plan.md`, `architecture.md` — each with distinct prescribed sections.
- [ ] AC-002 — The skills define workflow tiers: direct fix, tactical task/small bugfix, planned feature/refactor, and architectural/multi-plan work.
- [ ] AC-003 — The skills state that the full artifact stack is for bigger planned work, not small direct fixes; direct fixes use TDD and a regression test as the behavior record.
- [ ] AC-004 — The skills state that a spec is required for planned feature/refactor work and optional for bugfix/patch work; `spec-writer` applies this rule.
- [ ] AC-005 — Every full plan has a `Behaviors` section; each behavior is written as context/action/expected-result and names a source acceptance criterion, seam, test, and behavior marker.
- [ ] AC-006 — Acceptance criteria and behaviors use stable IDs (`AC-###`, `B-###`) for planned work.
- [ ] AC-007 — The corresponding test carries the behavior marker near the executable test using the language-agnostic `@cosmo-behavior plan:<slug>#B-###` format.
- [ ] AC-008 — The `tdd` skill's reference to "the plan's behaviors" resolves to a section the plan format guarantees exists for planned work, while still allowing direct fixes to use the regression test as the behavior record.
- [ ] AC-009 — A plan's `Design` section is described as derived from behavior placement, not authored independently.
- [ ] AC-010 — `Quality Contract` is prescribed as an ordered ladder of gate references by kind; no artifact format permits naming a concrete tool.
- [ ] AC-011 — The gate-contract concept is defined with: kind, binding state (bound/unbound), tier (universal/bindable), optional threshold, and a protocol slot.
- [ ] AC-012 — The degradation rule is documented: an unbound bindable gate yields an explicit recorded state, never a silent pass or a hard fail.
- [ ] AC-013 — `architecture.md` is defined as a distinct artifact with a `Decision Log` and a declared `Boundary Model`; architecture-of-record content no longer belongs in `plan.md`.
- [ ] AC-014 — Durable architecture records live under `missions/architecture/<slug>.md`, and plans that depend on one include an `Architecture Context` section naming the relevant decisions and boundary rules.
- [ ] AC-015 — The architecture skill states that `architecture.md` is created only when it is useful during implementation/review because durable boundaries, dependency rules, or multi-plan decisions are involved.
- [ ] AC-016 — The format documentation distinguishes `architecture.md` from `memory/`: architecture is active authoritative implementation context; memory is post-completion distilled knowledge and retrieval.
- [ ] AC-017 — The artifact formats prescribe the approved visual primitives and forbid ASCII-art diagrams.
- [ ] AC-018 — The format documentation states that a behavior's durable home is the test layer and that archiving a plan does not lose its behaviors.
- [ ] AC-019 — Artifact rules are implemented through a shared `work-artifacts` skill with on-demand `references/`, while role skills remain thin dispatchers and do not duplicate canonical artifact rules.
- [ ] AC-020 — `work-artifacts` includes examples/templates for at least: direct fix, tactical bugfix, planned feature/refactor, and architecture-linked multi-plan work.
- [ ] AC-021 — The generic artifact format leaves project-specific gate bindings and protocol execution to follow-up configuration/enforcement work; generic artifacts never name concrete gate tools.

## Scope

**Included**

- Canonical section structures for `spec.md`, `plan.md`, and `architecture.md`.
- Workflow-tier routing rules for direct fixes, tactical bugfix/tasks, planned feature/refactor work, and architectural/multi-plan work.
- A new shared `work-artifacts` skill using a thin dispatcher plus on-demand `references/` as the canonical home for artifact rules.
- Updates to `/skill:plan`, `/skill:task`, `/skill:tdd`, and relevant role prompts so they route to shared artifact references instead of duplicating the rules.
- A new `/skill:architecture` dispatcher for architecture-record authoring.
- The behavior format (context/action/result + source acceptance criterion + seam + test reference + behavior marker) and the rule that its durable home is coupled to tests.
- Stable acceptance-criterion and behavior IDs for planned work.
- The language-agnostic behavior marker format: `@cosmo-behavior plan:<slug>#B-###`.
- The gate-contract concept — kinds, binding states, tiers, degradation rule, placeholder protocol slot — as a format/contract definition, including how artifacts reference gates.
- The rule for which artifact is required for which kind of work.
- The approved set of visual primitives.
- The distinction between active architecture records and post-completion memory.

**Excluded**

- The enforcement engine that runs gates and verifies behavior↔test conformance — follow-up spec.
- Wiring gate protocols into specific chain/Drive workflow moments — follow-up spec; intersects orchestration-consolidation.
- The concrete `.cosmonauts` gate-binding schema and loader — follow-up enforcement/configuration work.
- HTML rendering of artifacts — follow-up spec.
- A gate-setup / tooling-onboarding capability for new languages — follow-up; `project-tools` already stubs `detectReek`.
- Expanding language-specific test skills (`languages/<x>/<x>-testing`) — ongoing skill work.
- Back-migrating existing `missions/plans/` artifacts to the new format — the format applies going forward.
- Memory ingestion, retrieval, and automatic injection of archived lessons into future agents — follow-up memory-system work.
- Creating a full `architect` agent role; this plan adds the architecture skill only.
- Changes to the task artifact beyond the `/skill:task` updates needed to consume behaviors and route small tactical work.

## Assumptions

- Behaviors are stored coupled to their tests; the plan carries only a transient working view. [decided with user]
- Planned feature/refactor work uses `spec.md` plus `plan.md`; direct fixes and small tactical bugfixes can use lighter workflows. [decided]
- A spec is required for planned feature/refactor work and optional for bugfix/patch work. [decided]
- `Files to Change` remains a flat list. [decided]
- Architecture-of-record is a distinct artifact, not a plan variant. [decided]
- Durable architecture records live under `missions/architecture/<slug>.md`, with plans linking through `Architecture Context`. [decided]
- Architecture records are created only when useful during implementation/review, not as general background documentation. [decided]
- Behavior granularity is one behavior per test intent; tasks may own behavior clusters. [decided]
- Behavior/test coupling uses stable IDs plus a plain-text `@cosmo-behavior` marker in the test layer for planned work. [decided]
- `Quality Contract` is an ordered ladder table of gate kinds, not a per-criterion command list. [decided]
- Gate protocol slots remain placeholders in this plan; enforcement follow-up fills who/when/how. [decided]
- Project-specific gate bindings are deferred to follow-up `.cosmonauts` configuration/enforcement work. [decided]
- `architecture.md` is active implementation context; `memory/` is post-completion distilled/retrievable knowledge. [decided]
- Canonical artifact knowledge lives in a shared `work-artifacts` skill; role skills route to it instead of duplicating it. [decided]
- `correctness` and `artifact-conformance` are enforceable on every project; all other gate kinds are bindable.
- `fallow` is the bound TypeScript tool for complexity/duplication/dead-code/boundary-conformance in this repository, but that binding must not appear in generic artifact formats.
- The existing four-layer prompt composition and skill system can carry the new format prescriptions without framework changes.

## Open Questions

No format-blocking open questions remain. Follow-up plans will decide the concrete gate-binding configuration schema, gate execution protocol, HTML renderer, and memory ingestion/retrieval behavior.
