# Integrating Fallow Into Consumer Workflows

Fallow backs Cosmonauts' analysis capability runtime. A consumer owns the workflow and decides how findings affect its plan, task, review and archive artifacts. The library supplies no coding roles or workflow skills.

The core recommendation is to treat Fallow as both:

1. a **change-regression gate** that prevents newly introduced structural debt;
2. a **codebase-stewardship sensor** that makes existing debt and trends visible.

Using only the first lets historical debt accumulate out of sight. Using only the second produces reports without enforcement.

For adapter behavior and limitations, see [fallow.md](fallow.md). For this repository's intentional exceptions and three-floor audit command, see [fallow-exceptions.md](fallow-exceptions.md).

## Runtime binding

The provider-neutral core at `lib/analysis/index.ts` exports capability vocabulary, requests, bindings, results, failures and the pure resolver. The `project-tools` extension at `lib/extensions/project-tools/index.ts` owns detection, consent-gated introspection, execution, normalization, session snapshotting, status injection and tool registration. Consumers select the extension; naming a capability in prose does not register a tool.

Optional `analysis.provider` in project config selects a provider; absence allows detection. Bindings are bound, unbound or failed. Requests also report unsupported scope, metric or target. Results preserve native evidence; process failure is distinct from findings. The [analysis capability reference](analysis-capabilities.md) defines those contracts.

The CLI transport is the implemented provider edge. A second provider must implement the contract; no shipped second adapter is implied by the cross-tool validation record.

## Change regression

At task start, preserve the source commit or task base. Run changed-scope audit from that explicit base after behavior tests pass. The Fallow adapter also requires its three baseline files ([fallow.md](fallow.md)). Keep the full structured result and its actions. Block introduced issues according to the consumer's policy, distinguish findings from runtime failures, and re-run after remediation changes code.

The four gate-facing kinds are dead code, duplication, complexity and boundary conformance. A boundary binding is unbound until the provider has configured zones and rules. Do not call unconfigured boundaries passing. Audit coverage does not substitute for a dedicated boundary request when evidence does not declare that category.

## Codebase stewardship

Full-project analysis is a separate advisory view of absolute state and trends. Persist summaries and snapshots, rank work by evidence, impact, confidence and effort, and create bounded maintenance tasks after judgment. Historical debt should not silently become a new failure on unrelated changes.

## Investigation and verification

- Inspect entry points and configured boundaries before choosing an analysis scope.
- Trace exports, files and dependencies before deletion or extraction. Capability trace supports only the target forms the binding advertises.
- For duplicate residue, request the owned paths and report each surviving group or an explicit empty result. A failed or unavailable run cannot prove absence.
- Preserve capability, scope, explicit base, provider identity and complete evidence with a decision. Avoid copying thousands of raw findings into durable memory.

Fallow does not replace behavior tests, type checking, linting or human review. Workflow policy belongs to the consumer; the library does not schedule stewardship or automatically turn every finding into a task.

## Quality-Gate Policy

A consumer can bind Fallow to four existing abstract gate kinds.

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

## Baselines, Exceptions, And Ratchets

The following is generic baseline guidance. The current Cosmonauts Fallow adapter always requires `.fallow-baselines/dead-code.json`, `.fallow-baselines/health.json` and `.fallow-baselines/dupes.json` in the target project; a missing or unreadable file fails changed-scope audit. Optional-baseline guidance does not change that implemented requirement. See [Fallow](fallow.md).

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
4. record its reason with the exception;
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
