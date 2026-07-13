# Plan Review: profile-playbooks

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "The inherited context hook removes the current memory injection before the model sees it"
  plan_refs: B-003, B-010, B-013, B-016, Design > Retrieval injection and budget accounting
  code_refs: missions/plans/profile-playbooks/spec.md:32-39, missions/plans/profile-playbooks/spec.md:64-69, domains/shared/extensions/agent-memory/index.ts:168-212, tests/extensions/agent-memory.test.ts:336-407, node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:857-877, node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js:220-226, node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:171-181
  description: |
    The authoritative spec requires the profile and playbook index to be demonstrably present in Cosmo's model context. Pi appends the `before_agent_start` custom message to the prompt message batch, then invokes `transformContext` immediately before conversion to the provider payload. The shipped `context` handler filters every message whose `customType` is `agent-memory-context`, so it removes the newly returned message as well as older copies. The W1 test misses this because it asserts the `before_agent_start` return and invokes `context` separately with only an old message.

    The plan says this hook “continues removing older” messages but does not prescribe how the current message survives. Revise B-003/B-016 and the design to retain exactly the newest current-turn `agent-memory-context` while removing prior copies. Add a no-model pipeline test that combines an old context message, the current `before_agent_start` result, and a user message, passes them through `context`, and asserts the current profile/index is provider-visible. Add this fault to the mutation gate.

- id: PR-002
  dimension: state-sync
  severity: high
  title: "Pi's default parallel tool execution can bypass playbook collision confirmation"
  plan_refs: B-009, D-006, Design > Extended remember, Cost state and failure ownership
  code_refs: missions/plans/profile-playbooks/spec.md:80-91, domains/shared/extensions/agent-memory/index.ts:94-128, node_modules/@earendil-works/pi-agent-core/dist/types.d.ts:205-219, node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:222-283, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:352-362, lib/memory/markdown-store.ts:348-365
  description: |
    Pi 0.80.6 defaults a tool batch to parallel execution unless a tool declares `executionMode: "sequential"`. Two same-name `remember` calls in one assistant message can therefore both preflight an absent playbook and then execute concurrently; the second write can replace the first without ever returning `confirmation_required`. The W1 temp name also uses only PID plus `Date.now()`, so simultaneous writes to one path can contend for the same temp file. This is normal Pi same-turn behavior, not the spec's excluded cross-process concurrent-writer problem.

    Revise the extension contract to register the mutating `remember` tool as sequential, record that Pi decision in B-001, and add a targeted same-batch/same-canonical-name test proving an unconfirmed sibling call cannot overwrite the first. No `lib/memory/types.ts` change is needed.

- id: PR-003
  dimension: user-experience
  severity: high
  title: "Oversized human profiles have no safe replacement flow"
  plan_refs: B-004, B-017, D-004, Design > Unchanged shared contract, Risk > Profile complete replacement can lose stale content
  code_refs: missions/plans/profile-playbooks/spec.md:55-69, missions/plans/profile-playbooks/spec.md:96-103, lib/memory/types.ts:13-25, domains/main/prompts/cosmo.md:44-49
  description: |
    The plan accepts a human-owned profile larger than 4,000 bytes, injects only a 4,000-byte excerpt, and defines every profile write as complete replacement. It then says Cosmo should preserve the profile using the injected body. Implemented literally, Cosmo can append a change to the excerpt and silently delete the unseen tail. If Cosmo first recalls the full oversized profile and preserves it, the same plan requires the write to be rejected for exceeding 4,000 bytes. The current interface has only one complete `content` field and no patch/version precondition that could repair this mechanically.

    Revise the prompt/UX and B-017 without widening the shared interface: a truncation notice must never be treated as an update source; Cosmo must recall the full profile first, and the plan must define what the user observes when the complete desired replacement remains over the bound (for example, no write and an explicit request to shorten or intentionally replace it). Add coverage that an attempted update from an oversized human profile leaves the existing file unchanged.

- id: PR-004
  dimension: lifecycle-invariant
  severity: medium
  title: "Human rename semantics leave the old playbook name simultaneously searchable, blocked, and undefined"
  plan_refs: B-008, B-009, B-014, D-003, Design > Store layout and OKF records
  code_refs: missions/plans/profile-playbooks/spec.md:84-96, lib/memory/markdown-store.ts:299-322
  description: |
    The plan makes the current frontmatter title the canonical identity while preserving the old resource/path after a human title edit. Existing retrieval matches `resource` as searchable text. After `release.md` is retitled to “Shipping,” the old “release” name can still recall the record through its resource, but a new “Release” playbook cannot use the canonical target because that path is occupied by the differently named valid record. If a second human edit creates two equal current titles, the plan defines only write refusal; it does not define retrieval, injection, or warning behavior for the ambiguous identity.

    Revise D-003/B-014 to define whether the old key is a reserved alias or is freed, whether old-resource text remains a supported recall alias, and how duplicate human-edited canonical titles appear in retrieval/injection. Add tests for save and recall by both old and new names and for two manually colliding titles; do not leave these choices to the worker.

- id: PR-005
  dimension: behavior-spec
  severity: medium
  title: "The conversational-confirmation behaviors claim proof the planned tests cannot provide"
  plan_refs: B-006, B-007, B-009, Implementation Order 4 and 6
  code_refs: missions/plans/profile-playbooks/spec.md:77-84, missions/plans/profile-playbooks/spec.md:235-242, tests/domains/main-domain.test.ts:138-160, tests/helpers/mocks/extension-api.ts:24-69
  description: |
    The spec deliberately makes proposed-save confirmation conversational rather than an approval state machine. A static prompt assertion cannot prove that a model calls `remember` only after assent, and an extension test in which “no save tool call occurs” is vacuous: no registered lifecycle handler writes a proposal, so doing nothing necessarily changes nothing. “Cosmo does not repeat the proposal automatically” is also model behavior, not observable extension behavior in a no-model suite. Inspecting whether a closure field exists would test implementation rather than behavior.

    Revise B-006 to claim prompt-contract evidence only. Revise B-007 to test the enforceable boundary: lifecycle events without a tool call leave filesystem/store-factory calls and `MockPi.entries` unchanged, and collision refusal in B-009 persists no entry. Keep “do not nag/repeat” as explicit prompt guidance rather than claiming executable proof.

- id: PR-006
  dimension: behavior-spec
  severity: medium
  title: "The malformed-record behavior does not cover the full fixed-location type matrix"
  plan_refs: B-012, D-002, Design > Module boundaries, Design > Store layout and OKF records
  code_refs: missions/plans/profile-playbooks/spec.md:111-118, lib/memory/okf.ts:25-74, lib/memory/markdown-store.ts:258-299
  description: |
    W1 is safe because `parseAuthoredNote` rejects every non-`note` file under the recursively scanned `notes/` tree. W2 replaces that parser with a generic authored-record union. Although design prose mentions location-specific validation, B-012 tests wrong types only in the reserved profile/playbook locations. A literal generic parser can consequently admit a valid user `profile` or `playbook` placed under `notes/`, creating an extra profile or defeating stable playbook layout. Reusing W1's recursive file walker for `playbooks/` can also silently expand the declared direct-child layout.

    Revise B-012 into an explicit location/type matrix: preserve recursive note discovery but accept only `note` there; accept `profile` only at the user reserved path; define whether playbooks are direct children and reject/warn on every other type/location combination. Add mutation cases for a profile/playbook under `notes/` and a note under `playbooks/`.

- id: PR-007
  dimension: behavior-spec
  severity: medium
  title: "The combined-budget algorithm does not guarantee that all required truncation notices survive"
  plan_refs: B-016, B-017, Design > Retrieval injection and budget accounting, Risk > Profile starves the index
  code_refs: missions/plans/profile-playbooks/spec.md:99-105, domains/shared/extensions/agent-memory/index.ts:573-622, tests/extensions/agent-memory.test.ts:444-529
  description: |
    The shipped helper budgets one header, one content excerpt, and one footer. W2 can require two independent notices at once: an oversized human-profile notice with original/included sizes and an index-truncation notice. “Run one truncation pass” does not say how footer bytes are reserved; a final cut over the combined string can remove either notice while still satisfying only the 12,000-byte assertion. Existing W1 tests cover one footer at a time.

    Revise the design to prescribe footer reservation and section priority before excerpts are cut. Split/add a case with a multibyte oversized human profile and oversized index together, asserting profile-first order, every applicable notice and `recall` direction, accurate byte counts, no replacement character, and a final size at most 12,000 bytes.

- id: PR-008
  dimension: interface-fidelity
  severity: medium
  title: "Type-specific validation outcomes are not mapped onto the unchanged write-result union"
  plan_refs: B-002, B-008, B-017, B-018, D-006, Design > Extended remember
  code_refs: lib/memory/types.ts:53-69, lib/memory/markdown-store.ts:46-61, lib/memory/markdown-store.ts:89-101
  description: |
    `MemoryWriteResult` has only `written`, `unsupported`, and `failed`; there is no invalid-draft or collision arm, and changing that file is correctly a stop signal. The plan nevertheless says the store rejects wrong type/scope/kind, an empty canonical key, an oversized profile, ambiguous title matches, and an occupied default path without specifying which existing result each public-store case returns. It separately promises extension-level `invalid_request`, `confirmation_required`, and visible filesystem failure results. Workers would have to invent this contract.

    Add a type-specific outcome table to Design and corresponding assertions: distinguish extension validation from store validation, logical occupied/ambiguous conflicts from filesystem failures, and unsupported draft combinations, all using the existing union. Explicitly state that any case that cannot be represented without editing `lib/memory/types.ts` triggers the required stop-and-report path.

- id: PR-009
  dimension: behavior-spec
  severity: medium
  title: "Several named test homes cannot observe their stated expected results"
  plan_refs: B-011, B-014, B-017, B-018, Files to Change
  code_refs: tests/memory/markdown-store.test.ts:139-187, tests/extensions/agent-memory.test.ts:336-407, domains/shared/extensions/agent-memory/index.ts:342-480
  description: |
    B-014 promises absence from the injected index and `recall`, but its named test is store-only. B-018 promises a visible tool result and a continuing session, but its named test is also store-only. B-017 combines store rejection, human disk editing, injection truncation, full tool recall, and the combined budget into one test intent while naming the store as its seam. B-011 similarly says stores “retrieve/inject” while assigning only a store test.

    Revise the behavior spine so each test can directly author its expected observation: keep atomic/no-partial assertions in store tests, add extension-level visible-failure and human-rename/delete injection/recall tests, and split B-017's store bound from its extension injection/recall behavior with separate IDs/markers. The existing file inventory already contains both test files, so this does not require a new production abstraction.

- id: PR-010
  dimension: interface-fidelity
  severity: low
  title: "The Pi-First recommendation omits Pi's actual confirmation and execution-order primitives"
  plan_refs: B-001, Implementation Order 1
  code_refs: package.json:33-37, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:67-73, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:203-211, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js:82-103, node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:352-362
  description: |
    The four packages are correctly pinned to 0.80.6, and Pi has no mutable long-term profile/playbook store. It does, however, expose `ctx.ui.confirm`, mode/`hasUI`, a non-UI confirmation fallback of `false`, and per-tool `executionMode`. B-001 says it audits save-confirmation primitives, but its planned recommendation names neither the UI primitive nor the execution-order primitive that directly affects B-009.

    Revise B-001's required evidence to evaluate both explicitly: explain why conversational confirmation remains authoritative across TUI/RPC/print/json instead of adopting `ctx.ui.confirm`, and record the sequential-write decision required by PR-002.

- id: PR-011
  dimension: quality-contract
  severity: medium
  title: "The Quality Contract is out of canonical gate order and omits the highest-risk mutations"
  plan_refs: Quality Contract
  code_refs: domains/shared/skills/work-artifacts/references/gate-contracts.md:5-13, domains/shared/skills/work-artifacts/references/gate-contracts.md:47-55
  description: |
    The canonical ladder orders `mutation` before `complexity` and `boundary-conformance`; this plan places boundary conformance before mutation. More importantly, the mutation threshold omits the current-message context-filter fault, parallel same-name saves, wrong type in the notes location, old-name behavior after human rename, duplicate human titles, and simultaneous profile/index footer survival. Those are the realistic faults most likely to falsify the plan's central invariants.

    Reorder the applicable abstract gates and add those negatives to the mutation threshold. Keep unbound complexity/dead-code degradation explicit and do not add concrete command/tool columns.

- id: PR-012
  dimension: lifecycle-invariant
  severity: low
  title: "Playbook-save scan cost is understated"
  plan_refs: Design > Store layout and OKF records, Design > Cost state and failure ownership, Risk > Per-turn scans grow expensive
  code_refs: lib/memory/markdown-store.ts:82-89, lib/memory/markdown-store.ts:230-240
  description: |
    The per-turn injection estimate is honest, but a playbook save is not merely one additional preflight scan. The design requires an extension preflight scan, a store-side current-title/conflict scan for non-extension callers, and notes-plus-playbooks index regeneration; the shipped regeneration path itself rescans the store. At the accepted dozens-of-records scale this is probably fine, but the reassess evidence would otherwise undercount recurring write cost.

    Revise the cost section to state the worst-case scans per playbook save, or prescribe reuse of one store scan where correctness permits. Keep the no-cache stance and hundreds-of-records reassess trigger unchanged.

## Missing Coverage

- The persisted browsing-index format is undecided: current `renderIndex()` writes `type: note-index` and “No valid authored notes,” while W2 says it indexes notes plus playbooks. Specify whether those strings remain for compatibility or change, and test/document the choice (`lib/memory/markdown-store.ts:240-271`).
- The optional playbook `description` has no defined default even though valid OKF requires a string. State the deterministic default so a worker does not invent it.
- Add an explicit assertion that all W2 revisions above remain inside the listed files. If testing `executionMode` requires changing `tests/helpers/mocks/extension-api.ts`, add that file to `Files to Change`; otherwise inspect the captured registration without widening the helper.
- No code evidence requires changing `lib/memory/types.ts`; its string `type`/`recordTypes` seams and existing result union remain usable if PR-008 is resolved. Any implementation pressure to edit it remains the spec-mandated stop signal.

## Assessment

The plan is viable with revisions and does not currently require shared-interface rework or premature registry machinery. The first issue to fix is the Pi context pipeline: as written, the inherited filter removes the very profile/index message the acceptance criteria require Cosmo to receive.
