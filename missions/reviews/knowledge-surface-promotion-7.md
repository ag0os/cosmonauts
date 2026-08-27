---
kind: knowledge-surface-promotion
plan: knowledge-adoption
round: 7
promotedBy: Agustin Calabrese
promotedAt: '2026-08-27T00:00:00Z'
selection: curator-rulings
ratifiedVia: missions/reviews/knowledge-proposal-backlog-dispositions.md
promotedCount: 2
rejectedCount: 7
promotions:
  - from: memory/agent/proposals/orchestration-surface-consolidation/convention-resolve-exact-saved-names-before-permissive-expression-syntax-1c84062e557a.md
    to: knowledge/orchestration-surface-consolidation/convention-resolve-exact-saved-names-before-permissive-expression-syntax-1c84062e557a.md
    sha256: 69b1e0f870faac5ed3820b0e96b5a17b09b3f9b91e59a6f2aeb000bf957201f3
  - from: memory/agent/proposals/main-domain-and-cosmo-rename/convention-qualify-cross-domain-agent-references-not-same-domain-references-b3881bcd6a72.md
    to: knowledge/main-domain-and-cosmo-rename/convention-qualify-cross-domain-agent-references-not-same-domain-references-b3881bcd6a72.md
    sha256: e66f551652df8acec1ee735bfc4f70650187ae4e3905ecfb9885d197c2de91a5
curatedRecords:
  - knowledge/chain-fanout.md
  - knowledge/domain-config.md
  - knowledge/domain-config/9d1c5f3b-7a2e-4c8d-b6f0-4e8a1c3b9d5f.md
  - knowledge/domain-config/5e7a9c1b-3f0d-4e6a-b8c2-2d4f6a8c0b1e.md
  - knowledge/durable-run-store-events.md
  - knowledge/planning-system-hardening.md
rejections:
  - path: memory/agent/proposals/coding-agnostic-framework/decision-define-cli-runnability-by-default-assistant-availability-5469f5261041.md
    sha256: e8279cd3bccd85b363eff3c7171c71ebd2b236c479ed52bb997728704e9ee832
    reason: >-
      merged into knowledge/domain-config.md (combined with the framework-extraction twin; supersedes the infra-domain-guard gotcha)
  - path: memory/agent/proposals/framework-extraction/decision-agent-independent-commands-remain-usable-without-installed-domains-7d2b546acb2f.md
    sha256: 8cdbaf254e7dc5aabf90e46d99a4a148e613865f9143b3a85e013545542b9c4b
    reason: >-
      merged into knowledge/domain-config.md (combined with the coding-agnostic-framework twin)
  - path: memory/agent/proposals/domain-authoring/convention-domain-prompt-directories-contain-personas-only-da50fed4900e.md
    sha256: 20401b10d211423e0a62fff091e1f23ee7a597ce791f7ec3a3951a7c8fa19226
    reason: >-
      merged into knowledge/domain-config.md
  - path: memory/agent/proposals/package-system/decision-treat-shared-as-a-special-final-fallback-d14e3bfecbf8.md
    sha256: cfa1290063d9a20d7820ee67a7107db007064ecbe59ac82a87090a1e64ac001d
    reason: >-
      superseded by the personas-only prompt-ownership model; its shared-resolves-last ordering is covered by the merged three-tier rule
  - path: memory/agent/proposals/driver-primitives/decision-persist-events-before-publishing-live-notifications-629cf67176df.md
    sha256: 24aeab097e7f62fb53886063ff55f4e0262f5e9133bcd689e9dc6988df2f89b2
    reason: >-
      merged into knowledge/durable-run-store-events.md with the per-stream distinction made explicit
  - path: memory/agent/proposals/drive-smoke-fixes/trade-off-bound-event-text-while-preserving-cursor-based-recovery-68ae5aac0e38.md
    sha256: 130bc7e791145da1933b7955b800226f6fd00726a35f32232d1dc5b524b77bee
    reason: >-
      merged into knowledge/durable-run-store-events.md, reframed to agree with memory-hardening details-visibility
  - path: memory/agent/proposals/dialogic-planner/decision-run-independent-review-lenses-as-a-parallel-panel-57f3c2303050.md
    sha256: 821b06462afc8bcba774d31f4645f8c7c686627e8d28fd60be3a28b8996ec2ac
    reason: >-
      merged into knowledge/planning-system-hardening.md carrying the on-demand-not-standing qualifier
---

# Knowledge surface — rulings round

## Decision

Resolves the 9 RULING dispositions from the ratified table, per the owner's
2026-08-27 per-ruling approval (all 8 open rulings approved as recommended;
rulings 9-10 were already discharged by the drop and merge rounds):

1. chain-fanout resolution precedence — the proposal documenting the shipped
   name-first behavior is promoted, and `knowledge/chain-fanout.md` is
   amended with the correction on record.
2. Cross-domain qualification — promoted; the two stale "qualified IDs
   exclusively" atomics in `knowledge/domain-config/` carry correction notes.
3. CLI runnability — the two twin proposals merge into one statement in
   `knowledge/domain-config.md`, superseding the byte-pinned
   infrastructure-domain-guard gotcha (which stays frozen as history).
4. Personas-only prompt ownership wins over shared-as-final-fallback; the
   loser is rejected as superseded.
5. Duplicate-domain-ID reconciliation recorded as one sentence in
   `knowledge/domain-config.md`.
6-7. Persist-before-publish and bounded-event-text merge into
   `knowledge/durable-run-store-events.md` with per-stream policy and
   details-visibility reconciled in the wording.
8. The reviewer-lens panel merges into
   `knowledge/planning-system-hardening.md` with its on-demand qualifier.

Byte-pinned promoted records are never edited; every curated-body edit in
this round is listed in `curatedRecords`. Executed by the session agent on
the owner's explicit approval.
