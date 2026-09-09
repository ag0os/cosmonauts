---
id: TASK-629
title: >-
  Review round 6 remediation — Pressure/inventory completeness and truthful
  discharge reporting
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-628
createdAt: '2026-09-04T20:29:46.022Z'
updatedAt: '2026-09-04T20:53:28.655Z'
---

## Description

Round 6 confirmed fixes 3 (judgment byte ceilings) and 4 (dead export), and re-confirmed the byte-safety story: excluding the ratified D-026 class, no interleaving or crash path destroys source bytes other than the verified manifested/represented object. Three findings remain. All are local. One is a regression introduced by round 5's fix.

HIGH 1 — REGRESSION from round 5 (commit c010078): index pressure no longer measures what is actually injected (INV-007 / B-021).
The bounded knowledge reader declines oversized or aggregate-deferred files BEFORE parsing their metadata, and corpus inventory is built only from successfully read records, so pressure is measured from that reduced set. But real combined-context injection calls the store WITHOUT byte ceilings and takes the unchanged full-read branch. A valid record over the per-record ceiling — or one deferred by the aggregate read allowance — therefore appears in the injected index while being absent from pressure measurement, so the regulator can falsely report that the 50-row/guaranteed-share target fits. B-021 requires pressure to be measured over the exact dataset the injection renderer sees.
Fix: the pressure/citation inventory must cover every record that injection would include, independent of the CONTENT byte ceilings. The ceilings exist to bound how many bytes are held in memory for judgment, not to shrink the measured index. Read metadata for every live record for inventory purposes and apply the content ceiling only to the bodies admitted for judgment, so a declined-for-size record still contributes its row and rendered bytes to pressure. Keep the round-5 property that oversized bodies are never fully materialized.

HIGH 2 — receipt discharge can still drop a live input's representation and cause re-judgment (B-016).
Discharge treats `collected.inventory` as a complete existence inventory and deletes a materialized receipt when all its consumed inputs are absent from it. But episode records are skipped before entering inventory once the record or byte limit is exhausted, and corpus files declined at read time never become inventory entries. An unchanged, still-present input can therefore fall outside a bounded pass's inventory, have its receipt deleted, and be re-judged when it re-enters a later pass. The plan requires discharge only when consumed digests genuinely no longer exist, and specifies the receipt exit as `discharged-when-fully-stale`; the current behaviour permits `materialized -> absent` while the consumed input is still live.
Fix: discharge must distinguish "this input no longer exists" from "this input was not admitted to this bounded pass". Only genuine absence from the corpus/episode set may discharge a receipt; cap-skipped, byte-deferred, and represented-but-filtered inputs must all preserve representation. Note the exact three-pass no-change sequence already passes — the gap is on the cap/defer paths, so the regression test must exercise a pass whose limits are exhausted.

MEDIUM 3 — a successful receipt discharge can be reported as `writesCommitted: false` (B-012).
Receipt deletion can durably complete, after which retirement inspection runs; the discharge is not folded into `writesCommitted` until later, and the catch only honours a thrown error's own `writesCommitted` property. If inspection throws in between, an already-committed deletion is reported as false. D-026 explicitly excludes committed-write reporting from its acceptance.
Fix: once a discharge has durably completed, any subsequent failure in the same pass must still report `writesCommitted: true`.

Every commit that changes `lib/memory/types.ts` must re-pin its full-source SHA-256 in the profile-playbooks seam test in the SAME commit; `lib/architecture-map/retrieval.ts` must remain byte-identical with its pin untouched.

Binding ratified ground — stop and escalate rather than adjust it: never move, edit, or delete anything under this repository's live `knowledge/`; temp fixtures only; `knowledgeSurface` stays on; no live retirement round; no TTL, OM, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change. Do not weaken the receipt floor, the frozen pins, retirement/byte authority, the judgment byte ceilings just added, or any existing marker. Do not reopen the D-026 ratified pathname-race class. Confine every change to lib/memory, lib/extensions/knowledge-surface, cli/memory and their tests.

<!-- AC:BEGIN -->
- [x] #1 Index pressure is measured over exactly the dataset combined-context injection would include: a valid record that exceeds the per-record content ceiling, or is deferred by the aggregate read allowance, still contributes its row and rendered bytes to pressure, while its body is still never fully materialized for judgment. A regression test places an oversized-but-valid record in the corpus and proves pressure counts it and that the measured index matches what the injection renderer sees.
- [x] #2 Receipt discharge distinguishes genuine absence from non-admission: cap-skipped, byte-deferred, and represented-but-filtered inputs all preserve their representation, and only inputs whose digests genuinely no longer exist can discharge a receipt. A regression test exhausts a pass's record or byte limits and proves an unchanged live input is neither discharged nor re-judged on a later pass.
- [x] #3 Any pass in which a receipt discharge has durably completed reports `writesCommitted: true`, including when a later step such as retirement inspection throws afterwards.
- [x] #4 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every marker B-001..B-021 remain green under their exact existing names and owners; any commit touching `lib/memory/types.ts` re-pins its SHA-256 in the same commit with `lib/architecture-map/retrieval.ts` byte-identical; live `knowledge/` and `memory/` stay byte-identical; a live dry run still completes as `ran` or `noop` writing nothing; and no file outside lib/memory, lib/extensions/knowledge-surface, cli/memory and their tests is modified.
<!-- AC:END -->
