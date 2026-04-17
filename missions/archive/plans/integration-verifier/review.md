# Plan Review: integration-verifier

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "The proposed integration-report contract does not actually match the existing reviewer report format"
  plan_refs: missions/plans/integration-verifier/plan.md:58-84, missions/plans/integration-verifier/plan.md:124-125, missions/plans/integration-verifier/plan.md:161-164
  code_refs: bundled/coding/coding/prompts/reviewer.md:87-123, bundled/coding/coding/prompts/quality-manager.md:61-82, bundled/coding/coding/prompts/quality-manager.md:88-103
  description: |
    The plan says the new report should stay "intentionally close to the existing reviewer report" so `quality-manager` can reuse the same routing path, but the proposed contract changes several concrete fields that the current reviewer report format standardizes. The existing reviewer report is an exact markdown document with `# Review Report`, top-level `overall: <correct|incorrect>`, a `## Findings` section, and per-finding entries that always contain a nested `task:` block with `title`, `labels`, and `acceptanceCriteria`; reviewer priority also allows `P0|P1|P2|P3`.

    The proposed `IntegrationFinding` narrows priority to `P1|P2|P3`, changes `task` to `{...} | "-"`, and only defines a TypeScript interface rather than the on-disk markdown shape that `quality-manager` will actually read. That means two workers can both "follow the plan" and still produce incompatible artifacts: one can write a reviewer-like markdown report, while another can implement quality-manager logic against the TS interface or against a different textual layout. The planner should make the file-level wire format explicit and keep the fields identical where reuse is claimed.

- id: PR-002
  dimension: state-sync
  severity: high
  title: "Remediation tasks are not required to carry the originating `plan:<slug>` label"
  plan_refs: missions/plans/integration-verifier/plan.md:89-103, missions/plans/integration-verifier/plan.md:133-135, missions/plans/integration-verifier/plan.md:183-186
  code_refs: domains/shared/extensions/tasks/index.ts:19-60, bundled/coding/coding/prompts/quality-manager.md:92-109, bundled/coding/coding/prompts/quality-manager.md:121-129
  description: |
    The plan's operational contract says both `integration-verifier` and `quality-manager` derive `activePlanSlug` from a unique `plan:<slug>` label in the current tasks, and then uses that slug for report placement and final plan completion. But the remediation path it builds on today creates review-fix tasks with labels like `review-fix` and `review-round:1` only; there is no requirement in the plan to also pass the task tool's `plan` parameter or otherwise preserve the originating plan label.

    The task tool already has an explicit `plan` field that auto-injects `plan:<slug>` (`domains/shared/extensions/tasks/index.ts:47-59`). If remediation tasks omit that field, the workflow now carries plan identity in one place (the original implementation tasks) while the new review-fix tasks carry a different state set. That can make later `task_list` scans ambiguous or force `integration-verifier` to skip, and it means `plan_edit` completion/archive logic continues to ignore the remediation tasks. The planner should close this state boundary explicitly instead of relying on older tasks to keep the plan discoverable.

- id: PR-003
  dimension: risk-blast-radius
  severity: medium
  title: "The rerun requirement is scoped too narrowly for how quality-manager actually mutates code"
  plan_refs: missions/plans/integration-verifier/plan.md:95-103, missions/plans/integration-verifier/plan.md:153-156, missions/plans/integration-verifier/plan.md:183-186
  code_refs: bundled/coding/coding/prompts/quality-manager.md:84-117
  description: |
    The design section says `integration-verifier` should rerun "after any remediation", but the risk section and QC-005 narrow that to remediation "triggered by integration findings". That is not the full blast radius of the existing quality loop. `quality-manager` already sends ordinary verifier failures and reviewer findings through `fixer` or task-based `coordinator` runs, and those edits can invalidate plan contracts just as easily as an integration-specific finding can.

    If the implementation follows the narrower wording in the risk/QC sections, the final merge decision can still rely on a stale `integration-report.md` after a normal reviewer fix or a failed-check remediation changed the code. The planner should reconcile these sections so the rerun trigger covers every code-modifying remediation path, not only the ones that originated from integration findings.

- id: PR-004
  dimension: interface-fidelity
  severity: low
  title: "The plan overstates `.cosmonauts/config.example.json` as part of the scaffold override seam"
  plan_refs: missions/plans/integration-verifier/plan.md:40, missions/plans/integration-verifier/plan.md:108, missions/plans/integration-verifier/plan.md:137, missions/plans/integration-verifier/plan.md:154
  code_refs: lib/config/defaults.ts:3-23, lib/config/loader.ts:101-124, .cosmonauts/config.example.json:1-17
  description: |
    The plan claims both `lib/config/defaults.ts` and `.cosmonauts/config.example.json` must change or freshly scaffolded projects will override the updated domain workflow back to the old chain. The actual scaffold path does not read the example file: `scaffoldProjectConfig()` serializes `createDefaultProjectConfig()` directly into `.cosmonauts/config.json`.

    Updating `.cosmonauts/config.example.json` is still useful as documentation, but it is not part of the runtime/scaffold interface that causes the override behavior described in the plan. The planner should tighten this claim so workers know which file is required for correctness and which file is only for examples/docs.

## Missing Coverage

- The plan does not define the exact markdown envelope for `missions/plans/<slug>/integration-report.md` (`#` heading, section names, no-findings form, skipped rationale block), even though the existing routing pattern is file-based rather than typed-object-based.
- The plan does not define a finding ID namespace for integration findings. Reviewer reports already standardize on `F-001`-style IDs, so the new report needs an explicit non-colliding convention if both reports are present in one quality round.
- The plan does not address multi-plan repositories where `task_list` can surface several different `plan:*` labels and no workflow stage currently injects a scoped `planSlug` into post-implementation stages.

## Assessment

The plan is viable with revisions, not a redesign. The first thing to fix is the integration-report wire contract plus plan-label propagation, because those are the boundaries `quality-manager` and `integration-verifier` must share to interoperate at all.
