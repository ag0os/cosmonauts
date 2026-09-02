# Security Review: round 1

## Overall

incorrect

## Assessment

The no-tools Pi session and model-output shape checks are appropriately closed, but the durable-state boundary is not safe against project-controlled artifacts or concurrent filesystem changes. The issues below allow consolidation to mutate files outside the selected project, retire unratified bytes, or delete episodes without a validated model result.

## Findings

- id: SR-001
  dimension: injection
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Ancestor symlinks redirect stale-receipt deletion outside the project"
  files: lib/memory/consolidation-receipts.ts, lib/memory/proposal-files.ts, lib/memory/durable-files.ts
  lineRange: consolidation-receipts.ts:38-102; proposal-files.ts:71-99; durable-files.ts:155-159
  summary: |
    `cosmonauts memory consolidate` calls `dischargeStale`, which lists `memory/agent/consolidations`, derives each receipt path lexically, and unlinks stale receipts. The directory check only `lstat`s the final `consolidations` component, while `readSafeRegularText` checks lexical containment and applies `O_NOFOLLOW` only to the final file; neither rejects a symlinked `memory` or `memory/agent` ancestor. A checkout containing `memory -> ../victim/memory` therefore makes the command parse and delete the victim project's receipts with the consolidating process's privileges. A temp-project reproduction using that symlink caused `dischargeStale({ currentDigests: [] })` to remove the external victim receipt.
  suggestedFix: Anchor receipt reads and removals to a canonically contained, symlink-free project directory and reject any ancestor replacement before unlinking.
  task:
    title: "Confine living-memory receipt cleanup to the canonical project root"
    labels: [review-fix]
    acceptanceCriteria:
      - "Receipt listing, reading, and stale discharge reject symlinks in every ancestor component and cannot remove a file outside the canonical project root."
      - "A regression with `project/memory` and `project/memory/agent` symlinked to another tree leaves every external file byte-identical."
      - "Containment remains valid if an ancestor is swapped between validation and removal."

- id: SR-002
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Retirement commits bytes changed after authorization under the old digest"
  files: lib/memory/retirement-store.ts, lib/memory/durable-files.ts
  lineRange: retirement-store.ts:575-594,723-784,806-830; durable-files.ts:89-159
  summary: |
    The retirement path hashes the live record during `candidateConflict`, but later capability probing checks only that the then-current source is a regular same-filesystem file. The transaction subsequently hard-links and unlinks by pathname without rechecking that this file still has the authorized digest or identity. A concurrent editor or filesystem attacker can replace the record after line 727 and before line 578; consolidation then removes the changed human-curated file from the live set and writes a manifest containing the stale digest. A reproduction that changed the source during `assertRemovalSupported` completed successfully, moved the new bytes to `knowledge/retired/`, and recorded the old SHA-256, violating INV-001/INV-002 and D-014.
  suggestedFix: Bind authorization to the exact source file identity and digest through link creation, then verify the linked destination before committing the manifest.
  task:
    title: "Bind retirement authorization to the file actually relocated"
    labels: [review-fix]
    acceptanceCriteria:
      - "Changing or replacing a live record after authorization but before link/manifest commit aborts without removing it from the live set."
      - "The destination identity and full digest are verified against the authorized source before the manifest becomes the commit point."
      - "Ancestor-symlink swaps cannot redirect link or unlink operations outside the canonical project root."

- id: SR-003
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "A planted self-consistent journal bypasses all retirement authority checks"
  files: lib/memory/retirement-store.ts
  lineRange: 834-901,975-1066
  summary: |
    Every mutating invocation runs `recoverJournal` before candidate authorization. Journal parsing verifies only schema and self-consistency with its embedded manifest; the committed branch does not require a current ratified baseline, healthy citation inventory, prior authorized transaction identity, hard-link identity, or the five-retirement cap. An attacker-controlled checkout can supply `.cosmonauts/living-memory-retirement.json`, a byte-equal manifest, and same-byte copies under `knowledge/retired/`; the next `cosmonauts memory consolidate` treats them as committed recovery and unlinks the named live records. A temp-project reproduction removed `knowledge/victim.md` and returned `recovery: "rolled-forward"` without any promotion ledger or retirement candidate.
  suggestedFix: Treat journal contents as untrusted recovery evidence and re-establish bounded retirement authority before any roll-forward unlink.
  task:
    title: "Authenticate and reauthorize retirement journals before recovery mutation"
    labels: [review-fix]
    acceptanceCriteria:
      - "A syntactically valid planted journal/manifest/retired-copy set cannot remove a live record without the required baseline, citation, digest, and transaction evidence."
      - "Recovery enforces the same maximum retirement count and path/identity constraints as a fresh authorized transaction."
      - "Genuine pre-commit and post-commit crash journals still converge without weakening durable-before-remove ordering."

- id: SR-004
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Unbound receipt and proposal artifacts can delete project episodes"
  files: lib/memory/consolidation-receipts.ts, lib/memory/consolidation-proposals.ts, lib/memory/living-memory.ts, lib/memory/consolidation-sources.ts
  lineRange: consolidation-receipts.ts:203-289; consolidation-proposals.ts:547-620; living-memory.ts:694-810; consolidation-sources.ts:213-245
  summary: |
    Accepted-recovery runs before normal `validateJudgmentOutput`. It correlates a project-controlled accepted receipt and proposal only by matching `proposal.key` and an input digest, then calls the episode source finalizer. The receipt is not required to contain that proposal in its normalized output, the key is not recomputed for the current batch, and proposal materialization trusts frontmatter `proposalKind: create`/`outputType: note` without binding the body digest to the receipt. Consequently, a receipt whose output is an empty observations array plus a forged note proposal naming a current episode is enough to durably unlink that episode. A temp-project reproduction produced `kind: "ran"` and deleted the episode with no model call or validated distillation.
  suggestedFix: Validate and cryptographically bind the accepted output, exact proposal content, current batch identity, and episode evidence before recovery can finalize a source.
  task:
    title: "Bind episode pruning recovery to validated accepted output"
    labels: [review-fix]
    acceptanceCriteria:
      - "A proposal absent from the accepted normalized output cannot represent or prune an episode, even when its key and evidence digest match."
      - "Recovery recomputes the current batch identity and validates the full receipt output before any source finalization."
      - "Tampering with proposal kind, output type, body, evidence, or receipt output leaves every episode intact and returns a nonzero failure."
