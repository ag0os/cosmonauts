# Plan Review: harness-adapters

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "The new command sources cannot satisfy the plan's historical-lineage precondition"
  plan_refs: D-001, D-015, B-009, Design §8.1, Design §8.4, Implementation Order 8c
  code_refs: missions/plans/harness-adapters/spec.md:8-12, /Users/cosmos/.claude/commands/spec-to-backlog.md:1-6, /Users/cosmos/.claude/commands/implement-plan.md:1-6, external-commands/spec-to-backlog.md (missing; read probe returned ENOENT), external-commands/implement-plan.md (missing; read probe returned ENOENT)
  description: |
    AC-004 deliberately creates the two native sources from today's hand-maintained command files; the spec also states that these assets currently have no in-repo source. D-015 authorizes an unmanaged target only when it equals a legacy render from a named git revision and source path. Although D-015's own scope names only the four AC-007 skills and the bundle, B-009 and Design §8.4 extend “authorized historical/live lineage” to both commands and require historical hashes in command evidence.

    No pre-existing git revision/path can prove lineage to files that do not yet exist. Committing the newly copied files and then citing that commit would be circular: equality would prove only that the source was copied from the target, not that the unmanaged target descended from an historical source. Implemented literally, command migration must either abort forever or weaken D-015 silently. The planner must separate AC-004's one-time bootstrap authorization from D-015's legacy-export proof. AC-004's marker-stripped byte equivalence is ratified ground and cannot be weakened without escalation.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "Fresh recovery deletes backups that migration evidence is required to retain"
  plan_refs: B-007, B-009, B-012, Design §7 recovery row 7, Design §8.2-§8.4, Quality Contract items 4-5
  code_refs: lib/entity-file-lock.ts:61-72
  description: |
    A normal crash after target and manifest commit but before the migration check/evidence write leaves the exact row-7 observation: `M=new, T=new, B=old, S=absent`, with a valid journal. Row 7 instructs every fresh writer to perform cleanup-only removal of the backup and journal. Design §8 instead requires repo, bundle, and command backups/journals to remain until the relevant check and durable evidence succeed, and explicitly says evidence failure retains them for retry.

    The generic recovery path therefore destroys the recovery/evidence material at the first ordinary sync after this normal crash. The journal needs a durable migration/evidence phase with recovery outcomes that preserve the hold until evidence is re-read; the current observation-only table cannot satisfy B-007, B-009, and B-012 simultaneously.

- id: PR-003
  dimension: lifecycle-invariant
  severity: high
  title: "A crash during promised post-install rollback has no recoverable state"
  plan_refs: B-007, B-009, Design §7 atomicSet rules, Design §8.4
  code_refs: lib/entity-file-lock.ts:61-72
  description: |
    B-009 promises that a post-install byte mismatch restores both command targets and the old manifest. After the manifest is already `new`, however, the recovery table has no rollback-intent phase. If rollback restores one target first and crashes, `M=new` with an old/new target vector is declared ambiguous and preserved forever. If it restores the manifest first while both targets are still new, `M=old` with every member new is interpreted as a commit to finalize, undoing the intended rollback.

    Thus there is no crash-safe first rollback write under the stated atomic-set rules. Persisting rollback intent before changing the manifest or either target, and specifying exits for every partial rollback vector, is required before the “all normal crash states recover” claim is true.

- id: PR-004
  dimension: state-sync
  severity: high
  title: "Project-bound ownership makes generic personal assets permanently foreign across projects and package moves"
  plan_refs: D-007, D-013, D-016, B-004, B-006, Risks `Cross-project personal roots`, Assumptions `commands remain cosmonauts-generic`
  code_refs: cli/skills/subcommand.ts:75-109, cli/skills/subcommand.ts:164-208, cli/runtime-bootstrap.ts:109-129, lib/skills/exporter.ts:44-55, /Users/cosmos/.claude/skills/cosmonauts/SKILL.md:1-6, /Users/cosmos/.claude/commands/spec-to-backlog.md:1-6
  description: |
    Personal outputs are machine-global under `~/.claude`, but D-013 keys their ownership by both `realpath(projectRoot)` and `realpath(catalogueRoot)`. The current CLI derives project identity from `process.cwd()` and catalogue/framework identity from the installed module path. Consequently, after project A installs a generic command or bundle, project B sees the same `(assetId, outputPath)` as `foreign-owner` even when source and target bytes are identical. A moved checkout, a different monorepo cwd, or an installation path change can make the original project's own exports foreign as well.

    D-016 cannot clear this state: `--forget-removed` may delete only the invoking owner's row, while the old owner can no longer be derived after its checkout/catalogue disappears. The risk section explicitly defers transfer, leaving a permanent conflict in a normal multi-project/upgrade flow. This contradicts the stated reason these assets default to personal scope—being usable from any Cosmonauts project—and needs an ownership redesign that still preserves INV-002.

- id: PR-005
  dimension: lifecycle-invariant
  severity: medium
  title: "A crash after staging but before journaling leaves an orphan with no exit"
  plan_refs: B-007, Design §7 ordering steps 5-7, Design §7 recovery row 1, Quality Contract item 4
  code_refs: lib/entity-file-lock.ts:61-72
  description: |
    Design §7 stages complete trees before persisting the journal. A process crash in that window leaves `.cosmonauts-harness-<target>-<scope>.stage-<transactionId>` but no journal. Recovery row 1 treats an absent journal as “no recovery” and goes directly to the normal classification grid; no later step discovers or removes an unreferenced stage.

    The random transaction ID may keep later syncs working, but the normal crash state is permanent filesystem residue and contradicts the claimed complete recovery table. The plan must either journal before creating recoverable artifacts or define safe orphan-stage discovery and cleanup.

- id: PR-006
  dimension: state-sync
  severity: medium
  title: "Transient discovery failures can be mistaken for authorized source removal"
  plan_refs: D-016, B-004, B-011, Design §3, Design §5 source-removed rows, Risks `Complete inventory authority`
  code_refs: lib/skills/discovery.ts:58-86, lib/skills/discovery.ts:125-175
  description: |
    Complete reconciliation infers source removal from an asset disappearing from fresh candidate inventory and then deletes an unchanged managed target. The existing discovery seam does not distinguish deletion from incomplete observation: inaccessible skill roots are skipped when `isDirectory` catches filesystem errors, and `loadFlatSkillMeta`/`loadSkillMeta` catch every read failure and return no candidate. The plan says to split candidate/effective discovery while preserving existing runtime behavior, but it never gives complete reconciliation a health/error signal.

    A transient permission or I/O error can therefore look exactly like an intentionally removed source and authorize target/manifest deletion. Candidate discovery used for destructive reconciliation must fail the owner transaction as incomplete rather than emit authoritative absence; runtime listing may preserve its current tolerant behavior separately.

- id: PR-007
  dimension: behavior-spec
  severity: medium
  title: "The closing default check does not state the required permanent `playwright-cli` conflict outcome"
  plan_refs: A-001, D-003, D-007, D-014, B-012, Quality Contract item 7, Implementation Order 9
  code_refs: .cosmonauts/config.json:1-24, bundled/coding/skills/playwright-cli/SKILL.md:1-38, .claude/skills/playwright-cli/SKILL.md:1-55, cli/skills/subcommand.ts:75-109
  description: |
    D-007 makes an unfiltered default request a complete reconciliation of runtime skills. This repository loads the bundled coding skills, explicitly includes `playwright-cli`, and has the foreign generated target that A-001/D-014 require to remain a permanent `locally-edited (foreign-or-untraceable)` conflict. Under D-004, the corresponding full default check must exit nonzero.

    B-012 and the closing Quality Contract nevertheless require a “full default sync/check” without specifying that known row or its expected nonzero exit, while describing the checkpoint as passing. A worker cannot tell whether to preserve the ratified conflict, silently omit it, or treat the checkpoint as failed. The expected report and exit must be explicit. Migrating/adopting the target or weakening A-001/D-014 would touch ratified ground and requires human escalation.

## Missing Coverage

- The plan names no concrete git revisions for the four repository exports or personal bundle. Their current files were read, but historical object availability and exact legacy-render matches could not be verified under this reviewer's no-shell role; Slice C must treat that as evidence to establish, not an assumed pass.
- Exact Claude/Codex loading of directory links, flat wrappers, and generated wrappers remains unprobed. No approved live invocation surface was available that both obeyed the read-only role and guaranteed project/user configuration or plugins could not execute.
- No behavior names the expected second-project result for already-current personal generic assets or the cleanup result after the original owner checkout disappears; PR-004 is therefore also absent from executable evidence.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Existing skill discovery/export, runtime bootstrap, named-chain enumeration, package definition/build/export, live command files, and proposed migration boundaries were compared with the revised contracts.
  findings: PR-001
- dimension: duplication
  status: unchecked
  checked: Structural duplication evidence is unavailable because the capability is unbound (`execution-not-consented`, provider `fallow`); direct reads confirmed the existing chain-list and target-resolution paths but do not establish a project-wide verdict.
  findings: none
- dimension: state-sync
  status: checked
  checked: Owner keys, machine-global manifests, complete/partial selection, source removal, foreign claims, discovery failure, sticky modes, and forget behavior were traced.
  findings: PR-004, PR-006
- dimension: risk-blast-radius
  status: checked
  checked: Live command cutover, four-skill and bundle migrations, multi-project personal use, package relocation, permanent foreign assets, and closing checkpoints were followed to user-visible outcomes.
  findings: PR-001, PR-002, PR-003, PR-004, PR-007
- dimension: user-experience
  status: unchecked
  checked: Sync/check/conflict/retry flows were walked from the user seat, but external harness link/wrapper loading could not be safely live-probed under the read-only/no-shell contract.
  findings: PR-001, PR-004, PR-007
- dimension: behavior-spec
  status: checked
  checked: B-001..B-012, amended AC mappings, named tests, markers, migration evidence, failure cases, and closing outcomes were reviewed for direct authorability.
  findings: PR-001, PR-002, PR-003, PR-004, PR-005, PR-006, PR-007
- dimension: architecture-record
  status: unchecked
  checked: `domains.md`, `orchestration-future.md`, `code-structure-map.md`, package publication, and the plan's declared dependency rules were read directly; the architecture map is missing and boundary-conformance capability is unbound, so project-wide conformance is unchecked.
  findings: none
- dimension: quality-contract
  status: checked
  checked: Ordered gate kinds, tiers, binding/degradation states, mutation targets, live evidence requirements, and checkpoint expectations were reviewed.
  findings: PR-002, PR-003, PR-005, PR-007
- dimension: lifecycle-invariant
  status: checked
  checked: Source-removed cells and every stated writer window were attacked, including pre-journal staging, post-commit evidence hold, rollback-in-progress, check-only pending state, and release uncertainty.
  findings: PR-001, PR-002, PR-003, PR-004, PR-005, PR-006
- dimension: constraint-ownership
  status: checked
  checked: Human rulings, amendments, migration authorization, recovery/containment rules, cross-project ownership, files, and implementation-slice constraints were traced to behaviors or identified as missing phase ownership.
  findings: PR-001, PR-002, PR-003, PR-004, PR-005
- dimension: scope-size
  status: checked
  checked: The plan has 12 behaviors, three explicit slices, and a stated split trigger; no behavior-count excess was found.
  findings: none

## Assessment

The plan remains viable but is not ready for task creation. Fix the command-bootstrap authorization first, then make transaction recovery phase-aware so evidence holds and rollback-in-progress states cannot be mistaken for cleanup, commit, or permanent ambiguity.
