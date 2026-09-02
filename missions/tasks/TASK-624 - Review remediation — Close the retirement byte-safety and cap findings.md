---
id: TASK-624
title: Review remediation — Close the retirement byte-safety and cap findings
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-620
createdAt: '2026-09-02T19:09:58.094Z'
updatedAt: '2026-09-02T19:09:58.094Z'
---

## Description

An independent codex review of `main...HEAD` returned DO-NOT-SHIP with 8 findings. The coordinator verified findings 1, 2, 3b and the pressure half of 4 directly in the code. Fix all of them. Re-verify the ones marked "verify first" before changing behavior, and if one proves not to be a defect, say so with evidence instead of changing code.

VERIFIED — CRITICAL 1: retirement validation is not bound to the file that is unlinked.
`lib/memory/retirement-store.ts` validates current bytes against the observed digest during authorization (~line 723), but the live path is unlinked (~line 591) after a capability probe, a journal write+sync, per-entry hard-linking, and the manifest write+sync. A concurrent editor performing an ordinary atomic save (write temp, rename) in that window repoints the live name to a NEW inode while the retired hard link still holds the OLD bytes; the unlink then destroys newly authored human bytes that nothing represents. An in-place edit through the hard link instead mutates BOTH names after their digest was recorded, so the "byte-identical relocation" claim and the manifest digest are both false. This violates INV-001 and INV-002.
Fix: immediately before each live unlink, under the same lock, prove the live path still IS the linked, manifested object — verify both (a) that live and its retired destination still share one inode (compare device+inode via a no-follow stat) and (b) that a fresh read of the live bytes still hashes to the manifested digest. Any mismatch must fail closed for that entry and report a conflict rather than unlinking. The pattern already exists in the recovery path (~line 856) which does re-check the digest before unlinking — the main path simply lacks the guard. Apply the same protection to the recovery path's unlink.

VERIFIED — CRITICAL 2: an unconfirmed manifest directory sync is mistaken for a committed transaction.
`recoverJournal` decides `manifestCommitted` with `regularFileEquals(...)` — pure byte visibility. In `lib/memory/durable-files.ts` (~line 188) the manifest is installed with `link()` before `syncDirectory()`; if the link succeeds but the directory sync throws, `writeTextExclusive` throws before `committed = true`, yet the manifest bytes are visible on disk. The next run therefore rolls FORWARD and unlinks the live files, after which a crash can lose the manifest while the live record is already gone. This contradicts the plan's own ratified D-014 ("visibility alone cannot support AC-014's durable-before-remove guarantee") and breaches INV-002.
Fix: rollforward must confirm durability, not visibility. Before any unlink on the recovery path, re-sync the manifest file and its parent directory and only proceed when that sync succeeds; if it fails, do not roll forward. Do not weaken the existing byte-equality check — add the durability confirmation to it.

VERIFIED — HIGH 3b: outlet caps are not enforced across a full model pass.
`lib/memory/living-memory.ts` (~line 629) concatenates deterministic observations with normalized model observations and applies no cap, permitting up to 25 + 25 = 50 against `maxObservations: 25`.

VERIFY FIRST — HIGH 3a: deterministic retirement candidates are passed unsliced (~line 529), so more than `maxRetirements` (5) is reported to make the retirement store throw instead of deferring the excess. Bound it lossily and report the deferred candidates, exactly as TASK-618 did for the proposal cap. Model-output validation must keep failing closed.

VERIFIED — HIGH 4 (pressure half): index pressure is measured from `collected.records` (~line 261), i.e. the already-capped admitted set (50), rather than the complete current project+user metadata set that Design section 3 and D-008 require. This under-counts rendered bytes and makes the `records > 50` rule effectively unreachable. Measure pressure over the complete index, independent of the per-pass admission cap.

VERIFY FIRST — HIGH 4 (starvation half): the corpus source always selects the same sorted prefix, so once those records are represented, the remaining 186 can never enter a later pass; and mixed model passes materialize receipts for all selected digests while not persisting deferred deterministic proposals, so deferred findings can be skipped forever. Ensure a bounded pass cannot permanently starve unadmitted records or permanently suppress a deferred finding.

VERIFY FIRST — HIGH 5: episode pruning has the same check-then-unlink race as CRITICAL 1 (`lib/memory/consolidation-sources.ts` ~line 241). Apply the same immediately-before-unlink identity+digest proof.

VERIFY FIRST — MEDIUM 6: the recovery call acquires and releases the retirement lock BEFORE source collection, model execution, proposal writes, and receipt materialization, so two mutating passes can overlap and race on receipts or duplicate model work. Also, receipt discharge can delete receipts and then surface an error whose outer result claims no writes were committed. Serialize the whole mutating pass under one lock hold, and never report `writesCommitted: false` when writes did occur.

VERIFY FIRST — MEDIUM 7: represented evidence is accumulated as bare digests (~line 178), so byte-identical records at different paths or scopes suppress one another. Key representation on at least scope+path+digest.

VERIFY FIRST — LOW 8: 23 dead-code findings in changed scope (5 unused value exports, 18 unused exported types), including `renderMemoryConsolidateResult`, `COMBINED_CONTEXT_SEPARATOR`, `renderKnowledgeIndexRow`, `guaranteedKnowledgeShareBytes`, plus several duplicated safe-relative-path implementations. Quality Contract gate 7 requires every new export to have a consumer and no duplicated path-safety logic. Remove or wire up dead exports and consolidate the duplicated containment helpers. The index renderer is already correctly centralized — do not touch it.

Binding ratified ground — stop and escalate rather than adjust it: never move, edit, or delete anything under this repository's live `knowledge/`; temp fixtures only; `knowledgeSurface` stays on; no live retirement round; no TTL, OM adoption/fork, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change. Byte authority outranks size pressure. Do not weaken the receipt floor, the frozen byte/doc/source pins, model-output fail-closed validation, or any existing behavior marker to make a fix land.

<!-- AC:BEGIN -->
- [ ] #1 Every live unlink — in both the main retirement path and the recovery path — is immediately preceded, under the same lock, by proof that the live path is still the linked and manifested object: same device+inode as its retired destination via a no-follow stat, AND a fresh read whose digest still equals the manifested digest. Any mismatch fails closed for that entry and reports a conflict instead of unlinking, and a regression test simulates a concurrent atomic replace and an in-place edit between manifest commit and unlink, proving no live bytes are destroyed.
- [ ] #2 Rollforward confirms durability rather than visibility: recovery re-syncs the manifest file and its parent directory before any unlink and refuses to roll forward when that sync fails, satisfying D-014; a regression test covers a manifest that is visible but whose directory sync failed, proving recovery does not unlink on visibility alone.
- [ ] #3 Per-pass outlet caps hold across a full model pass: combined deterministic-plus-model observations never exceed `maxObservations`, deterministic retirement candidates are bounded lossily at `maxRetirements` with the excess reported as deferred rather than thrown, and model-output validation still fails closed on over-cap or invalid batches.
- [ ] #4 Index pressure is measured over the complete current project+user metadata set independent of the per-pass admission cap, per Design section 3 and D-008, and a bounded pass can neither permanently starve unadmitted records nor permanently suppress a deferred deterministic finding.
- [ ] #5 Episode pruning carries the same immediately-before-unlink identity and digest proof as retirement; the whole mutating pass is serialized under one lock hold so two passes cannot overlap on receipts or model work; and no result reports `writesCommitted: false` when writes actually occurred.
- [ ] #6 Represented evidence is keyed on at least scope+path+digest so byte-identical records at different paths or scopes no longer suppress one another.
- [ ] #7 Dead code introduced by this branch is removed or wired to a consumer and duplicated safe-relative-path helpers are consolidated, with the already-centralized index renderer left intact; every new export has a consumer.
- [ ] #8 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every marker B-001..B-021 remain green under their exact existing names and owners; live `knowledge/` and `memory/` stay byte-identical; and a live `bun bin/cosmonauts memory consolidate --dry-run --no-model --json` still completes as `ran` or `noop` writing nothing.
<!-- AC:END -->
