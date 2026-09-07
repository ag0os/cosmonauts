# Plan Review: living-memory-fidelity

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: medium
  title: "The shared render input does not make retrieval scope, query, or admission inseparable"
  plan_refs: Decision Log D-001, Design §1, Quality Contract assertions 1-2
  code_refs: lib/memory/types.ts:13-17, lib/memory/types.ts:42-48, lib/extensions/knowledge-surface/combined-context.ts:56-65, lib/memory/consolidation-sources.ts:166-189
  description: |
    D-001 says the proposed `KnowledgeIndexRenderInput` makes the record set, query, admission, renderer fields, and warnings inseparable. Its declared shape contains only `records` and `warnings`, however. In the existing API, scopes live in a separate `MemoryScopeContext` from `MemoryQuery`, and admission options are a third argument available only on the concrete knowledge store. Injection currently supplies its scope/query at `combined-context.ts:56-65`, while consolidation independently supplies scope, query, and byte-admission options at `consolidation-sources.ts:166-189`.

    Requiring one renderer argument will prevent the current warnings-free policy call, but it does not prevent either producer from changing scopes, query fields, or bounded-inventory projection while still producing a well-typed render input. The two known divergence fixtures can therefore pass while the next producer-side change reintroduces drift. The planner should revise the derived D-001 contract or its enforcement so the full retrieval descriptor/admission-to-render projection is shared or mechanically checked; weakening ratified spec INV-001 or AC-001 is not an available fix.

- id: PR-002
  dimension: constraint-ownership
  severity: high
  title: "Stage 0 creates a test that cannot pass until Stage 4, blocking the intervening hard gates"
  plan_refs: B-009, B-011, Implementation Order Stage 0 step 3, Stage 1 steps 4-8, Stage 4 step 17, Quality Contract gates 1-2
  code_refs: package.json:24-36, tests/memory/interface.test.ts:952-953, tests/memory/interface.test.ts:1114-1128
  description: |
    Stage 0 requires adding B-009's executable ownership contract, whose expected result requires every B-001..B-011 fidelity regression marker to be present on its named test. Stages 1-3 add only B-001..B-008; B-010 and completion of B-009/B-011 are explicitly deferred to Stage 4. The referenced file is an ordinary Vitest suite, and `bun run test` runs the project suite; there is no staged or pending-test mechanism in the plan.

    Consequently, implementing B-009 as specified in Stage 0 leaves the suite red at the Stage-1 full-project hard gate and prevents the mandatory Stage-1 review handoff. Adding placeholder marker comments would violate the behavior-spine requirement that markers belong to executable named tests. B-011 has the same partial-ownership ambiguity because Stage 0 adds its future result/pin expectations while Stage 4 says to complete it. The implementation order must assign these contracts to a stage where their full expected outcomes are satisfiable, or explicitly define a green intermediate contract that does not pretend the behaviors are complete.

- id: PR-003
  dimension: behavior-spec
  severity: medium
  title: "The OR-only commit invariant has an uncovered durable receipt transition"
  plan_refs: Decision Log D-004, Design §3, B-007, B-008, Quality Contract assertion 4, Implementation Order Stage 3
  code_refs: lib/memory/consolidation-receipts.ts:218-239, lib/memory/living-memory.ts:763-822, tests/memory/living-memory.test.ts:3030-3084
  description: |
    D-004 and Design §3 explicitly include accepted receipts in the monotonic `writesCommitted` accumulator, but B-007 covers only receipt removal and B-008 covers only source recovery. The current `markMaterialized()` path durably replaces an `accepted` receipt with `materialized`, while final result assembly does not include whether that transition wrote: it ORs receipt creation, newly written proposals, episode prunes, and retirement writes. A retry with an existing accepted receipt, an already-existing proposal, and no episode or retirement write can therefore commit the receipt transition and still report `writesCommitted: false`.

    The parent B-016 retry test contains an existing-proposal/materialization path, but its fixture also applies a retirement and does not isolate or assert the materialization-only committed bit. An instruction to “audit every assignment” is not executable behavior ownership and a realistic mutation can survive B-007/B-008. The planner should give this D-004 promise a named counterexample test under the existing B-012 truthfulness scope. This closes ratified fidelity INV-003 rather than adding a new product behavior.

- id: PR-004
  dimension: quality-contract
  severity: medium
  title: "The mandatory live-tree hash gate has a value but no reproducible binding"
  plan_refs: Quality Contract assertion 6 and correctness gate, Implementation Order Stage 0 step 1, Stage 4 step 19
  code_refs: package.json:24-36
  description: |
    The plan makes the 237-file tree hash a hard stop before and after every task, but it never defines how the tree digest is calculated: file ordering, inclusion of relative paths, byte framing, and treatment of `knowledge/index.md` are all unspecified. `package.json` exposes the project test/lint/typecheck bindings but no corpus-hash binding. A bare expected SHA-256 is not enough to reproduce a tree hash because several deterministic algorithms over the same files produce different values.

    As written, a worker must invent the calculation even though Stage 0 explicitly says not to invent a replacement and the correctness rung is marked `bound`. Record the exact read-only calculation or name an existing executable evidence seam before treating this as a bound hard gate. Clarifying the procedure does not change the ratified AC-010 hash/count requirement.

## Missing Coverage

- No named behavior combines a successful source recovery (`episodePrunes` plus `writesCommitted: true`) with the new incomplete-inventory failure return, even though Design §3 explicitly promises that this new Stage-2 early exit preserves both fields.
- The live 237-file count/hash and the final repository-root CLI comparison were not executed during this read-only review; their empirical baseline remains implementation-time evidence rather than verified review evidence.
- Structural duplication, boundary, dead-code, and symbol-trace providers returned `unbound` with reason `execution-not-consented`, so no provider verdict exists for those dimensions.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared the proposed render/pressure/source/result contracts with `MemoryScopeContext`, `MemoryQuery`, both retrieval call sites, the pressure policy, the collector, the consolidator, receipt discharge, and CLI composition.
  findings: PR-001

- dimension: duplication
  status: unchecked
  checked: The named renderer and projection paths were read manually, but the duplication capability returned `unbound` (`execution-not-consented`, provider `fallow`), so no structural duplication verdict is available.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced recovery, receipt discharge/materialization, details reconstruction, no-work returns, and committed-error propagation.
  findings: PR-003

- dimension: risk-blast-radius
  status: checked
  checked: Walked incomplete inventory, unusable pressure, dry-run CLI, receipt removal failure, source recovery, parent convergence, and retirement authorization paths.
  findings: PR-001, PR-003

- dimension: user-experience
  status: checked
  checked: Checked JSON/public result reporting, explicit incomplete/unusable outcomes, dry-run behavior, exit-code composition, and owner-visible committed-write reporting.
  findings: none

- dimension: behavior-spec
  status: checked
  checked: Mapped AC-001..AC-011 to B-001..B-011, verified every behavior has a source/seam/named test/marker, and compared negative coverage with the designed paths. Every AC is owned and no behavior lacks a spec source.
  findings: PR-003

- dimension: architecture-record
  status: unchecked
  checked: Read both declared architecture records and manually compared their inward dependency rules, but boundary-conformance and trace capabilities returned `unbound` (`execution-not-consented`), so architecture conformance has no capability-backed verdict.
  findings: none

- dimension: quality-contract
  status: checked
  checked: Reviewed the ordered gate ladder, binding states/degradations, project scripts, stage gates, corpus guards, and final CLI evidence requirements.
  findings: PR-002, PR-004

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked per-pass completeness/unusable states, receipt transitions, source recovery, no-work classification, and every named committed-write exit.
  findings: PR-003

- dimension: constraint-ownership
  status: checked
  checked: Traced D-026, live-retirement prohibition, allowed directories, parent marker/name ownership, stage review obligations, Files to Change, and stage-to-behavior ownership.
  findings: PR-002

- dimension: scope-size
  status: checked
  checked: The plan has 11 behaviors, stays within the 12-behavior guidance, and names only the permitted production directories and mirrored tests.
  findings: none

## Assessment

The plan is viable with revisions: all AC-001..AC-011 mappings are present, the parent marker/name pairs match the codebase, and the D-026/scope/retirement prohibitions are preserved. Fix the unsatisfiable Stage-0 ownership ordering first; then strengthen D-001's producer-side coupling and give the full monotonic-write claim executable counterexamples before task creation.
