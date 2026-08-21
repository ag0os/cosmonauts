---
id: TASK-566
title: 'Stage 7B: Record the separate human backfill approval gate'
status: Done
priority: high
labels:
  - testing
  - 'plan:knowledge-surface'
dependencies:
  - TASK-565
createdAt: '2026-08-19T18:36:16.508Z'
updatedAt: '2026-08-21T15:26:55.960Z'
---

## Description

Perform the plan’s separate human-only Stage 7B gate after machine GREEN. This checkpoint owns no B-### behavior and is not a worker RED→GREEN implementation step. A human reviews the proposal diff and writes `missions/reviews/knowledge-surface-backfill-approval.md`; workers and agents must not self-approve.

INV-1, INV-5, INV-6, D-016, and D-020 keep promotion human-only, require distilled/non-verbatim attributable records, and separate approval from the batch. Approval itself never promotes. Any reject, absence, or digest mismatch blocks Stage 8 and routes to cleanup/rerun rather than weakening the gate. The project gate remains OFF by default.

<!-- AC:BEGIN -->
- [x] #1 A human-authored approval artifact records the planned kind/plan, reviewer identity and time, review-index digest, aggregate proposal-set digest, `decision: approve | reject`, no-verbatim attestation, and any rejected proposal paths with reasons.
- [x] #2 The recorded review-index and proposal-set digests match the Stage 7A machine-GREEN artifacts and the human inspection covers every indexed proposal without promoting any file into project or user `knowledge/`.
- [x] #3 Only a matching human `approve` decision satisfies this gate and unlocks Stage 8; reject, missing artifact, digest mismatch, or failed no-verbatim review leaves the gate incomplete and requires the planned cleanup/rerun path.
- [x] #4 The checkpoint changes no source code, runtime config, shipped skill/prompt, proposal identity, default gate state, excluded feature, or human-only promotion boundary.
<!-- AC:END -->

## Implementation Notes

Human gate satisfied 2026-08-21. Reviewer Agustin Calabrese approved all 164 proposals across 19 slugs and attested the INV-5 no-verbatim finding. Approval artifact missions/reviews/knowledge-surface-backfill-approval.md binds reviewIndexDigest e61eaf52... and aggregateProposalDigest f22ae61f..., both verified against the live Stage 7A artifacts. Approval is not promotion: knowledge/ untouched, gate remains OFF. The reviewer authored the decision and attestation; the coordinating agent transcribed and filled mechanical fields only.
