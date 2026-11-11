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

At task start, preserve the source commit or task base. Run changed-scope audit from that explicit base after behavior tests pass. Keep the full structured result and its actions. Block introduced issues according to the consumer's policy, distinguish findings from runtime failures, and re-run after remediation changes code.

The four gate-facing kinds are dead code, duplication, complexity and boundary conformance. A boundary binding is unbound until the provider has configured zones and rules. Do not call unconfigured boundaries passing. Audit coverage does not substitute for a dedicated boundary request when evidence does not declare that category.

## Codebase stewardship

Full-project analysis is a separate advisory view of absolute state and trends. Persist summaries and snapshots, rank work by evidence, impact, confidence and effort, and create bounded maintenance tasks after judgment. Historical debt should not silently become a new failure on unrelated changes.

## Investigation and verification

- Inspect entry points and configured boundaries before choosing an analysis scope.
- Trace exports, files and dependencies before deletion or extraction. Capability trace supports only the target forms the binding advertises.
- For duplicate residue, request the owned paths and report each surviving group or an explicit empty result. A failed or unavailable run cannot prove absence.
- Preserve capability, scope, explicit base, provider identity and complete evidence with a decision. Avoid copying thousands of raw findings into durable memory.
- Keep health scores and candidate clones advisory unless the work declares a concrete risk and measurable expectation.

Fallow does not replace behavior tests, type checking, linting or human review. Workflow policy belongs to the consumer; the library does not schedule stewardship or automatically turn every finding into a task.
