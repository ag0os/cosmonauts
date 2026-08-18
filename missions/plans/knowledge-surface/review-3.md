# Plan Review: knowledge-surface

## Findings

- id: PR-001
  dimension: behavior-spec
  severity: medium
  title: "Revision defect: B-006 does not exercise the existing dedicated memory writer"
  plan_refs: plan.md:320-342, Design §1 (plan.md:449-457), Quality Contract assertion 5 (plan.md:832-837)
  code_refs: domains/shared/extensions/agent-memory/index.ts:184-251, domains/shared/extensions/agent-memory/index.ts:356-419, lib/memory/types.ts:12-23, lib/memory/types.ts:86-92
  description: |
    The revised title, context, Design §1, and Quality Contract assertion 5 say D-010 option B governs dedicated knowledge **and memory** tools through `MemoryStore`. B-006's action, however, runs only index injection, knowledge/agent-memory recall, and the proposal operation. Its write expectation then narrows to “every dedicated machine knowledge write” and says it “creates only a proposal.” That cannot cover the shipped `remember` memory tool: `remember` is a dedicated memory writer, calls `MemoryStore.write` for notes/profiles/playbooks, and correctly does not create knowledge proposals.

    The named executable seam is real—`createAgentMemoryExtension` already accepts an injected store factory—but the behavior does not require the spy to exercise `remember`. A worker can satisfy B-006 while omitting one of the dedicated memory tools that assertion 5 claims is proved; alternatively, applying “creates only a proposal” to `remember` would break existing authored-memory behavior. This is a defect in the constrained D-010 revision. Make B-006 distinguish ordinary dedicated memory writes (`remember` → `MemoryStore.write`) from machine knowledge writes (proposal operation → `MemoryStore.write` and proposals only).

- id: PR-002
  dimension: lifecycle-invariant
  severity: medium
  title: "Revision defect: B-008 still freezes unqualified OFF results and filesystem effects"
  plan_refs: B-008 (plan.md:359-376), B-009 (plan.md:378-395), Design §1 (plan.md:444-457), Quality Contract assertion 3 (plan.md:824-831)
  code_refs: bundled/coding/agents/distiller.ts:3-10, bundled/coding/prompts/distiller.md:1-5, bundled/coding/prompts/distiller.md:136-160, lib/orchestration/definition-resolution.ts:17-27
  description: |
    Design §1 and Quality Contract assertion 3 correctly limit identity to effects of the **gated** surface. B-008's expected result does not: after “gated extension discovery,” it requires unqualified “visible results” and “filesystem effects” to equal the baseline, while only prompt bytes receive the D-009 correction exception. B-008 also runs an OFF distiller turn. The current distiller has coding tools (`read`, `bash`, `edit`, `write`) and is instructed to write JSONL; B-009 unconditionally changes that active instruction to OKF proposals. An OFF distiller following the corrected persona can therefore produce different visible output and files through trusted generic tools, even though no gated adapter is active.

    Read literally, B-008 conflicts with unconditional B-009 and exceeds the amended AC-007; read as Design §1 intends, “visible results/filesystem effects” means only effects attributable to the gated adapters. Because workers author tests from the behavior spine, that qualification cannot live only in Design/Quality prose. This is a defect in the constrained D-009 revision. Limit B-008's equality assertion explicitly to gated-surface results/effects while keeping the exact distiller/archive/project-context/doc correction allowlist (including `AGENTS.md`) for prompt deltas. This correction implements, rather than changes, the human-amended AC-007.

## Missing Coverage

- **Pre-existing and out of scope for this constrained revision:** `review-2.md` PR-001 (the `ExtensionAPI`-keyed WeakMap contradicts Pi's per-extension API identity and does not provide a working three-section handoff) remains unchanged.
- **Pre-existing and out of scope:** `review-2.md` PR-002 through PR-006 remain unresolved: enabled package-host coverage, migration-key collisions, reload/reassembly semantics, an executable backfill failure/approval owner, and archived transcript discovery. They were not introduced by applying D-009/D-010 and should not be silently treated as cleared by the new readiness sentence.
- The current artifact directly shows `createdAt: '2026-08-18T20:03:19.945Z'` and a complete D-001 through D-014 Decision Log. Exact byte-for-byte comparison of `createdAt`, those decisions, and all unrelated plan text against the immediate pre-revision artifact is **unchecked**: `analysis_audit({ base: "HEAD" })` returned `unbound` with `execution-not-consented`, and no separate pre-revision snapshot is available through the read-only artifact interface. Prior reviews attest that `createdAt` was preserved, but they do not contain the full prior Decision Log for a verbatim comparison.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared the revised B-006/Quality Contract boundary against the existing `MemoryStore` contract and the shipped agent-memory `remember`/`recall` tool paths.
  findings: PR-001
- dimension: duplication
  status: unchecked
  checked: `analysis_duplication` returned unbound with `execution-not-consented` for provider `fallow`; this constrained wording review did not establish project-wide duplication evidence.
  findings: none
- dimension: state-sync
  status: checked
  checked: Checked the revised OFF/gated partition and trust-boundary wording against live-session and distiller state transitions; pre-existing WeakMap and reload defects remain recorded in `review-2.md`.
  findings: PR-002
- dimension: risk-blast-radius
  status: checked
  checked: Traced D-009 through OFF distiller turns and D-010 through dedicated agent-memory/proposal paths plus generic coding-tool access.
  findings: PR-001, PR-002
- dimension: user-experience
  status: checked
  checked: Walked OFF ordinary, distiller, and package-host behavior and enabled dedicated-tool behavior, including what users can observe or write through corrected prompts and generic tools.
  findings: PR-002
- dimension: behavior-spec
  status: checked
  checked: Reviewed B-003, B-006, B-008, and B-009 against amended AC-002/AC-003/AC-005/AC-006/AC-007, their named seams, and direct test authorability.
  findings: PR-001, PR-002
- dimension: architecture-record
  status: unchecked
  checked: Manually read the relevant `knowledge-and-memory.md` and `code-structure-map.md` rulings, but `analysis_boundaries` returned unbound with `execution-not-consented`; project-wide boundary conformance was not established.
  findings: none
- dimension: quality-contract
  status: checked
  checked: Compared plan-specific assertions 3 and 5 and the ordered gate ladder against the revised B-008 and B-006 mechanisms.
  findings: PR-001, PR-002
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked unconditional distiller correction, OFF identity, generic-tool trust, dedicated write exits, and the correction allowlist.
  findings: PR-002
- dimension: constraint-ownership
  status: unchecked
  checked: Traced D-009/D-010 into readiness, Design §1, Files to Change, R-001/R-002, assertions 3/5, and Precondition 0. Exact “change nothing else” comparison is unavailable because changed-scope audit is unbound; current `createdAt` and D-001..D-014 presence were read directly.
  findings: PR-001, PR-002
- dimension: scope-size
  status: checked
  checked: The plan remains at 12 behaviors and retains the same eight candidate task slices; no new behavior or task was added by the ruling revision.
  findings: none

## Assessment

The constrained revision applies most of both human rulings, including the documented generic/external trust boundary, AGENTS.md allowlist, unconditional B-003/B-009 direction, and the requested readiness/design/files/risks/quality/precondition updates. It is not exact yet: first qualify B-008's result/filesystem identity as gated-surface-only, then make B-006 explicitly prove the existing dedicated `remember` writer without treating it as proposal-only. Pre-existing `review-2.md` findings remain separate and unresolved.
