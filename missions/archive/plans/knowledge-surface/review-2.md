# Plan Review: knowledge-surface

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Pi creates one ExtensionAPI per extension, so the WeakMap coordination key cannot work"
  plan_refs: D-008, Design §2, Design §5, Design §8, B-007, Risk R-005
  code_refs: node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:171-176, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:345-358, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:375-383, domains/shared/extensions/agent-memory/index.ts:260-306, domains/shared/extensions/architecture-memory/index.ts:111-145
  description: |
    D-008 and Design §8 claim that Pi supplies a cross-extension API object, then key a module-local `WeakMap` by that `ExtensionAPI`. Pi 0.80.6 does the opposite: `loadExtension()` creates a fresh extension object and calls `createExtensionAPI()` for every extension factory. The APIs delegate actions to a shared runtime and expose a shared event bus, but their object identities are distinct. A policy stored under the knowledge adapter's API therefore cannot be retrieved using the API passed to agent-memory or architecture-memory.

    The current injectors also retrieve and render their sections privately and return separate `before_agent_start` messages. The plan defines suppression but no section handoff to the new allocator. Implemented literally, the old handlers either fail to see the policy and keep double-injecting beyond 24,000 bytes, or are suppressed through an invented mechanism and make authored memory/architecture disappear from the combined context. D-008 is planner-proposed derived ground; it needs an amend-on-record redesign against Pi's actual shared runtime/event-bus contract, including an explicit way to aggregate all three section contents before one message is emitted.

- id: PR-002
  dimension: risk-blast-radius
  severity: high
  title: "The literal every-agent branch still has no enabled package-host path"
  plan_refs: Architecture Context boundary rules, D-008, D-010, B-006, B-012, Design §1-§2, Quality Contract assertions 3 and 5
  code_refs: package.json:7-10, lib/agents/session-assembly.ts:131-145, cli/session.ts:526-548, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:375-394
  description: |
    B-012 correctly models a Pi package host that loads `package.json`'s `./domains/shared/extensions` root without Cosmonauts session assembly. The design then intentionally places every knowledge adapter under `lib/extensions/`, outside that root, and makes `buildSessionParams` the only selector. Consequently the same package host receives no knowledge index or `recall` when `knowledgeSurface.enabled` is true; it never calls `buildSessionParams`, and none of the auto-loaded shared extensions is assigned an enabled knowledge adapter.

    D-010's literal option A discusses sandboxing generic Pi tools and external backends, but a sandbox does not provide the missing retrieval surface. Option C similarly disables tools/backends without making a package-host agent receive knowledge. Only option B could exclude this surface by amending “every agent” to Cosmonauts `AgentDefinition` sessions. The human ruling must therefore explicitly include or exclude package-host agents and, if it retains literal INV-2/AC-003, define their enabled loading path. Excluding them touches ratified INV-2 and AC-003; it cannot be patched as a derived implementation detail.

- id: PR-003
  dimension: behavior-spec
  severity: medium
  title: "The migration matrix assigns two meanings to the same source and type keys"
  plan_refs: B-003, Design §3, Design §6, Quality Contract assertion 1
  code_refs: memory/memory-interface.md:1-5, lib/sessions/types.ts:8-32, lib/sessions/knowledge.ts:21-42
  description: |
    The new OKF contract reserves top-level `source` for provenance and top-level `type` for the four ratified knowledge variants. Design §6 sets migrated markdown `source` to `memory/<slug>.md` while also requiring preservation of the original frontmatter `source` (for example `source: archive`). For JSONL, it sets `type` to the mapped value while also listing the original `type` among custom legacy keys. YAML cannot carry both meanings under one key without duplicate-key ambiguity or data loss.

    B-003 and Quality Contract assertion 1 require every frozen field to survive, so a worker cannot author the fixture or destination records without inventing replacement key names. Specify exact non-colliding destination keys for the original values and add them to the matrix. Dropping either original value would narrow ratified AC-002 provenance preservation and requires human escalation rather than a silent migration choice.

- id: PR-004
  dimension: state-sync
  severity: medium
  title: "The promised config reload transition does not rerun session assembly"
  plan_refs: D-008, B-008, Design §2, Files to Change session-assembly entry
  code_refs: cli/session.ts:526-548, cli/session.ts:570-620, cli/session.ts:632-654, lib/orchestration/session-factory.ts:47-79
  description: |
    D-008 says gate edits take effect after session “recreation/reload,” and Design §2 says a session reload is sufficient. In the CLI, `buildSessionParams` and `toResourceLoaderOptions` run once for the initial runtime; they run again only for the explicit pending-agent switch branch. The ordinary runtime path keeps using the original `resourceLoaderOptions`. The spawned-session factory likewise builds parameters once before constructing its loader. Pi resource reload therefore reloads the already-selected extension paths; it cannot add an adapter omitted while OFF or remove one selected while ON.

    As written, a false→true `/reload` remains OFF and a true→false `/reload` remains frozen ON, contrary to the stated transition contract. Define whether only full session recreation/agent switching is supported and test that exact UX, or add a real reassembly seam for reload. This is derived lifecycle behavior, so it can be corrected on record without weakening AC-007.

- id: PR-005
  dimension: constraint-ownership
  severity: medium
  title: "The backfill failure and approval guarantees have no executable owner"
  plan_refs: D-013, B-010, Design §7, Files to Change backfill entry, Quality Contract assertion 6, Implementation Order stage 7
  code_refs: bundled/coding/agents/distiller.ts:3-16, domains/shared/skills/archive/SKILL.md:158-181, .cosmonauts/config.json:1-26
  description: |
    B-010 and Quality Contract assertion 6 require byte-for-byte config restoration on failure/cancellation and recorded human approval before proposal artifacts are accepted. The existing substrate is only a declarative distiller agent plus a manual `spawn_agent` instruction. The Files to Change list adds proposal files and an unnamed “review index,” but no callable batch/script seam whose failure can be induced by the named test and whose `finally` behavior can be verified.

    A static artifact test can prove that final proposals exist; it cannot prove that a failed or cancelled batch restored config. The plan also gives no path or schema for the review index, so a worker must invent what evidence records approval and when the task may close. Assign the batch lifecycle and approval evidence to an explicit implementation artifact before decomposition. Moving restoration or no-verbatim review back to final verification would again leave ratified INV-5 without a task-local owner.

- id: PR-006
  dimension: behavior-spec
  severity: medium
  title: "The distiller still looks for transcripts only in the pre-archive location"
  plan_refs: B-009, B-010, Design §7, Files to Change distiller/archive entry
  code_refs: lib/plans/archive.ts:116-127, bundled/coding/prompts/distiller.md:34-68, domains/shared/skills/archive/SKILL.md:145-181
  description: |
    `archivePlan()` moves `missions/sessions/<slug>/` to `missions/archive/sessions/<slug>/` before the archive skill tells the user to spawn the distiller. The active distiller persona, however, reads only `missions/sessions/<planSlug>/manifest.json` and transcript paths beneath that active directory; when the manifest is missing it silently falls back to plan/tasks. The archive skill repeats the same stale active-session path while acknowledging that sessions were moved.

    B-009's context says the distiller receives archived artifacts and filtered Tier-2 transcript markdown, but its expected result and named test cover output rules, not discovery from both active and archived session locations. Without an explicit fallback behavior, backfill and future post-archive runs can ignore existing transcripts and produce lower-coverage proposals while tests pass. Add the active/archive discovery outcome to B-009 or B-010 and its test. Because this changes active prompt/archive text, applying the correction remains subject to the pending D-009 human ruling.

## Missing Coverage

- No viable Pi contract yet coordinates the frozen gate policy or hands authored-memory and architecture section content to the single combined allocator.
- No enabled package-host behavior proves a Pi agent outside Cosmonauts session assembly receives the index and `recall` under the literal every-agent interpretation.
- No test distinguishes full session recreation from Pi resource reload for false→true and true→false gate edits.
- The migration fixture has no exact non-colliding key names for legacy markdown `source` or JSONL `type`.
- The backfill has no callable failure/cancellation seam or specified path/schema for human approval evidence.
- The distiller has no tested active-path/archive-path manifest and transcript fallback.
- The exact 36-markdown/10-bundle/19-missing inventory could not be independently enumerated with the available read-only capabilities; the plan's frozen inventory remains the intended executable proof.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared `MemoryStore` changes, session/load paths, Pi 0.80.6 extension construction, final tool registration assumptions, existing injectors, and distiller/archive inputs against the plan.
  findings: PR-001, PR-004, PR-006
- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports duplication unbound with reason `execution-not-consented` for provider `fallow`; manual reading identified related stores and atomic-write code but cannot establish project-wide structural duplication.
  findings: none
- dimension: state-sync
  status: checked
  checked: Traced policy identity, injector lifecycle, config freezing, reload/recreation, backfill config restoration, and persisted proposal exits.
  findings: PR-001, PR-004, PR-005
- dimension: risk-blast-radius
  status: checked
  checked: Traced initial, switched, spawned, package-host, external-backend, migration, archive-distiller, and backfill flows.
  findings: PR-001, PR-002, PR-005, PR-006
- dimension: user-experience
  status: checked
  checked: Walked OFF/ON sessions, package-host use, config edits, proposal review, migration, and post-archive distillation from the user's seat.
  findings: PR-002, PR-004, PR-005, PR-006
- dimension: behavior-spec
  status: checked
  checked: Reviewed all 12 behaviors for AC links, concrete outcomes, executable seams, named tests, edge cases, and direct authorability.
  findings: PR-003, PR-005, PR-006
- dimension: architecture-record
  status: unchecked
  checked: Read both declared architecture records and manually checked their relevant decisions/usefulness, but `analysis_status` reports boundary-conformance unbound (`execution-not-consented`, provider `fallow`), so project-wide conformance to the declared dependency rules was not established.
  findings: PR-002
- dimension: quality-contract
  status: checked
  checked: Reviewed the ordered abstract ladder and plan-specific migration, combined-budget, package-host, generic-tool, backfill, and dead-code assertions.
  findings: PR-001, PR-002, PR-003, PR-005
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked OFF/ON transitions, extension identity, injector suppression, proposal exits, config restoration, archive relocation, and prompt retirement.
  findings: PR-001, PR-004, PR-005, PR-006
- dimension: constraint-ownership
  status: checked
  checked: Traced ratified all-agent, single-path, provenance, no-verbatim, OFF-identity, and task-local review constraints into behavior and implementation owners.
  findings: PR-002, PR-003, PR-005, PR-006
- dimension: scope-size
  status: checked
  checked: The plan has exactly 12 behaviors, at the project guidance limit, and eight candidate task slices with named behavior ownership.
  findings: none

## Assessment

The plan is viable only after revision and remains correctly blocked from task creation by D-009/D-010. The most urgent derived-design defect is D-008: its `ExtensionAPI`-keyed WeakMap contradicts Pi 0.80.6 and leaves no working route to produce one combined context, so that coordination mechanism needs redesign before the human rulings can lead to implementable tasks.
