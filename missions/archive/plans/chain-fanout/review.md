# Plan Review: chain-fanout

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "CLI raw-chain dispatch rejects valid single-step parallel expressions"
  plan_refs: plan.md:15-20, plan.md:148, spec.md:6-9
  code_refs: cli/main.ts:121-123, cli/main.ts:351-358
  description: |
    The spec expands the DSL grammar from `chain = step ("->" step)*` so a chain may be a single `step`, including `fanout` (`role[n]`) or a bracket group (`[a, b]`) without any arrows. The plan also says `cli/main.ts` will be updated for the new syntax.

    The current CLI does not attempt to parse raw DSL directly. It classifies `--workflow` input as raw chain DSL only when the string contains `"->"` (`const isChainDsl = options.workflow.includes("->")`). A valid expression like `reviewer[2]` or `[planner, reviewer]` would therefore be routed into `resolveWorkflow()` as a workflow name instead of `parseChain()`, and fail before reaching the new parser. The plan does not call out this dispatch boundary even though it makes part of the proposed grammar unusable from the CLI. This needs to be addressed explicitly in the design and tests.

- id: PR-002
  dimension: risk-blast-radius
  severity: high
  title: "Abort semantics are specified for parallel steps, but the chain_run tool drops the abort signal"
  plan_refs: plan.md:39-40, plan.md:145, plan.md:152, plan.md:177-181, spec.md:70-75
  code_refs: domains/shared/extensions/orchestration/chain-tool.ts:80-120
  description: |
    The spec and quality contract require defined abort behavior while a parallel step is running: already-started members are awaited, and later steps do not start after abort. That contract is only meaningful at call sites that actually pass an `AbortSignal` into `runChain()`.

    The primary tool entry point currently receives `_signal` from Pi but ignores it, then calls `runChain()` without a `signal` field. So `chain_run` invocations in the TUI/extension path cannot exercise or benefit from the abort semantics the plan describes. The plan lists `chain-tool.ts` only for `ChainStep[]` consumption and summary updates, and QC-003 verifies only `tests/orchestration/chain-runner.test.ts`; that leaves the real tool path out of scope. Either the plan must include signal propagation through `chain-tool.ts` (and corresponding tests), or it must narrow the abort claims.

- id: PR-003
  dimension: user-experience
  severity: medium
  title: "Documentation coverage omits active chain instructions outside README and cli/main.ts"
  plan_refs: plan.md:20, plan.md:148-150, plan.md:189-192
  code_refs: README.md:112-115, AGENTS.md:76, AGENTS.md:100-103, docs/architecture/approach.md:155, docs/architecture/approach.md:194, domains/shared/capabilities/spawning.md:9, domains/shared/capabilities/spawning.md:57, domains/shared/capabilities/spawning.md:82
  description: |
    The plan says the feature will be documented in user-facing help/docs and QC-005 treats CLI help text and README examples as the relevant integration surface. The current repo has additional live documentation that users and agents rely on for chain invocation and examples.

    Those files already contain chain guidance that is stale today (`--chain` examples in `README.md`, `AGENTS.md`, and `docs/architecture/approach.md`) or teach the chain DSL through the spawning capability docs. If the implementation updates only `cli/main.ts`, `README.md`, and the topology sentence in `docs/architecture/approach.md`, the repo will still present contradictory instructions about how to invoke chains and what syntax is supported. The plan needs to either include these docs explicitly or justify why they are intentionally left stale.

## Missing Coverage

- `chain_run` cancellation/integration tests are missing even though the spec defines abort behavior for parallel steps; only runner-level verification is listed.
- The review does not cover CLI parsing/tests for single-step fan-out or single-step bracket groups, which are valid per `spec.md:6-9` but currently bypass `parseChain()` in `cli/main.ts:353-357`.
- Agent-facing documentation (`AGENTS.md`, `domains/shared/capabilities/spawning.md`) is not included in the docs update scope even though both teach chain usage.

## Assessment

The plan is viable with revisions. Fix the CLI dispatch gap first: as written, part of the advertised DSL grammar (`reviewer[2]`, `[a, b]`) cannot be invoked from the CLI at all.