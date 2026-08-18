# Plan Review: knowledge-surface

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "The ExtensionAPI-keyed WeakMap cannot coordinate the three injectors"
  plan_refs: D-008, Design §2, Design §5, Design §8, B-007, Risk R-005
  code_refs: node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:171-176, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:345-358, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:375-383, domains/shared/extensions/agent-memory/index.ts:260-306, domains/shared/extensions/architecture-memory/index.ts:111-145
  description: |
    The plan stores `KnowledgeSurfaceSessionPolicy` in a module-local `WeakMap` keyed by the selected adapter's `ExtensionAPI`, then expects agent-memory and architecture-memory to read it through their APIs. Pi 0.80.6 creates a separate extension object and a fresh API object for every loaded factory. The APIs share a runtime and event bus, but not object identity, so a value stored under the knowledge adapter's API cannot be retrieved using either existing injector's API.

    Both existing extensions also retrieve and return their context sections privately. The plan specifies suppression but no working cross-extension section handoff to the one allocator. Implemented literally, the old injectors fail to see policy and exceed the 24,000-byte bound, or an invented suppression path removes memory/map content without supplying it to the aggregator. D-008 is derived ground and needs an on-record correction against Pi's actual shared seam before tasks are created.

- id: PR-002
  dimension: risk-blast-radius
  severity: high
  title: "Enabled Pi package hosts have no path to the every-agent knowledge surface"
  plan_refs: Architecture Context, D-008, D-010, B-005, B-006, B-012, Design §2, Quality Contract assertions 3 and 5
  code_refs: package.json:7-10, lib/agents/session-assembly.ts:131-145, node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js:238-278, node_modules/@earendil-works/pi-coding-agent/dist/core/package-manager.js:330-389
  description: |
    B-012 correctly recognizes that a Pi host can load this package's declared `./domains/shared/extensions` root without Cosmonauts session assembly. The design deliberately places every knowledge adapter under `lib/extensions/` and makes `buildSessionParams` the only selector. A package host therefore stays free of the gated adapters when OFF, but it also receives no index or `recall` when the project gate is ON because it never calls `buildSessionParams` and the package manifest does not expose an enabled adapter.

    This leaves a user-visible agent surface outside the literal “every agent” guarantee in INV-2 and AC-003. The planner must either define and test an enabled package-host loading path or ask the human to exclude package-host agents. The latter changes ratified INV-2/AC-003 and must be escalated rather than patched as implementation detail.

- id: PR-003
  dimension: state-sync
  severity: medium
  title: "Reload and new-session flows reuse the old gate-selected extension set"
  plan_refs: D-008, B-008, Design §2, Files to Change session-assembly entry
  code_refs: cli/session.ts:526-548, cli/session.ts:570-620, cli/session.ts:632-654, node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session-runtime.js:104-137, node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js:220-278
  description: |
    The plan promises that a gate edit takes effect after session “recreation/reload,” and B-008 specifically says an explicit session reload is the transition. `createSession` currently computes `params` and `resourceLoaderOptions` once outside the runtime factory. The ordinary factory branch reuses those options for later session creation; only the pending `/agent` switch branch reruns `buildSessionParams`. Pi resource reload reloads the already-selected `additionalExtensionPaths`; it does not call Cosmonauts assembly to add an adapter omitted while OFF or remove one selected while ON.

    Thus false→true reload/new remains OFF and true→false reload/new remains ON until a process restart or agent switch. Specify the actual supported transition or add a real reassembly seam and test both directions. This is derived lifecycle behavior and can be amended on record without weakening the OFF-default acceptance criterion.

- id: PR-004
  dimension: behavior-spec
  severity: medium
  title: "The migration matrix still assigns reserved source and type keys twice"
  plan_refs: B-003, Design §3, Design §6, Quality Contract assertion 1
  code_refs: memory/memory-interface.md:1-5, lib/sessions/types.ts:8-32, lib/sessions/knowledge.ts:21-42
  description: |
    The new OKF schema reserves top-level `source` for provenance and top-level `type` for the four knowledge variants. Design §6 also requires each markdown record's original `source` and each JSONL record's original `type` to survive as custom legacy keys, but it does not name non-colliding destination keys. For example, `memory/memory-interface.md` already has `source: archive`, while the migration row assigns `source: memory/memory-interface.md`; a JSONL `rationale` record similarly needs both mapped `type: decision` and preserved original `type: rationale`.

    YAML cannot represent both meanings under the same key reliably. A worker must invent aliases or lose a frozen field, so B-003 is not directly authorable from the claimed “complete” matrix. Name the exact destination keys. Dropping either value would narrow ratified AC-002 provenance preservation and requires human escalation.

- id: PR-005
  dimension: lifecycle-invariant
  severity: medium
  title: "Volatile provenance makes deterministic proposal retries non-idempotent"
  plan_refs: D-011, Design §3, Design §4, B-002, B-010, Quality Contract assertion 2
  code_refs: lib/memory/types.ts:12-23, lib/memory/markdown-store.ts:119-161
  description: |
    The proposal filename key hashes `planSlug`, type, title, content, and source, while `date` defaults to `now().toISOString()` and the record also requires a timestamp. The store then treats only byte-identical occupants as idempotent and refuses a non-identical occupant. Repeating the same tool call without `sourceDate` therefore selects the same path but renders different provenance bytes on each attempt; the second call is rejected rather than deduplicated. An interrupted backfill resumed later has the same failure mode for already-landed proposals.

    Existing episode writes only deduplicate when the rendered bytes, including timestamp, are stable. The plan must align identity, timestamp/date derivation, and occupant semantics so a realistic retry has a defined result. This is a contradiction in derived mechanism, not a reason to weaken provenance.

- id: PR-006
  dimension: constraint-ownership
  severity: medium
  title: "Backfill restoration and human approval have no executable owner"
  plan_refs: D-013, B-010, Design §7, Files to Change backfill entry, Quality Contract assertion 6, Implementation Order stage 7
  code_refs: bundled/coding/agents/distiller.ts:3-16, domains/shared/skills/archive/SKILL.md:145-181, tests/prompts/archive-skill.test.ts:1-14, .cosmonauts/config.json:1-26
  description: |
    B-010 requires a temporary batch whose failure/cancellation path restores config byte-for-byte and whose output cannot be accepted before recorded human approval. The current substrate is a declarative distiller plus manual `spawn_agent` guidance. The Files to Change list adds proposal records and an unnamed “review index,” but no callable batch artifact whose failure can be induced by the named test, and it gives no path or schema for approval evidence.

    A static prompt/artifact test can prove final files and counts; it cannot prove `finally` restoration after cancellation or define when the task may close. Assign these guarantees to an explicit implementation seam and approval artifact before decomposition. Deferring them to the integrated gate would leave the ratified no-verbatim boundary and OFF-default restoration without task-local ownership.

- id: PR-007
  dimension: behavior-spec
  severity: medium
  title: "Post-archive distillation can still omit the archived transcripts"
  plan_refs: B-009, B-010, Design §7, Files to Change distiller/archive entry
  code_refs: lib/plans/archive.ts:116-127, bundled/coding/prompts/distiller.md:34-68, domains/shared/skills/archive/SKILL.md:145-181
  description: |
    `archivePlan` moves `missions/sessions/<slug>/` to `missions/archive/sessions/<slug>/` before the archive guidance tells the user to spawn the distiller. The current distiller and archive skill nevertheless name only the active manifest/transcript path, so a normal post-archive invocation silently falls back to plan/tasks and misses available Tier-2 transcripts.

    B-009's context says archived artifacts and filtered Tier-2 transcripts are provided, but its expected result and named test only constrain proposal format and content rules. Add the active/archive discovery outcome to a behavior and test so output-rule changes cannot pass while transcript discovery remains stale. Correcting these two active texts is already within the human-ratified D-009 correction allowlist.

## Missing Coverage

- No working testable transport coordinates policy and section content across the three distinct Pi extension APIs.
- No enabled package-host behavior proves an externally loaded Pi package agent receives the index and `recall`.
- No test covers OFF→ON and ON→OFF edits through both resource reload and new-session flows.
- No retry case repeats an identical proposal without `sourceDate` after time advances or after a partial backfill.
- No exact non-colliding names are specified for legacy markdown `source` and JSONL `type`.
- No callable batch seam or defined approval-record path/schema owns config restoration and the human review stop.
- No active-versus-archived manifest/transcript fallback is required by B-009/B-010.
- The exact 36 markdown, 10 bundle, and 19 missing-slug inventories could not be independently enumerated with the available read-only capabilities; the planned frozen inventory remains the intended executable proof.
- The plan does not state sequencing with the separate active `coding-extraction` plan, which intends to remove `bundled/` while D-014 and several file owners remain under `bundled/coding/`.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared the proposed MemoryStore changes, Pi extension identity/runtime behavior, existing injector contracts, session assembly, and proposal identity against current signatures.
  findings: PR-001, PR-005
- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports duplication unbound with reason `execution-not-consented` for provider `fallow`; project-wide structural duplication could not be established.
  findings: none
- dimension: state-sync
  status: checked
  checked: Traced gate resolution through initial, switched, reloaded, new, spawned, and package-host sessions, plus proposal retry state.
  findings: PR-001, PR-003, PR-005, PR-006
- dimension: risk-blast-radius
  status: checked
  checked: Walked package auto-loading, OFF/ON transitions, migration, backfill recovery, post-archive distillation, and the active coding-extraction collision.
  findings: PR-001, PR-002, PR-003, PR-006, PR-007
- dimension: user-experience
  status: checked
  checked: Walked enabled package-host use, config edits, reload/new-session behavior, proposal retries, human review, and post-archive distillation.
  findings: PR-002, PR-003, PR-005, PR-006, PR-007
- dimension: behavior-spec
  status: checked
  checked: Reviewed all 12 behaviors for AC links, concrete expected outcomes, executable seams, named test files, edge cases, and direct authorability.
  findings: PR-002, PR-004, PR-006, PR-007
- dimension: architecture-record
  status: unchecked
  checked: Read both declared architecture records and manually checked their relevant rulings, but `analysis_status` reports boundary-conformance unbound (`execution-not-consented`, provider `fallow`) and the generated architecture map is missing, so project-wide conformance was not established.
  findings: PR-002
- dimension: quality-contract
  status: checked
  checked: Reviewed the abstract ladder and plan-specific assertions against extension identity, package hosts, migration preservation, retries, backfill failure, and transcript discovery.
  findings: PR-001, PR-002, PR-004, PR-005, PR-006, PR-007
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked OFF/ON exits, extension policy identity, proposal occupant/retry behavior, config restoration, package loading, migration collisions, and archive relocation.
  findings: PR-001, PR-003, PR-005, PR-006, PR-007
- dimension: constraint-ownership
  status: checked
  checked: Traced every-agent retrieval, provenance preservation, no-verbatim review, OFF-default restoration, and archived-input obligations into behavior/task owners.
  findings: PR-002, PR-004, PR-006, PR-007
- dimension: scope-size
  status: checked
  checked: The plan has exactly 12 behaviors, at the project guidance limit, and eight candidate task slices; no size finding is required.
  findings: none

## Assessment

The plan remains viable with substantial revision, but it is not ready for task creation. Fix the cross-extension coordination contract first: the current WeakMap premise is false in Pi 0.80.6 and leaves the central combined-budget behavior unimplementable; then resolve the ratified every-agent package-host gap before decomposition.
