# Plan Review: harness-adapters

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "The live-validation migration bypasses unmanaged-target protection, and `playwright-cli` proves the mapping is unsafe"
  plan_refs: D-006, B-007, B-012, Design §8, Risks `Unmanaged stale targets are conflicts`
  code_refs: missions/plans/harness-adapters/spec.md:67-79, bundled/coding/skills/playwright-cli/SKILL.md:23-38, .claude/skills/playwright-cli/SKILL.md:1-55, lib/skills/exporter.ts:61-75
  description: |
    D-006 and B-007 classify every unprovenanced target as `locally-edited`, promise to leave it intact, and prohibit a force-overwrite path. B-012 then handles five unprovenanced conflicts by moving all of them away, writing replacements, and deleting the recovery backup. An old hash proves what was removed, but without prior provenance it cannot prove that the differing bytes were merely stale rather than locally valuable. This is the destructive exception B-007 says does not exist.

    The proposed `playwright-cli` pair is concrete evidence of the problem. The in-repo file is a short wrapper that tells users to run `playwright-cli install --skills`, which generates comprehensive docs at `.claude/skills/playwright-cli/`; the current target is that different generated command reference, including `allowed-tools` and the full command set. Replacing it with the wrapper removes the detailed asset, and following the wrapper's own installation instruction would immediately rewrite the managed target and make the next check report `locally-edited`.

    Reclassify each real target and define evidence/authorization that distinguishes a stale Cosmonauts copy from another tool's or the user's asset before migration. Permitting sync or its migration helper to discard an unprovenanced local target would weaken ratified INV-2/AC-3 and must be escalated rather than patched into the derived design. Runtime `dead-code`/`trace` capability evidence was unavailable (`execution-not-consented`, provider `fallow`); the exact source/target bytes above establish this finding directly.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "Pair migration re-enters a non-reentrant owner lock"
  plan_refs: B-008, Design §5, Design §7 step 2, Implementation Order step 8
  code_refs: lib/entity-file-lock.ts:61-112
  description: |
    Design §7 says to acquire the personal Claude owner lock and, while holding it, run “ordinary now-missing copy sync.” Design §5 says ordinary sync acquires that same owner-root lock. `withEntityFileLock` exposes no lock token or lock-held entry point; a nested acquisition sees the current process as a live owner and waits, indefinitely by default.

    Implemented literally, the command migration hangs after moving the live commands to backup. The plan must define the exact lock-held sync/materialization seam or make the pair migration one transaction that does not reacquire the lock; workers should not have to infer a hidden reentrancy contract.

- id: PR-003
  dimension: lifecycle-invariant
  severity: medium
  title: "The recovery table omits normal post-commit crash states"
  plan_refs: B-006, Design §5 writer transaction and fresh recovery, Quality Contract item 4
  code_refs: missions/plans/harness-adapters/plan.md:369-395
  description: |
    The writer order installs the new target, atomically updates the manifest, verifies, and only then removes backup and journal. A crash after manifest update therefore leaves `target=new, manifest=new, journal=present` (possibly with backup present); a crash between backup removal and journal removal leaves the same state without a backup. The recovery list only defines `target=new` with the *old* manifest, `target=old` with the old manifest, and target-missing-with-backup. Its fallback classifies every other cell as an ambiguous conflict.

    These omitted cells are expected outcomes of the specified write order, not corruption. B-006's phrase “each recognized old/new ... combination” and the Quality Contract's “every journal old/new cell” do not enumerate the inputs or outcomes a test should author. Add a complete manifest/target/backup/stage/journal state table, including cleanup-only exits, so a normal crash cannot strand a permanent pending conflict.

- id: PR-004
  dimension: state-sync
  severity: medium
  title: "The lock writes through a target-parent symlink before containment preflight"
  plan_refs: B-004, Design §2 containment rule, Design §5 writer steps 1-2, Risk `Link trust is narrow`
  code_refs: lib/entity-file-lock.ts:61-68, lib/entity-file-lock.ts:126-149
  description: |
    The plan rejects symlinked target parents and says target parents cannot redirect writes, but containment preflight occurs inside the owner-root transaction after the lock is acquired. The existing lock helper first `mkdir`s the lock parent, writes a temporary file there, and hard-links it to the lock path before invoking the callback. If `<project>/.claude` or `~/.claude` is a symlink, those writes have already followed it before the adapter can reject the target shape.

    The plan needs an explicit, race-aware ordering and lock-location contract for owner-root validation. Merely adding a check inside the lock callback does not satisfy the stated containment boundary because acquisition itself has already written through the invalid parent.

- id: PR-005
  dimension: user-experience
  severity: medium
  title: "Claude-only repository validation creates an unignored Codex export tree"
  plan_refs: D-003, D-007, B-012, Design §8, Files to Change `.gitignore`
  code_refs: lib/skills/exporter.ts:34-55, .gitignore:13-16, missions/plans/harness-adapters/spec.md:112-123
  description: |
    AC-7 and the five named validation pairs concern the repository's Claude exports, but B-012 requires `.agents/skills` to be present after validation. Under D-007, an omitted target selects Claude and Codex, and the existing path contract places Codex output under project `.agents/skills`. This repository ignores `.claude/` but not `.agents/`, while the plan explicitly says `.gitignore` will not change.

    The first live validation will therefore leave a new untracked Codex skill tree and owner-root manifest even though no Codex migration is being proved. Scope the live validation explicitly to Claude or make ownership/ignore behavior for `.agents/` part of the Gate-0 human decision; the current plan silently dirties the worktree as a side effect of AC-7.

- id: PR-006
  dimension: interface-fidelity
  severity: medium
  title: "Future target blocks can regress at parse time under the new registry"
  plan_refs: D-005, B-002, Design §1 agent-package flow, Overview `package building remains unchanged`
  code_refs: lib/agent-packages/types.ts:4-26, lib/agent-packages/definition.ts:21-31, lib/agent-packages/definition.ts:168-186, tests/agent-packages/definition.test.ts:248-268
  description: |
    The current definition contract deliberately parses `gemini-cli` and `open-code` target blocks even though only `claude-cli` and `codex` can be exported; the test names this future-target compatibility. The new registry has no Gemini entry and only a declared, unimplemented `open-code` entry. B-002 includes declared/unknown targets in its Context but gives no Expected result for loading a definition that contains those blocks while exporting a supported target.

    A worker could reasonably route all definition keys through the registry and reject the whole file, breaking the existing parser contract, or preserve opaque future blocks and reject only target selection. Specify and test parse-time versus selection-time behavior. Preserving a future block is not the same as implementing Gemini, so it does not expand the ratified scope.

- id: PR-007
  dimension: constraint-ownership
  severity: medium
  title: "Inventory composition and scope-type ownership are missing from the inward dependency contract"
  plan_refs: Architecture Context boundary rules, B-001, B-010, B-011, Design §1-3, Files to Change
  code_refs: lib/skills/exporter.ts:12-31, lib/skills/index.ts:1-12, cli/skills/subcommand.ts:76-115, lib/runtime.ts:45-93
  description: |
    The plan says the adapter core accepts injected plain inventory data and that `lib/skills/` depends inward on it. Yet the registry contract references `ExportScope` without assigning its ownership (`ExportScope` currently lives in `lib/skills/exporter.ts`), while `lib/harness-adapters/inventory.ts` is assigned runtime candidate and generated-inventory work without naming who invokes `discoverSkills`, `listNamedChains`, and the existing runtime.

    If the adapter imports the current scope type or discovery path from `lib/skills`, dependency direction reverses and sync/export can become a module cycle. If CLI modules own collection, the new `harness` command and the compatibility `skills` command need an explicit shared plain-row contract and composition owner. Put the scope/root types and inventory input signatures in a named inward module and state which outer module turns `CosmonautsRuntime` into those inputs. Project-wide boundary-conformance evidence is unavailable because the capability is unbound, but the current type/function ownership above is direct evidence of this handoff gap.

- id: PR-008
  dimension: behavior-spec
  severity: low
  title: "Gate 0 addresses the missing Goal but not the rest of the ratified Intent/AC format collision"
  plan_refs: D-010, Implementation Order step 0, spec.md `## Intent`, all behavior Source fields
  code_refs: missions/plans/harness-adapters/spec.md:67-123, domains/shared/skills/work-artifacts/references/spec-format.md:15-50, domains/shared/skills/work-artifacts/references/plan-format.md:39-55
  description: |
    D-010 correctly stops rather than inventing the missing Intent Goal, but the same ratified block uses `INV-1` through `INV-6` and the acceptance criteria use `AC-1` through `AC-7`. The canonical contract requires `INV-###` and `AC-###`, and every behavior currently carries the noncanonical source IDs.

    Gate 0 should ask the human to ratify normalized IDs or explicitly ratify an exception covering Goal *and* identifier shape. Because these IDs belong to ratified Intent and acceptance criteria, the planner must not silently renumber the spec while revising the plan.

## Missing Coverage

- B-012 has no interruption/retry behavior for a crash between moving some unmanaged outputs, running sync, writing evidence, and deleting the recovery backup; unlike B-008, it persists no migration intent before the first move.
- The sync behaviors do not specify how callers handle `withEntityFileLock`'s `onReleaseUnconfirmed` contract; that API can return the completed action while warning that the lock may still exist.
- D-011 does not define which `Harness paths` rows are rendered for `agent-package`, declared `open-code`, or unsupported target/kind combinations, so the claimed exact inventory bytes still require a worker decision.
- Exact Claude/Codex loading of directory links, flat-file wrappers, and generated wrappers was not live-probed: this read-only reviewer role prohibits shell execution, and no approved sandboxed invocation that prevents project configuration/plugin loading was available.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Skill export paths, runtime/discovery signatures, chain enumeration, agent-package definition/build/compile/CLI contracts, and current compatibility tests were compared with the proposed interfaces.
  findings: PR-006, PR-007
- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`execution-not-consented`, provider `fallow`); direct reads confirmed existing chain and skill routes, but no project-wide structural-duplication claim is made.
  findings: none
- dimension: state-sync
  status: checked
  checked: Copy/link ownership, unmanaged targets, manifest/journal/backup transitions, shared-root locking, partial versus complete reconciliation, and repository migration state were traced.
  findings: PR-001, PR-002, PR-003, PR-004
- dimension: risk-blast-radius
  status: checked
  checked: The five real Claude targets, agent-package compatibility, ignored/unignored outputs, command cutover, and target-parent writes were followed to downstream user-visible effects.
  findings: PR-001, PR-004, PR-005, PR-006
- dimension: user-experience
  status: unchecked
  checked: Conflict, migration, drift-check, and worktree flows were walked from the user seat; external Claude/Codex wrapper loading could not be live-probed under the read-only/no-shell role contract.
  findings: PR-001, PR-005
- dimension: behavior-spec
  status: checked
  checked: B-001 through B-012, AC mapping, named tests, failure states, authorability, Intent, and behavior-source IDs were reviewed against the current artifact contract.
  findings: PR-001, PR-003, PR-006, PR-008
- dimension: architecture-record
  status: unchecked
  checked: `domains.md`, `orchestration-future.md`, `code-structure-map.md`, ROADMAP ordering, and the plan's direct boundary claims were read; the derived map is missing and boundary-conformance capability is unbound, so project-wide conformance is unchecked.
  findings: PR-007
- dimension: quality-contract
  status: checked
  checked: Gate order, tiers, binding/degradation states, negative evidence, live evidence artifacts, and behavior-artifact requirements were reviewed.
  findings: PR-003, PR-008
- dimension: lifecycle-invariant
  status: checked
  checked: Every specified target/manifest/journal/backup transition, nested lock path, migration rollback, cleanup exit, and no-write check state was attacked.
  findings: PR-001, PR-002, PR-003, PR-004
- dimension: constraint-ownership
  status: checked
  checked: Boundary rules, type ownership, runtime inventory composition, migration protections, and Files-to-Change entries were traced to behavior/task-visible owners.
  findings: PR-007, PR-008
- dimension: scope-size
  status: checked
  checked: The plan remains at the 12-behavior ceiling with an explicit split seam; the live Codex output was checked as scope expansion rather than a behavior-count excess.
  findings: PR-005

## Assessment

The plan remains viable, but the repository migration and transaction model need revision before Gate 0 can open. Fix B-012 first: it currently creates the exact unprovenanced destructive override the plan forbids, and the `playwright-cli` pair demonstrates real user data that would be replaced rather than a stale Cosmonauts export.
