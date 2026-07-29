# Integrating Fallow Into Cosmonauts Coding Workflows

This document records how Fallow backs Cosmonauts' analysis capability runtime
and how the remaining workflow integration is staged across the work
lifecycle:

> roadmap → plan → tasks → sessions → archive → memory

The core recommendation is to treat Fallow as both:

1. a **change-regression gate** that prevents newly introduced structural debt;
2. a **codebase-stewardship sensor** that makes existing debt and trends visible.

Using only the first lets historical debt accumulate out of sight. Using only
the second produces reports without enforcement. Cosmonauts needs both.

For Fallow's capability reference, commands, and limitations, see
[`fallow.md`](fallow.md). For intentional repository exceptions, see
[`fallow-exceptions.md`](fallow-exceptions.md).

## Goals

- Prevent new dead code, dependency problems, cycles, duplication, complexity,
  and architecture drift.
- Give planning and review agents structural evidence before code is written.
- Preserve structured findings and remediation actions instead of reducing
  Fallow to pass/fail prose.
- Keep generic work artifacts portable by binding abstract gate kinds at
  runtime.
- Turn project-wide health trends into prioritized, bounded maintenance work.
- Avoid metric-driven over-refactoring and unsafe automated deletion.

## Non-Goals

- Replacing tests, type checking, linting, security review, or performance
  profiling.
- Making every Fallow observation merge-blocking.
- Requiring Fallow in non-TypeScript/JavaScript domains.
- Embedding concrete tool names in generic plan or task formats.
- Automatically converting every hotspot or clone into a refactoring task.
- Bulk-applying Fallow fixes without trace evidence and behavioral verification.

## Delivery Status

### Runtime delivered in this slice

- [`../fallow.toml`](../fallow.toml) identifies stable public entry points,
  including `lib/analysis/index.ts`, runtime-loaded domain files, and
  production-only duplication analysis.
- `lib/analysis/index.ts` exports the provider-neutral vocabulary, requests,
  binding states, results, failures, and pure resolver.
- `project-tools` registers `analysis_status` plus one tool for each of the
  seven capabilities. Agent-start status lists every binding with its provider,
  version, scopes, metrics, and diagnostic state.
- Fallow is pinned exactly at `2.54.2`. Its adapter uses an explicitly
  configured or project-local executable without `PATH` or mutable-fetch
  fallback, requires per-project execution consent, disables analysis/config
  caches, preserves complete JSON/stderr, validates schemas, and distinguishes
  findings from process/runtime failures.
- Boundary conformance remains visibly `provider-not-configured` until the
  resolved Fallow configuration has both zones and rules.
- The live changed-scope fixture covers tracked, staged, and untracked files
  from an explicit base. Fix support is dry-run only, and whole-worktree
  snapshots prove that status and capability calls do not write provider
  caches or source files.

### Sequential follow-up boundaries

- `analysis-gate-rewiring` changes Quality Manager, Verifier, and Fixer
  consumption to the generic capability tools, distributes the extension and
  shared analysis skill to the seven v1 roles, removes the retained
  detected-command prose, and deletes the concrete provider skill.
- `analysis-investigation-procedures` teaches Planner, Plan Reviewer, Worker,
  and Refactorer the provider-neutral investigation, trace-before-delete, and
  task-close audit procedures.
- CI enforcement, scheduled full-project stewardship, repository boundary-zone
  authoring, a second executable provider, and MCP/Node transports remain
  follow-up work outside those slices.

Until `analysis-gate-rewiring` lands, the legacy detected-command block and the
concrete Fallow skill remain intentionally shipped so existing consumers and
links are not stranded. The runtime is additive; no completion claim for the
remaining `analysis-tools` roadmap work is implied.

## Operating Model: Two Lanes

### Lane 1: Change Regression

Run Fallow against the task, wave, or pull-request base. This lane is fast,
blocking, and concerned with the delta.

Primary operation:

```bash
fallow audit --base <merge-base-sha> --format json --quiet --explain
```

Policy:

- block new error-severity findings;
- preserve warn-level findings for reporting;
- distinguish exit code `1` (quality finding) from `2` (tool/runtime error);
- route the full structured finding and its actions to remediation;
- re-run after every remediation that changes code.

### Lane 2: Codebase Stewardship

Run full-project analysis on the base branch on a schedule or before major
planning work. This lane is advisory by default and concerned with absolute
state and trend.

Primary operations:

```bash
fallow --format json --quiet --explain --score
fallow health --hotspots --targets --score --trend --format json --quiet --explain
fallow flags --format json --quiet --explain
fallow dead-code --stale-suppressions --format json --quiet --explain
```

Policy:

- persist summaries and health snapshots;
- rank work by evidence, impact, confidence, and effort;
- create bounded maintenance tasks only after human or planning-agent judgment;
- ratchet debt downward without blocking unrelated feature work;
- never silently turn the full-project advisory result into a pass.

## Quality-Gate Policy

The project should bind Fallow to four existing abstract gate kinds.

| Gate kind | Fallow evidence | Default change policy | Full-project policy |
|---|---|---|---|
| `dead-code` | Reachability, exports/types, dependencies, unresolved/unlisted imports, duplicate exports, cycles, stale suppressions | Block new error-severity findings | Track inventory and remove/configure intentionally |
| `duplication` | Clone groups and duplication threshold | Block new clones above the agreed threshold | Track percentage and high-value clone families |
| `complexity` | Cyclomatic, cognitive, CRAP, and configured thresholds | Block new threshold violations | Track score, hotspots, large functions, and targets |
| `boundary-conformance` | Configured zone/rule violations | Block every new violation | Audit architecture drift |

Boundary conformance is `unbound`, not “passing,” until Fallow reports
`configured: true`.

### Blocking Signals

Good candidates for hard change gates are:

- unresolved imports;
- unlisted dependencies;
- new unused files, exports, or types when the reachability model is trustworthy;
- new circular dependencies;
- new configured boundary violations;
- new complexity/CRAP threshold violations;
- new clone groups above the configured threshold;
- newly introduced or newly stale suppressions.

### Advisory Signals

Keep these advisory unless a plan declares a narrow, measurable target:

- overall health score;
- maintainability index;
- hotspot rank and velocity;
- ownership and bus-factor signals;
- ranked refactoring targets;
- semantic clone candidates;
- feature-flag inventory;
- historical full-project findings;
- runtime cold/hot-path suggestions.

A metric becoming worse can trigger investigation without automatically proving
that the implementation is wrong.

## Runtime Binding Architecture

Generic artifacts name capabilities and abstract gate kinds. The concrete
mapping is implemented at the `project-tools` provider edge.

```text
plan Quality Contract
  └─ abstract gate kind
       └─ stable analysis capability
            └─ lib/analysis binding resolver
                 └─ project-tools session binding
                      └─ consented Fallow adapter
                           ├─ normalized findings
                           ├─ trace evidence
                           ├─ preview proposals
                           └─ complete native envelope
```

This preserves language-agnostic plans: another repository can bind the same
gate kind to a different tool or report it as unbound.

### Delivered Provider Contract

The exact public contract is
[`../lib/analysis/index.ts`](../lib/analysis/index.ts), with its field-level
cross-tool evidence in
[`analysis-provider-validation.md`](analysis-provider-validation.md). V1
selects one provider per project/session, either by optional
`analysis.provider` preference or auto-detection. The provider advertises
support per capability, including scope kinds and complexity metrics.

Bindings are `bound`, `unbound`, or `failed`. Requests can resolve to ready,
unbound, unsupported scope, unsupported metric, or failed. Completed
analysis-kind results carry `pass` or `fail`; trace and fix preview carry
`not-applicable` with evidence or proposals. Findings retain locations,
severity, actions, provider-tagged details, and adapter-local IDs with no
cross-session determinism promise. The native envelope preserves parsed
payload, stderr, and completed exit code without truncation.

### Runtime Placement

The provider-neutral core has no Pi or Fallow dependency. The existing Pi
`project-tools` extension owns provider signal detection, consent-gated
introspection, process execution, normalization, session snapshotting, status
injection, and tool registration. It uses a local signal-aware process runner
because the required exit/signal/abort distinction is stricter than the
available Pi execution helper preserves.

The CLI transport is sufficient for v1. Fallow MCP and Node bindings remain
possible future adapters, not runtime dependencies.

## Workflow-Stage Integration

The runtime rows below describe the intended end-to-end workflow. Final-gate
consumer rewiring lands in `analysis-gate-rewiring`; planning and task-close
procedures land in `analysis-investigation-procedures`. They are not claimed as
delivered by the runtime slice.

| Stage or role | Use Fallow for | Do not use it for |
|---|---|---|
| Roadmap | Surface declining health, high-impact hotspots, recurring cycles, and stale flags as candidate investments. | Automatically filling the roadmap with every finding. |
| Spec writer | Usually no Fallow call. For migration/cleanup specs, establish the observable problem and affected public surface. | Turning implementation metrics into user requirements. |
| Planner / explorer | Inspect project structure, boundaries, touched-area health, existing clones, and reachability traces before choosing a design. | Treating a suggested extraction as the design. |
| Plan reviewer | Challenge duplicate code paths, dependency direction, API assumptions, and the proposed gate thresholds with evidence. | Requiring historical debt cleanup outside the plan scope. |
| Task manager | Preserve applicable gate kinds, scope, expected delta, and task-start base in task execution context. | Embedding Fallow-specific commands in generic task artifacts. |
| Worker / refactorer | Run changed-scope analysis after behavior tests pass and after the refactor step; trace before deletion or extraction. | Running broad auto-fix or refactoring passing code solely for a score. |
| Coordinator | Run an audit at task/wave boundaries to catch cross-task cycles, clones, and interface drift. | Re-running full health after every small edit. |
| Integration verifier | Check declared boundary and integration contracts against real configured findings. | Claiming boundary conformance when boundaries are unconfigured. |
| Quality Manager | Execute lossless changed-scope gates, route findings, re-verify, and record final evidence. | Reducing analysis to a prose pass/fail line. |
| CI | Enforce the changed-scope regression lane and publish SARIF or annotations. | Making historical project debt fail every unrelated pull request. |
| Archive / distiller | Record the final gate evidence and meaningful metric delta. | Copying thousands of raw findings into durable memory. |
| Scheduled maintenance | Save snapshots, review trends/hotspots/targets/flags, and remove stale suppressions. | Creating unbounded “clean everything” projects. |

## Detailed Protocols

### Planning Protocol

For a non-trivial feature or refactor:

1. Inspect detected entry points, plugins, and boundaries.
2. Scope health analysis to likely touched paths or the branch base.
3. Search for existing implementations and semantic clones when the plan proposes
   a new shared path.
4. Trace exports/files that the plan proposes moving, deleting, or making
   private.
5. Record evidence in risks, architecture, integration seams, and expected gate
   deltas.
6. Express the Quality Contract with abstract gate kinds.

Useful operations:

```bash
fallow list --entry-points --format json --quiet
fallow list --boundaries --format json --quiet
fallow health --changed-since <base> --format json --quiet --explain
fallow dupes --mode semantic --changed-since <base> --format json --quiet --explain
```

Semantic duplicate search is advisory. It is most useful for testing a concrete
hypothesis such as “this plan may create a second backend runner.”

### Task Implementation Protocol

At task start, preserve the source commit or task base. During implementation:

1. follow Red → Green → Refactor;
2. run focused tests while behavior is still changing;
3. after the refactor step, run a changed-scope Fallow audit;
4. trace any unused public/dynamic symbol or dependency;
5. apply the narrowest correction;
6. re-run focused tests, type checking, and the audit;
7. include structured gate evidence in task completion.

For a task that moves or renames files, exports, commands, config keys, or
paths, run the stale-reference/dead-code sweep immediately rather than waiting
for final verification.

### Coordinator And Integration Protocol

Independent tasks can each be locally clean while creating an integration-level
cycle or duplicate path. At the end of a task wave:

1. audit from the wave-start commit;
2. attribute findings to the task or integration seam that introduced them;
3. route local fixes to the responsible worker;
4. route cross-task design fixes through an explicit remediation task;
5. re-run the integration verifier after changes.

Do not use a full-project result to assign unrelated historical findings to the
current wave.

### Quality Manager Protocol

The Quality Manager should:

1. determine the true local integration merge base;
2. resolve the plan's abstract gate ladder;
3. obtain the current project-tool bindings;
4. mark unavailable bindings explicitly;
5. run the audit for both feature-branch and dirty-base review scenarios;
6. pass the exact base SHA, not an unresolved shell variable, to the Verifier;
7. retain Fallow's complete JSON result in verifier evidence;
8. route only blocking configured findings;
9. constrain the Fixer to the narrowest change that clears the finding;
10. re-run Fallow after every remediation;
11. include final gate-kind status and evidence in `qm.md`.

The adapter must treat:

- exit `0` as a successful analysis with pass/warn verdict;
- exit `1` as a completed analysis with blocking findings;
- exit `2` or an error JSON envelope as a tool/runtime failure.

A runtime error must never be reported as a clean gate.

### CI Protocol

Pin Fallow in `devDependencies` so local agents and CI execute the same engine.
Then add a pull-request gate:

```bash
fallow audit \
  --base <pull-request-base-sha> \
  --format sarif \
  --quiet \
  --fail-on-issues
```

The official GitHub Action supports `command: audit`, `gate: new-only`, SARIF,
annotations, and comments. The upstream CI reference is:
<https://github.com/fallow-rs/docs/blob/main/integrations/ci.mdx>.

CI should preserve the report artifact even when the command exits `1`; the
pipeline must still publish SARIF or annotations before failing the gate.

Add a separate scheduled base-branch job for the stewardship lane. It should
save health snapshots and publish a summary, but it should not fail merely
because known historical debt exists.

### Archive And Memory Protocol

Persist concise evidence:

- Fallow version and resolved configuration identity;
- scope and base SHA;
- gate-kind verdicts and counts;
- final unresolved/deferred findings;
- before/after health delta when a plan explicitly targeted health;
- new durable exceptions and their reasons.

Do not persist the entire raw report in distilled memory. Keep raw analysis as a
session or CI artifact and distill only reusable decisions, patterns, and
exception rationale.

## Architecture-Boundary Adoption

Cosmonauts already declares three conceptual layers:

- framework under `lib/`;
- built-in domains under `domains/`;
- installable domains under `bundled/`;
- the executive layer under `domains/main/`;
- CLI entry points above those layers.

Before writing Fallow rules, run a dependency-direction audit and distinguish
intended composition roots from leaks. Candidate invariants to validate include:

- `lib/` does not import `domains/`, `bundled/`, or `cli/`;
- `domains/shared/` does not depend on `domains/main/` or a bundled domain;
- `domains/main/` may depend on framework/shared contracts but remains free of
  coding-domain assumptions;
- bundled domains depend inward on stable framework/shared contracts rather than
  the executive layer;
- `cli/` is an outer composition layer and does not become a dependency of
  framework or domain code.

Do not adopt a preset only because its name sounds suitable. Model Cosmonauts'
actual architecture with custom zones where necessary, first as advisory
findings, then as blocking rules after existing violations are classified.

## Baselines, Exceptions, And Ratchets

Prefer the changed-scope `new-only` gate because it naturally prevents new debt.
Use baselines only when identity tracking is necessary for an existing class of
findings that cannot be cleaned immediately.

If a baseline is introduced:

- commit it;
- name the debt class it represents;
- continue failing genuinely new findings;
- reduce it as cleanup lands;
- never regenerate it merely to make CI green.

For exceptions:

1. trace the finding;
2. prefer entry/public/dynamic configuration for repository conventions;
3. use the narrowest issue-specific suppression for an isolated exception;
4. record its reason in [`fallow-exceptions.md`](fallow-exceptions.md);
5. keep stale-suppression detection enabled;
6. remove it as soon as the analyzer can model the code or the code changes.

## Safe Remediation Policy

The analyzer's action is a proposal.

Before removing an export, file, or dependency:

1. trace it;
2. check public API and runtime-loading conventions;
3. inspect package scripts and workspace ownership;
4. preview Fallow's mutation;
5. apply only the reviewed change;
6. run type checking and tests;
7. re-run the same Fallow gate.

Before consolidating a clone:

1. confirm the code represents the same responsibility;
2. verify it changes for the same reason;
3. ensure extraction does not cross an architecture boundary;
4. preserve behavior tests around each caller;
5. reject an abstraction that adds as much indirection as duplication it removes.

Before simplifying a complex function:

1. inspect which metric triggered;
2. check whether missing coverage, rather than structure, drives CRAP;
3. preserve observable behavior with tests;
4. make the smallest structural improvement;
5. compare the before/after finding instead of chasing the project score.

## Delivery Sequence

### Delivered: Capability Runtime

- Pin Fallow `2.54.2` in package and lock data.
- Export the provider-neutral contract from `lib/analysis/index.ts`.
- Register typed status and capability tools in `project-tools`.
- Detect the executable, version, resolved configuration, and boundary state
  behind execution consent.
- Preserve structured results and provider failures without mutation or cache
  writes.
- Prove explicit-base dirty scope, schema validation, cancellation, timeout,
  and whole-worktree no-write behavior.

### Next: `analysis-gate-rewiring`

- Resolve final Quality Contract gates through capability bindings.
- Run changed-scope gates for feature-branch and dirty-base reviews.
- Route complete findings through narrow remediation and re-verification.
- Replace the legacy detected-command bridge and concrete provider skill with
  the shared provider-neutral procedure in the same slice.

### Then: `analysis-investigation-procedures`

- Give Planner and Plan Reviewer capability-based structure, duplication,
  complexity, and trace evidence before design.
- Add trace-before-delete and task-close audit procedures for Worker and
  Refactorer.
- Preserve explicit no-evidence/unbound records without leaking provider
  commands into shipped generic content.

### Later Follow-Up

- Add pull-request enforcement and report publication.
- Schedule full-project health, trend, hotspot, flag, and suppression review.
- Audit actual dependency direction and configure trustworthy boundary zones.
- Feed reviewed maintenance opportunities into roadmap and task planning.

## Success Criteria

The integration is successful when:

- every TypeScript/JavaScript change gets a deterministic, version-pinned
  changed-scope Fallow result;
- abstract Quality Contract gates resolve to explicit bound/unbound status;
- configured findings reach agents as structured data with locations and
  actions;
- runtime errors cannot masquerade as passing gates;
- public and dynamically loaded APIs are traced before removal;
- workers receive feedback before final Quality Manager review;
- cross-task regressions are caught at wave integration;
- full-project debt is visible and trending without blocking unrelated work;
- architecture conformance becomes real enforcement rather than a zero from an
  empty rule set;
- Fallow remains one part of the larger correctness gate alongside tests,
  typechecking, linting, and review.
