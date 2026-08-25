# Plan Review: harness-adapters

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Canonical `claude` has no defined compatibility boundary to the existing `claude-cli` package contract"
  plan_refs: D-005, B-003, Design §1, Design §7
  code_refs: lib/agent-packages/types.ts:4-10, lib/agent-packages/types.ts:14-26, lib/agent-packages/types.ts:44-57, lib/agent-packages/definition.ts:106-120, lib/agent-packages/build.ts:16-21, lib/agent-packages/build.ts:34-35, lib/agent-packages/build.ts:52-79, cli/export/subcommand.ts:34-39, cli/export/subcommand.ts:68-101, tests/agent-packages/definition.test.ts:286-317, tests/agent-packages/build.test.ts:91-114
  description: |
    D-005 requires normalized definitions and all internal calls to carry `claude`, while B-003 promises unchanged package IDs, options, invocation, and legacy definitions. Today `SupportedExportTarget`, `AgentPackage.target`, definition keys, generated shorthand IDs, builder lookup, CLI output, and tests all carry `claude-cli`. The plan defines no adapter field or function that maps canonical registry identity to this runtime/package serialization identity; `HarnessAssetAdapter.transform` is also left unsigned.

    Implemented literally, either `definition.targets[target]` misses the legacy block or observable IDs/JSON/package targets change. The planner must define the exact canonical-to-runtime contract and exact compatibility assertions. Weakening AC-1 or the Out-of-Scope promise that package building stays unchanged would touch ratified ground and must be escalated.

- id: PR-002
  dimension: state-sync
  severity: high
  title: "The removal cell can delete managed skills merely omitted from a named export"
  plan_refs: D-007, B-002, Design §5 row `source removed/no longer selected`, Design §7
  code_refs: cli/skills/subcommand.ts:147-208, lib/skills/exporter.ts:64-75
  description: |
    D-007 says the compatibility command retains named-skill selection, matching the current CLI, which only calls `exportSkill` for `toExport`. The state matrix instead combines “source removed” with “no longer selected” and instructs normal sync to remove the unchanged owned target and manifest entry. After exporting `plan` and `task`, a later `skills export ... plan` could therefore delete `task`, although it was only outside this invocation's selection.

    The plan must distinguish inventory reconciliation from partial selection and add a negative behavior proving unselected managed assets remain untouched. This is derived mechanism; no ratified criterion needs to change.

- id: PR-003
  dimension: lifecycle-invariant
  severity: high
  title: "Fresh-process journal recovery is incompatible with read-only check and has no shared lock identity"
  plan_refs: D-009, B-005, Design §4, Design §7, Quality Contract item 2
  code_refs: lib/entity-file-lock.ts:62-72, lib/skills/exporter.ts:44-55
  description: |
    D-009 and Design §4 say the next invocation reconciles a pending journal by finalizing a manifest or restoring a target. B-005 says a fresh-process `--check` writes no target, manifest, journal, timestamp, or mtime, and Design §7 says check never invokes materializers. The plan never says whether check reports recoverable state without mutation or performs recovery, so both promises cannot be implemented together.

    The manifest/lock ownership is also underspecified: Claude skill and command roots are `.claude/skills` and `.claude/commands`, but the example puts one manifest at `.claude/.cosmonauts-harness-manifest.json`. `withEntityFileLock` serializes only callers using the same exact `lockPath`; “one target/scope root” does not establish that both asset kinds share one lock. A crash/restart behavior must own each old/new target+manifest+journal cell, check's read-only result, and the manifest-parent lock key; the current crash checks live only in Design/Quality prose and can be dropped at task handoff.

- id: PR-004
  dimension: lifecycle-invariant
  severity: medium
  title: "Direct-link source edits are simultaneously `current` and `source-ahead`"
  plan_refs: D-008, B-004, B-005, Design §3, Design §5
  code_refs: missions/plans/harness-adapters/spec.md:45-47, missions/plans/harness-adapters/spec.md:86-90, lib/skills/discovery.ts:15-26
  description: |
    D-008 says source edits through identity symlinks are immediately live; the matrix says a direct link resolving to the expected local source is `current`. The general classifier and Design §3 also say a changed fresh source/render hash is `source-ahead`. For the same direct link after editing `SKILL.md`, these rules produce different states and different sync/timestamp actions.

    The plan must choose and test one state rule for content edits, additions/removals under linked directories, and wrapper-generated facts. Any resolution must preserve ratified INV-1, INV-3, and INV-6; silently falling back to copies would require escalation.

- id: PR-005
  dimension: lifecycle-invariant
  severity: high
  title: "The command migration ordering promises an impossible pre-write check and an incomplete rollback"
  plan_refs: B-007, Design §6, Quality Contract items 4 and 6, Files to Change
  code_refs: /Users/cosmos/.claude/commands/spec-to-backlog.md:1-4, /Users/cosmos/.claude/commands/implement-plan.md:1-4, lib/skills/exporter.ts:64-75
  description: |
    B-007 says the final synced target is compared fourth but also says cutover is refused before any live rename/write on *any* mismatch. A final-target mismatch can only be observed after the live target was written. Design §6 partly recognizes this with rollback, but rollback restores only the file; ordinary sync will already have created/updated provenance, leaving the restored unmarked live file classified as `locally-edited`. The ordering is also written per singular command, so it does not guarantee both commands pass preflight before either is renamed.

    Specify pair-level preflight and post-write failure semantics separately, including manifest/journal rollback and evidence-write failure. AC-4's byte-equivalence is ratified; weakening equivalence or comparing only fixtures is not an available remediation.

- id: PR-006
  dimension: architecture-record
  severity: medium
  title: "Proposed command home makes coding workflow content a permanent framework package surface"
  plan_refs: D-001, Architecture Context, package.json Files to Change
  code_refs: missions/architecture/domains.md:37-55, missions/architecture/domains.md:57-65, package.json:14-23, ROADMAP.md section `coordinator-packages`
  description: |
    `domains.md` defines the shipped core as framework + `shared` + `main`, sends `coding` to an external repo, and assigns content/behavior to domains. The two live commands are coding planning/implementation workflows; D-001 acknowledges they are not neutral shared content, yet proposes shipping them forever from a new top-level framework directory and explicitly promises not to move them when domain command contribution arrives.

    That is not merely packaging background; it conflicts with the durable framework/domain boundary and the upcoming coding extraction. D-001 is one of the four unratified open-question decisions, so the planner should resolve this conflict before presenting it for human ratification rather than treating the top-level home as architecture-compatible.

- id: PR-007
  dimension: scope-size
  severity: medium
  title: "B-008 adds a second chain-enumeration UX although the required live JSON surface already exists"
  plan_refs: B-008, Design §3, Implementation Order step 5
  code_refs: cli/run/subcommand.ts:104-126, cli/run/subcommand.ts:221-225, cli/run/subcommand.ts:281-292, external-skills/cosmonauts/chains/SKILL.md:14-27
  description: |
    AC-5 requires the CLI to enumerate named chains. `cosmonauts run chain list` already does so by calling `listNamedChains` and emitting `{name, description, chain}` JSON, and the external skill already documents that live route. B-008 adds a new root `--list-chains` flag, three output modes, root dispatch state, tests, and docs while explicitly retaining the existing route.

    The plan should justify why this additional public surface is necessary for sync-time introspection or keep AC-5's behavior proof on the existing route. At the 12-behavior ceiling, an unnecessary behavior also displaces missing recovery/migration evidence behaviors.

- id: PR-008
  dimension: interface-fidelity
  severity: medium
  title: "The discovery contract cannot both preserve effective first-wins rows and expose collision candidates as written"
  plan_refs: B-009, B-010, Design §2
  code_refs: lib/skills/discovery.ts:15-26, lib/skills/discovery.ts:44-86, lib/skills/discovery.ts:99-145, tests/skills/discovery.test.ts:64-106, tests/skills/discovery.test.ts:190-231, cli/skills/subcommand.ts:78-106
  description: |
    `discoverSkills` currently returns an effective unique list by discarding every later frontmatter name, and the existing list/inventory path consumes that contract. B-010 needs all candidates to survive long enough to distinguish same-logical-path precedence from cross-domain collisions. “Continue using `discoverSkills`” plus “extend each result” does not define whether the public function now returns candidates, throws, or still returns effective rows.

    Removing the final dedupe would duplicate ordinary `skills list`/inventory rows; retaining it makes B-010 impossible. Define the public candidate/effective contract and preserve existing precedence with tests. AC-6 itself is ratified, so first-wins cross-domain export is not an acceptable shortcut.

- id: PR-009
  dimension: behavior-spec
  severity: medium
  title: "The generated inventory has no authorable byte/schema contract"
  plan_refs: B-009, Design §3, Files to Change, Quality Contract item 5
  code_refs: external-skills/cosmonauts/chains/SKILL.md:14-27, external-skills/cosmonauts/skills/SKILL.md:16-42, cli/run/subcommand.ts:281-292, cli/skills/subcommand.ts:32-40
  description: |
    B-009 requires an “exact” generated inventory, while Design only says the renderer adds “a deterministic generated inventory file.” It does not name the relative file, section/schema, ordering, path representation, or how the authored skill references it. These choices affect rendered bytes, link-wrapper layout, hashes, and what an external agent observes, so the named test cannot be written without inventing product behavior.

    Define the generated file/data contract and exact assertions for chains, skills, and registry paths. Replacing the current tables with another hand-maintained shape would violate ratified INV-4/AC-5.

- id: PR-010
  dimension: behavior-spec
  severity: medium
  title: "B-011's unit-test pairing cannot prove the required live repository migration"
  plan_refs: B-011, Design §6, Files to Change, Quality Contract item 6
  code_refs: .gitignore:13-15, tests/skills/exporter.test.ts:1-150, .claude/skills/skills-cli/SKILL.md:25-46, domains/shared/skills/skills-cli/SKILL.md:25-46
  description: |
    AC-7 requires the repository's real stale exports to be regenerated as the first live validation. Those outputs are ignored, and `tests/skills/exporter.test.ts` is a temp-fixture unit suite. Unlike B-007, B-011 has no named migration verifier/evidence artifact; Files to Change only pairs the ignored wildcard with that unit test. A fixture can prove the algorithm but cannot prove the actual five directories were preserved, regenerated, checked, and had their backup removed.

    Name all five source/target pairs and a durable live-validation evidence owner distinct from the unit test. Narrowing B-011 to fixture behavior would narrow ratified AC-7 and requires human escalation.

- id: PR-011
  dimension: behavior-spec
  severity: medium
  title: "The ratified Intent block has invariants but no canonical Goal"
  plan_refs: spec.md `## Intent`, plan Architecture Context, D-006
  code_refs: missions/plans/harness-adapters/spec.md:67-91, domains/shared/skills/work-artifacts/references/spec-format.md:15-37, domains/shared/skills/work-artifacts/references/deviation-protocol.md:11-31
  description: |
    The authoritative spec's Intent block omits the required one-sentence Goal. The plan already has to invent priority in D-006 when source drift and local-edit evidence coexist, so later collisions have invariants but no canonical goal against which derived mechanism can be amended.

    Intent is ratified ground. The planner may flag and draft the missing Goal, but only the human may add/ratify it; it must not be inferred silently from Purpose.

## Missing Coverage

- A package definition containing both canonical `claude` and alias `claude-cli` keys with different options has no specified rejection/precedence behavior.
- Link safety lacks a behavior proving rejection of symlinked/escaping source ancestors, remote sources, and wrapper entries escaping the target root; Design/Risks alone will not survive task handoff.
- The explicit `external-skills/cosmonauts` asset can collide with a runtime-discovered skill named `cosmonauts`; B-010 only describes collisions among discovery candidates.
- Flat root skills are real (`DiscoveredSkill.dirPath` may be a `.md` file), but no behavior defines copy/link rendering to the harness-required `<name>/SKILL.md` shape.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Existing skill export, discovery, runtime, agent-package definition/build/export, and CLI signatures were compared with the proposed contracts.
  findings: PR-001, PR-008
- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`execution-not-consented`, provider `fallow`); direct reads found the existing chain-list route, but no project-wide structural-duplication claim is made.
  findings: none
- dimension: state-sync
  status: checked
  checked: Selection, manifest cells, link/copy state transitions, shared-root locking, and fresh-process recovery were traced.
  findings: PR-002, PR-003, PR-004
- dimension: risk-blast-radius
  status: checked
  checked: Agent-package compatibility, live command cutover, stale repo migration, ignored outputs, future coding extraction, and follow-on coordinator packaging were traced.
  findings: PR-001, PR-005, PR-006, PR-010
- dimension: user-experience
  status: checked
  checked: Named export retention, check semantics, link freshness, migration failure/restore, defaults, and the four open decisions were walked from the user seat.
  findings: PR-002, PR-003, PR-004, PR-005
- dimension: behavior-spec
  status: checked
  checked: All B-001..B-012 entries, AC mappings, named tests, markers, failure cases, and authorability were reviewed against the spec and current tests.
  findings: PR-003, PR-005, PR-008, PR-009, PR-010, PR-011
- dimension: architecture-record
  status: checked
  checked: ROADMAP.md, domains.md, orchestration-future.md, code-structure-map.md, package publication, and plan Architecture Context were read directly; the derived architecture map itself is missing.
  findings: PR-006
- dimension: quality-contract
  status: checked
  checked: Gate order/tier/binding/degradation and plan-specific evidence were reviewed; runtime bindable gates are explicitly unbound rather than silently passed.
  findings: PR-003, PR-010
- dimension: lifecycle-invariant
  status: checked
  checked: Every written target/manifest/journal/backup state, no-write check, source removal, link update, migration rollback, and state exit was attacked.
  findings: PR-002, PR-003, PR-004, PR-005
- dimension: constraint-ownership
  status: checked
  checked: Load-bearing recovery, link safety, migration, inventory, and Files-to-Change constraints were traced to behaviors/tests or identified as prose-only.
  findings: PR-003, PR-009, PR-010
- dimension: scope-size
  status: checked
  checked: The plan has exactly 12 behaviors and an explicit split seam; each behavior was checked against ratified scope and existing surfaces.
  findings: PR-007

## Assessment

The plan is viable only after substantial revision; it does not need a different product direction. Fix the state/recovery model first—especially partial selection versus deletion and read-only check versus journal reconciliation—because implementing the current matrix can delete valid exports or leave provenance split-brained.
