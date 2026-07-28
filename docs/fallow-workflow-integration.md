# Integrating Fallow Into Cosmonauts Coding Workflows

This document recommends how Cosmonauts should use Fallow throughout the work
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

## Investigation Snapshot

The July 2026 investigation found a useful but incomplete integration.

### What Exists

- [`../fallow.toml`](../fallow.toml) identifies stable public entry points,
  runtime-loaded domain files, and production-only duplication analysis.
- `domains/shared/extensions/project-tools/index.ts` detects Fallow and injects
  `npx fallow audit` into an agent system prompt.
- `bundled/coding/prompts/quality-manager.md` asks the Verifier to execute a
  detected analysis tool on feature branches.
- The Quality Manager routes failed analysis findings through narrow remediation
  rather than editing code itself.
- Migration-shaped changes already require an early stale-reference/dead-code
  sweep.
- The coding domain ships a detailed Fallow skill that agents can load on
  demand.

### What Is Missing Or Misleading

- `project-tools` models an analysis tool as one description and one command. It
  does not expose supported gate kinds, configuration state, version, scope,
  output schema, or available investigations.
- The injected command uses mutable `npx fallow`; Fallow is not pinned in
  `package.json`.
- Agent execution does not require `--format json --quiet --explain`, so
  structured findings can be flattened into terminal prose.
- The Quality Manager skips the audit for working-tree reviews on the base
  branch, even though `fallow audit` can analyze that scope.
- Plans use abstract `complexity`, `duplication`, `boundary-conformance`, and
  `dead-code` gates, but the runtime exposes only a generic “codebase audit.”
- `fallow list --boundaries` reported `configured: false`. A zero boundary count
  therefore does not enforce the documented three-layer architecture.
- No repository CI workflow was found for Fallow.
- [`fallow-exceptions.md`](fallow-exceptions.md) calls `fallow audit` the full
  gate even though `audit` is change-scoped.
- A live changed-scope audit passed while a live full-project combined scan
  reported existing dead-code/API-surface candidates, clone groups, and
  complexity findings. That is expected evidence for a two-lane policy, not a
  contradiction in Fallow.

Re-run the analysis before implementation; these observations are a dated
snapshot, not a permanent statement of repository state.

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

Generic artifacts should continue naming abstract gate kinds. The concrete
mapping belongs in the detected-project-tools layer.

```text
plan Quality Contract
  └─ abstract gate kind
       └─ project-tools binding resolver
            └─ Fallow adapter
                 ├─ changed-scope audit
                 ├─ full-project analysis
                 ├─ health and trends
                 └─ trace and fix preview
                      └─ normalized findings
                           ├─ Verifier evidence
                           ├─ Quality Manager ledger
                           ├─ Fixer/worker remediation
                           └─ archive/memory summary
```

This preserves language-agnostic plans: another repository can bind the same
gate kind to a different tool or report it as unbound.

### Recommended Provider Contract

Replace the current single-command `AnalysisTool` shape with a typed provider
contract along these lines:

```ts
type AnalysisGateKind =
  | "dead-code"
  | "duplication"
  | "complexity"
  | "boundary-conformance";

interface AnalysisBinding {
  readonly gateKind: AnalysisGateKind;
  readonly configured: boolean;
  readonly enforcement: "blocking" | "advisory";
  readonly scopes: readonly ("changed" | "project")[];
}

interface AnalysisFinding {
  readonly id: string;
  readonly gateKind: AnalysisGateKind;
  readonly severity: "error" | "warn";
  readonly path?: string;
  readonly line?: number;
  readonly message: string;
  readonly actions: readonly AnalysisAction[];
}

interface AnalysisResult {
  readonly tool: "fallow";
  readonly version: string;
  readonly operation: "audit" | "full" | "health" | "trace" | "fix-preview";
  readonly scope: "changed" | "project";
  readonly base?: string;
  readonly verdict: "pass" | "warn" | "fail" | "error";
  readonly findings: readonly AnalysisFinding[];
}
```

The exact implementation may preserve Fallow's native JSON envelopes rather
than copying every field. The important properties are typed gate binding,
explicit scope, version/configuration evidence, and lossless findings.

### Pi-First Implementation Choice

The first implementation should extend the existing Pi `project-tools`
extension:

1. detect Fallow and the exact executable/version;
2. inspect the resolved configuration;
3. register a read-only analysis tool or provide normalized executable claims;
4. capture stdout, stderr, and exit status separately;
5. return structured JSON to the calling role.

Start with the Fallow CLI because it covers `audit`, feature flags, tracing,
configuration inspection, and operational commands. Consider
`@fallow-cli/fallow-node` later for high-frequency, long-lived read-only
analysis. The Node bindings do not replace the entire CLI surface.

Do not require an external MCP server for the first slice. Fallow MCP is a good
optional adapter for hosts that already support MCP and tool-level permissions.

## Workflow-Stage Integration

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

## Implementation Sequence

### Phase 0: Reproducible Truth

- Pin the current accepted Fallow version in `devDependencies`.
- Add package scripts for changed audit, full analysis, health, and flags.
- Make rule severities, thresholds, and `audit.gate = "new-only"` explicit.
- Correct the distinction between `audit` and full-project analysis in
  [`fallow-exceptions.md`](fallow-exceptions.md).
- Classify the current full-project findings before deleting or baselining them.

### Phase 1: Lossless Final Gate

- Expand `project-tools` from one command to typed gate bindings.
- Require JSON, quiet mode, and explanations.
- Detect Fallow version, resolved config, and boundary configuration.
- Run the audit for feature branches and dirty-base reviews.
- Normalize exit codes and preserve structured actions.
- Add prompt/extension tests for binding, scope, and error behavior.

### Phase 2: Earlier Feedback

- Give Planner and Plan Reviewer read-only project info, health, duplication,
  and trace operations.
- Preserve task-start base and applicable gate kinds in execution context.
- Add worker task-close audits and coordinator wave audits.
- Make migration sweeps an explicit task-completion claim.

### Phase 3: Architecture Enforcement

- Audit actual dependency direction.
- Introduce custom zones and advisory boundary findings.
- Resolve or document existing violations.
- Change boundary conformance to a blocking binding only after the model is
  trustworthy.

### Phase 4: Stewardship And Memory

- Save periodic health snapshots.
- Publish trend, hotspot, target, feature-flag, and suppression summaries.
- Feed reviewed cleanup opportunities into roadmap/task planning.
- Record meaningful quality deltas in archive/memory.

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

