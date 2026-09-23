# Plan Review: qm-chain-safety

## Findings

- id: PR-001
  dimension: constraint-ownership
  severity: high
  title: "The clone design silently replaces the human-decided detached-worktree mechanism"
  plan_refs: D-001 item 3, D-004, D-015, Design §2, R-002
  code_refs: missions/plans/qm-chain-safety/spec.md:246-250, lib/durable-runtime/types.ts:35-39
  description: |
    Human-decided D-001 requires “isolation is a detached worktree now,” and D-015 explicitly preserves that decision as ratified ground. D-004 instead rejects a linked Git worktree and selects a no-hardlink local clone. The clone may be a safer answer to review-1 PR-001, but a reviewer finding does not authorize replacing a human-decided mechanism; D-004 has no `Supersedes:` link and is only planner-proposed.

    This is a ratified-ground deviation, not an implementation detail. The planner must halt and obtain a human amendment to D-001 item 3 before tasks can build the clone design (or restore a design that actually uses the decided detached worktree).

- id: PR-002
  dimension: interface-fidelity
  severity: high
  title: "The private clone has no dependency tree with which to run the promised checks"
  plan_refs: D-004, D-012, B-006, Design §1, Design §2 steps 2-4, Design §6, R-017
  code_refs: .gitignore:1, package.json:31-43, lib/config/defaults.ts:1-20
  description: |
    D-004 copies tracked files and non-ignored untracked files into an independent OS-temp clone, forbids a mount/link back to the source, and removes the origin. In this repository `node_modules/` is ignored, while the promised test, lint, and typecheck commands resolve Vitest, Biome, and TypeScript from that dependency tree. The same is true for ordinary user projects. A fresh clone made exactly as designed therefore cannot execute B-006's project checks.

    The plan needs an explicit, safe dependency-materialization contract (including install-script/network policy and failure behavior) or an allowed read-only dependency source. Without one, the core assessment fails before any reviewer runs.

- id: PR-003
  dimension: interface-fidelity
  severity: high
  title: "Analysis capabilities become unbound when moved to the temporary clone"
  plan_refs: D-004, D-008, B-007, Design §6 step 2, Design §7, R-010
  code_refs: domains/shared/extensions/project-tools/fallow-provider.ts:327-382, domains/shared/extensions/project-tools/fallow-provider.ts:1465-1544, domains/shared/extensions/project-tools/analysis-consent.ts:52-107
  description: |
    The Fallow adapter resolves its executable from `<projectRoot>/node_modules`, which the clone does not contain. Even if the host injects the executable, analysis execution consent is intentionally keyed by the target's canonical real path; consent for the operator checkout does not authorize a newly created temp-clone path. `discoverFallowProvider()` will therefore report `provider-not-installed` or `execution-not-consented`, not the bound changed-scope capability B-007 requires.

    The plan changes `fallow-provider.ts` but not the consent boundary and defines no trusted mapping from an authorized source checkout to its verified snapshot. This needs an explicit authorization/executable design that preserves the user-owned consent invariant; silently copying or inventing consent would contradict the existing security contract.

- id: PR-004
  dimension: lifecycle-invariant
  severity: high
  title: "An unclassified QM alias is refused only after unsafe project modules have executed"
  plan_refs: D-003, B-002, Design §2 custom-alias bullet, R-004
  code_refs: cli/run/subcommand.ts:59-133, cli/runtime-bootstrap.ts:119-130, lib/runtime.ts:123-140, lib/domains/loader.ts:99-139
  description: |
    The revised plan safely recognizes the canonical QM and known built-in chains from data, but it says a custom alias discovered only after unsafe bootstrap is then refused. Current chain dispatch constructs `CosmonautsRuntime` before resolving the requested chain; runtime creation dynamically imports every active `domain.ts`, agent module, and `chains.ts`. A project-controlled alias can therefore execute arbitrary module side effects in the operator checkout before the refusal is reached.

    Refusing the agent launch after those imports does not satisfy ratified INV-001's construction guarantee. Unclassified requests need a pre-import resolution strategy or a pre-import refusal/isolated classification path; weakening INV-001 would require a human decision.

- id: PR-005
  dimension: quality-contract
  severity: high
  title: "A reviewed change can modify or remove the gate that is supposed to reject its suppression"
  plan_refs: D-008, D-009, B-007, B-008, Design §§7-8, Files to Change suppression and config entries
  code_refs: lib/config/loader.ts:63-188, lib/agents/session-assembly.ts:154-188, domains/shared/extensions/project-tools/fallow-provider.ts:1984-2024, package.json:31-43
  description: |
    D-009 makes the exception registry base-owned, but the enforcement code and its invocation remain working-tree-owned: the proposed `scripts/check-new-suppressions.ts`, `lib/quality/suppression-policy.ts`, package script/configured check list, and the changed-scope adapter are all files in the change being reviewed. The existing session assembly resolves extension code from the active project/domain roots, and project config and package scripts are read from the target tree. A diff can therefore add a suppression while changing the checker to ignore it, removing the configured check, or weakening the adapter that supplies baseline-aware evidence.

    That directly violates ratified INV-005's “cannot be silenced” promise. Base-owning only the registry is insufficient; the plan must define a trusted or base-pinned enforcement path and cover tampering with the checker/config/adapter itself.

- id: PR-006
  dimension: behavior-spec
  severity: medium
  title: "Read-only panel agents have no contract for seeing the change they must review"
  plan_refs: D-012, B-003, B-005, B-006, Design §1 effective profile, Design §6
  code_refs: lib/orchestration/definition-resolution.ts:21-30, bundled/coding/agents/reviewer.ts:3-18, bundled/coding/prompts/reviewer.md:54-71
  description: |
    The current reviewer determines scope with `git diff`, `git diff --cached`, and `git ls-files`. D-012 correctly removes `bash`, while the general reviewer has no extension tool and the profile leaves only read/grep/find/ls. Staging the captured change in the private index does not expose that diff through any of those tools, and the proposed quality context contains no immutable patch, changed-file manifest, base identity, or narrow host-owned diff reader.

    Implemented literally, the panel cannot distinguish introduced code from the base and cannot follow its own introduced-only review rules, so AC-016's preserved panel review is fragile. Define the host-to-reviewer change-scope contract rather than leaving each worker to invent one.

- id: PR-007
  dimension: architecture-record
  severity: medium
  title: "Framework security policy is assigned to the coding package that is being externalized"
  plan_refs: D-003, Files to Change `bundled/coding/review-launch-policy.json`, Design §2
  code_refs: bundled/coding/chains.ts:3-38, lib/chains/loader.ts:61-88, README.md:15-27, missions/plans/coding-extraction/plan.md:31-45, package.json:19-29
  description: |
    D-003 calls the pre-bootstrap policy framework-owned, but the file owner is `bundled/coding/`. The repository's active extraction plan removes `bundled/` and makes coding install-on-demand, and the README already describes coding as a domain slated for extraction. After that cutover this authority either disappears from the framework or becomes data supplied by an independently installable domain—the opposite of a trusted framework boundary.

    The JSON also duplicates the list/topology facts currently owned by `bundled/coding/chains.ts`, while project config may override those names. The plan needs a stable framework owner and an explicit one-source synchronization contract before independent workers implement preflight against a second chain registry. Mechanical boundary conformance is unavailable, so this finding is based on the inspected package/runtime ownership paths.

- id: PR-008
  dimension: user-experience
  severity: medium
  title: "Existing projects have no defined outcome when the new qualityReview check list is absent"
  plan_refs: B-006, D-012, Design §1 `QualityReviewCheck`, Design §6 `QualityReviewModelConfig`, R-017
  code_refs: lib/config/defaults.ts:1-20, lib/config/loader.ts:63-188, .cosmonauts/config.json:1-26, bundled/coding/prompts/quality-manager.md:135-171
  description: |
    The current QM discovers project-native checks from project artifacts. The replacement makes checks an explicit `qualityReview.checks` array, but project config defaults to `{}`, missing config returns `{}`, and existing projects have no such block. The plan configures this repository only; it never says whether another upgraded project with no list discovers checks, refuses with setup guidance, or silently runs none.

    Silent emptiness violates B-006/AC-016, while an unexplained refusal regresses the existing invocation flow. The observable missing/empty-config behavior and migration path must be specified before task decomposition.

- id: PR-009
  dimension: behavior-spec
  severity: low
  title: "The plan restores the human-deleted Seam field in every behavior"
  plan_refs: D-014, B-001 through B-012
  code_refs: missions/plans/framework-health/plan.md:94-104, domains/shared/skills/work-artifacts/references/plan-format.md:45-68, domains/shared/skills/work-artifacts/references/behavior-spine.md:14-42
  description: |
    Framework-health D-001 is human-decided ground that removes `Seam`, `Test`, and `Marker` outright. D-014 is planner-proposed but explicitly retains a “conceptual seam,” and every behavior carries a `Seam:` field. The current canonical behavior shape is Source, Observer, Entry point, and Outcome; internal structure belongs in Design.

    Remove the Seam fields and express the expected result as Outcome. Keeping them would require a human amendment to framework-health D-001 rather than a derived exception in this plan.

## Missing Coverage

- D-010's AC-003/AC-007 collision still awaits a human ruling; task creation and implementation remain correctly blocked until the selected acceptance criterion is amended on the authoritative spec record.
- Retained-workspace cleanup still lacks an exact owner-process identity/probe contract. The plan says a fresh process may delete after proving the owner dead, but does not define evidence robust to PID reuse or name which module owns that proof without depending on execution-liveness.
- A live Fallow 2.54.2 duplication-baseline generation/consumption probe was not possible under the read-only/no-shell role. The installed version-matched skill documents the flags, but exit/envelope behavior for the proposed bootstrap remains unchecked as R-010 requires.
- Repository-wide old-path search and `git log --follow` verification for the eleven legacy review files could not be run under the no-shell constraint. All eleven listed source files and both excluded plan-qualified reports were confirmed present.
- Mechanical boundary conformance remains unavailable (`provider-not-configured`), and the architecture map is missing. Dependency direction was reviewed textually only.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Statically compared the snapshot/check path, Fallow executable and consent contracts, CLI/runtime bootstrap, Pi tool/session assembly, reviewer inputs, and config defaults. Live external baseline probing was unavailable under the read-only/no-shell role.
  findings: PR-002, PR-003, PR-006, PR-008

- dimension: duplication
  status: unchecked
  checked: The bound Fallow duplication capability failed with `invalid-output` because exit 0 contradicted 92 normalized findings; no clean duplicate-path conclusion is claimed.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced source-vs-clone state, base-owned registry versus working-tree checker/config, launch policy versus executable chain definitions, run-owned artifacts, and restart state.
  findings: PR-003, PR-005, PR-007

- dimension: risk-blast-radius
  status: checked
  checked: Walked canonical, named, raw, custom-alias, direct-spawn, project-check, analysis, cancellation, extraction, and report-persistence flows.
  findings: PR-002, PR-003, PR-004, PR-005, PR-007, PR-008

- dimension: user-experience
  status: checked
  checked: Walked existing-project upgrade, missing config, isolation refusal, check/provider failure, ready/not-ready, planless review, active-plan summary, and report recovery.
  findings: PR-002, PR-003, PR-006, PR-008

- dimension: behavior-spec
  status: checked
  checked: Mapped all twelve behaviors to AC-001 through AC-016, inspected observers and shipped entry points, and checked failure/edge outcomes plus the canonical behavior shape.
  findings: PR-006, PR-008, PR-009

- dimension: architecture-record
  status: unchecked
  checked: Textually compared the design with both orchestration records, the active coding-extraction plan, and the execution-liveness exclusions. Mechanical boundary conformance is unbound.
  findings: PR-001, PR-007

- dimension: quality-contract
  status: checked
  checked: Checked runtime-resolved gates, baseline ownership, suppression self-authorization, concrete sign-off instructions, authored-prose review, and behavior/test coupling.
  findings: PR-005, PR-009

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked pre-bootstrap execution, clone establishment, every terminal/refusal path, provisional/final report ordering, timed-out-child retention, restart cleanup, and the unresolved D-010 collision.
  findings: PR-001, PR-002, PR-003, PR-004

- dimension: constraint-ownership
  status: checked
  checked: Traced human D-001 decisions, Design constraints, every Files-to-Change owner, snapshot/check authority, panel inputs, and extraction ownership into behaviors or implementation stages.
  findings: PR-001, PR-005, PR-006, PR-007, PR-008, PR-009

- dimension: scope-size
  status: checked
  checked: Counted twelve behavior clusters, matching the maximum guidance, and reviewed the ten implementation stages as candidate task units.
  findings: none

## Assessment

The plan remains blocked and needs substantial revision, not fundamental abandonment. First resolve the ratified D-010 collision and obtain a human ruling on D-004's replacement of the decided worktree mechanism; then make the isolated snapshot capable of running dependencies and authorized analysis without letting the reviewed change silence its own gates.
